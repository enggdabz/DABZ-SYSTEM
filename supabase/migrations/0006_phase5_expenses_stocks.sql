-- Phase 5: expenses, stocks and supplier payables (spec 11, 14, 17.14, 17.15).
--
-- DECISIONS MADE HERE, recorded in docs/DECISIONS.md:
--   * Quick-pick expenses are seeded as the SPEC'S OWN categories with no
--     amounts (open decision 17.14). The owner's real shopping list and usual
--     prices are figures only they can know.
--   * No stock items are seeded at all (17.15). An invented reorder level would
--     raise confident warnings on the wrong day.
--   * A stock level is NEVER stored. It is added up from the movements, the
--     same way a payslip adds up its own rows, so the number on the screen can
--     always be explained by the history underneath it.
--   * A movement is never edited or deleted. A mistake is corrected with an
--     opposite movement, exactly as a ledger entry is voided rather than erased.
--
-- Quantities are WHOLE THOUSANDTHS of a unit, for the same reason money is
-- whole centavos: 20 reams is 20000, 2.5 litres is 2500. Adding decimals
-- drifts, and a stock level is nothing but a long addition.

-- ---------------------------------------------------------------------------
-- Suppliers (spec 11, 14)
-- ---------------------------------------------------------------------------

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_number text,
  address text,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.suppliers is
  'Who the shop buys from. Deactivated rather than deleted, so old purchases keep their name.';

create unique index if not exists suppliers_name_idx
  on public.suppliers (lower(name));

-- ---------------------------------------------------------------------------
-- Quick-pick expenses (spec 11, open decision 17.14)
-- ---------------------------------------------------------------------------
-- The whole point of the expense pop-up is that it takes under ten seconds.
-- Anything slower gets written on a scrap of paper "for later", and the month
-- ends up looking more profitable than it was.

create table if not exists public.expense_presets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  category text not null,
  tag text not null
    check (tag in ('printshoppe', 'apparel', 'dabztech', 'whole_shop')),

  -- Null means "ask me every time". NOT zero: an amount is a figure only the
  -- owner can know, and a wrong default would be typed past without reading.
  default_amount_centavos bigint check (default_amount_centavos > 0),

  supplier_id uuid references public.suppliers (id) on delete set null,
  sort_order smallint not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

comment on column public.expense_presets.default_amount_centavos is
  'The usual amount, when there is one. Null means the pop-up asks every time.';

create index if not exists expense_presets_order_idx
  on public.expense_presets (active, sort_order, label);

-- ---------------------------------------------------------------------------
-- Expenses (spec 11, and the staff limit from spec 4.3)
-- ---------------------------------------------------------------------------
-- An expense is its own record, and the ledger entry is what it produces -
-- the same shape as a sale. That is what lets a staff member's large purchase
-- sit and wait for the owner WITHOUT any money having moved yet.

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),

  occurred_at timestamptz not null default now(),
  -- The Manila calendar date, so a day's costs never split across a timezone.
  spent_on date not null,

  amount_centavos bigint not null check (amount_centavos > 0),
  category text not null,
  tag text not null
    check (tag in ('printshoppe', 'apparel', 'dabztech', 'whole_shop')),
  source text not null
    check (source in ('cash_drawer', 'gcash', 'maya', 'bank', 'owners_pocket')),

  supplier_id uuid references public.suppliers (id) on delete set null,
  note text,

  status text not null default 'approved'
    check (status in ('approved', 'pending', 'rejected')),

  -- Set only once the money has actually reached the ledger. A pending expense
  -- has none, which is the point: nothing is counted until it is approved.
  ledger_entry_id uuid references public.ledger_entries (id) on delete set null,

  decided_by uuid,
  decided_at timestamptz,
  decision_note text,

  created_at timestamptz not null default now(),
  created_by uuid,

  -- An approved expense must have put its money somewhere, and a pending or
  -- rejected one must not have.
  constraint expenses_ledger_matches_status check (
    (status = 'approved' and ledger_entry_id is not null)
    or (status <> 'approved' and ledger_entry_id is null)
  )
);

comment on table public.expenses is
  'Shop purchases. A staff expense above the settings limit waits for the owner before any money is counted.';

create index if not exists expenses_date_idx on public.expenses (spent_on desc, occurred_at desc);
create index if not exists expenses_status_idx on public.expenses (status, occurred_at desc);
create index if not exists expenses_creator_idx on public.expenses (created_by, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Stock items and movements (spec 14, open decision 17.15)
-- ---------------------------------------------------------------------------

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- How the owner measures it: ream, litre, piece, pack of 100.
  unit text not null,
  tag text not null default 'whole_shop'
    check (tag in ('printshoppe', 'apparel', 'dabztech', 'whole_shop')),

  -- Both null until the owner says. Neither is guessed: a made-up reorder
  -- level warns on the wrong day, and a made-up cost misvalues the shelf.
  reorder_level_thousandths bigint check (reorder_level_thousandths >= 0),
  unit_cost_centavos bigint check (unit_cost_centavos >= 0),

  photo_path text,
  supplier_id uuid references public.suppliers (id) on delete set null,
  note text,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.stock_items is
  'Materials the shop keeps. The quantity on hand is NOT stored here - it is added up from stock_movements.';

comment on column public.stock_items.reorder_level_thousandths is
  'Warn at or below this. Null means the owner has not set one (open decision 17.15).';

create unique index if not exists stock_items_name_idx
  on public.stock_items (lower(name));

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items (id) on delete cascade,

  kind text not null check (kind in ('in', 'out', 'count', 'adjustment')),

  -- Positive received, negative taken out. Never zero: a movement that moved
  -- nothing is noise in a history that exists to be traced.
  delta_thousandths bigint not null check (delta_thousandths <> 0),

  -- What this delivery cost per unit, when it is known. Kept per movement, so
  -- a later price rise does not rewrite what an old delivery cost.
  unit_cost_centavos bigint check (unit_cost_centavos >= 0),

  reason text,
  supplier_id uuid references public.suppliers (id) on delete set null,
  -- Set when receiving stock also recorded the purchase.
  expense_id uuid references public.expenses (id) on delete set null,
  payable_id uuid,

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.stock_movements is
  'Every delivery, withdrawal, count and correction. Append-only: a mistake is corrected with an opposite movement.';

create index if not exists stock_movements_item_idx
  on public.stock_movements (stock_item_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Supplier payables (spec 11) - received, not yet paid
-- ---------------------------------------------------------------------------

create table if not exists public.supplier_payables (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers (id) on delete set null,
  description text not null,
  amount_centavos bigint not null check (amount_centavos > 0),

  received_on date not null,
  -- Null is a real state: the supplier may not have given a term. Never
  -- defaulted, for the same reason a bill's due day is not.
  due_on date,

  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_on date,
  paid_source text
    check (paid_source in ('cash_drawer', 'gcash', 'maya', 'bank', 'owners_pocket')),
  ledger_entry_id uuid references public.ledger_entries (id) on delete set null,

  note text,
  created_at timestamptz not null default now(),
  created_by uuid,

  constraint supplier_payables_paid_has_details check (
    status = 'unpaid'
    or (paid_on is not null and paid_source is not null and ledger_entry_id is not null)
  )
);

comment on table public.supplier_payables is
  'Money owed to suppliers for stock already received. Owner/Admin only - it is debt (spec 4.3).';

create index if not exists supplier_payables_status_idx
  on public.supplier_payables (status, due_on, received_on desc);

alter table public.stock_movements
  drop constraint if exists stock_movements_payable_fk;
alter table public.stock_movements
  add constraint stock_movements_payable_fk
  foreign key (payable_id) references public.supplier_payables (id) on delete set null;

drop trigger if exists suppliers_touch_updated_at on public.suppliers;
create trigger suppliers_touch_updated_at
  before update on public.suppliers
  for each row execute function public.touch_updated_at();

drop trigger if exists expense_presets_touch_updated_at on public.expense_presets;
create trigger expense_presets_touch_updated_at
  before update on public.expense_presets
  for each row execute function public.touch_updated_at();

drop trigger if exists stock_items_touch_updated_at on public.stock_items;
create trigger stock_items_touch_updated_at
  before update on public.stock_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.suppliers enable row level security;
alter table public.expense_presets enable row level security;
alter table public.expenses enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.supplier_payables enable row level security;

-- ---- Suppliers -----------------------------------------------------------
-- Readable by anyone signed in, because whoever receives a delivery has to say
-- who it came from. Only Owner/Admin maintain the list.

drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers
  for select using (public.current_role_name() is not null);

drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers
  for all
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

-- ---- Quick picks ---------------------------------------------------------

drop policy if exists expense_presets_read on public.expense_presets;
create policy expense_presets_read on public.expense_presets
  for select using (public.current_role_name() is not null);

drop policy if exists expense_presets_write on public.expense_presets;
create policy expense_presets_write on public.expense_presets
  for all
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

-- ---- Expenses ------------------------------------------------------------
-- A staff member sees their own entries only. The shop's whole spending is an
-- Owner/Admin matter (spec 4.3), but somebody who records a purchase has to be
-- able to check it went in.

drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses
  for select using (
    public.is_owner_or_admin()
    or (public.current_role_name() is not null and created_by = auth.uid())
  );

/*
  No insert, update or delete policy, on purpose.

  Recording an expense writes to the LEDGER, which is Owner/Admin only, and
  approving one decides whether money moved at all. Both go through the
  functions below, which check the permission themselves. Leaving the table
  itself closed means there is exactly one way in, and it is a way that cannot
  approve its own expense or forget the ledger entry.
*/

-- ---- Stock items ---------------------------------------------------------

drop policy if exists stock_items_read on public.stock_items;
create policy stock_items_read on public.stock_items
  for select using (public.current_role_name() is not null);

drop policy if exists stock_items_write on public.stock_items;
create policy stock_items_write on public.stock_items
  for all
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

-- ---- Stock movements -----------------------------------------------------
-- Anyone signed in may read the history: a stock figure nobody can check is a
-- figure nobody will trust.

drop policy if exists stock_movements_read on public.stock_movements;
create policy stock_movements_read on public.stock_movements
  for select using (public.current_role_name() is not null);

drop policy if exists stock_movements_insert on public.stock_movements;
create policy stock_movements_insert on public.stock_movements
  for insert with check (
    public.has_permission('stock_in_out') and created_by = auth.uid()
  );

-- No update or delete policy, on purpose. A movement is append-only: a wrong
-- one is answered with an opposite 'adjustment', so the history still explains
-- the number. The same rule as voiding a ledger entry instead of erasing it.

-- ---- Supplier payables ---------------------------------------------------
-- Owner/Admin only, with no staff-facing policy at all - not even read. This
-- is debt, in the same class as bills and loans (spec 4.3).

drop policy if exists supplier_payables_read on public.supplier_payables;
create policy supplier_payables_read on public.supplier_payables
  for select using (public.is_owner_or_admin());

drop policy if exists supplier_payables_insert on public.supplier_payables;
create policy supplier_payables_insert on public.supplier_payables
  for insert with check (public.is_owner_or_admin());

-- Only an unpaid payable can be edited. Marking one paid writes a ledger entry
-- too, so it goes through pay_supplier_payable rather than a bare update -
-- exactly like a paid payroll week.
drop policy if exists supplier_payables_update on public.supplier_payables;
create policy supplier_payables_update on public.supplier_payables
  for update
  using (public.is_owner_or_admin() and status = 'unpaid')
  with check (public.is_owner_or_admin() and status = 'unpaid');

-- ---------------------------------------------------------------------------
-- Recording an expense, as one transaction
-- ---------------------------------------------------------------------------

create or replace function public.record_expense(
  p_spent_on date,
  p_amount_centavos bigint,
  p_category text,
  p_tag text,
  p_source text,
  p_supplier_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expense_id uuid;
  v_ledger_id uuid;
  v_status text;
  v_limit bigint;
begin
  /*
    SECURITY DEFINER for the same reason as complete_sale: the ledger is
    Owner/Admin only, but a staff member with "Record expenses" has to be able
    to put a purchase in it. So this is the one sanctioned path, and it checks
    the permission itself, first.
  */
  if not public.has_permission('record_expenses') then
    raise exception 'You do not have permission to record expenses.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_amount_centavos is null or p_amount_centavos <= 0 then
    raise exception 'An expense needs an amount.';
  end if;

  -- The limit is read HERE rather than taken from the caller, so a staff
  -- member cannot send a larger one along with their expense.
  select staff_expense_approval_limit_centavos into v_limit
  from public.app_settings where id = 1;

  v_status := case
    when public.is_owner_or_admin() then 'approved'
    when p_amount_centavos > coalesce(v_limit, 0) then 'pending'
    else 'approved'
  end;

  if v_status = 'approved' then
    insert into public.ledger_entries (
      direction, amount_centavos, tag, category, source, note,
      source_table, created_by
    )
    values (
      'out', p_amount_centavos, p_tag, p_category, p_source,
      nullif(btrim(p_note), ''), 'expenses', auth.uid()
    )
    returning id into v_ledger_id;
  end if;

  insert into public.expenses (
    spent_on, amount_centavos, category, tag, source, supplier_id, note,
    status, ledger_entry_id, created_by
  )
  values (
    p_spent_on, p_amount_centavos, p_category, p_tag, p_source, p_supplier_id,
    nullif(btrim(p_note), ''), v_status, v_ledger_id, auth.uid()
  )
  returning id into v_expense_id;

  -- Point the ledger entry back at the expense that made it (spec 10.4), so
  -- the Money in/out screen can say where the entry came from.
  if v_ledger_id is not null then
    update public.ledger_entries set source_id = v_expense_id where id = v_ledger_id;
  end if;

  return v_expense_id;
end;
$$;

comment on function public.record_expense is
  'Records an expense and its ledger entry together. A staff expense above the settings limit is held as pending, with no ledger entry at all.';

-- ---------------------------------------------------------------------------
-- Approving or refusing a waiting expense
-- ---------------------------------------------------------------------------

create or replace function public.decide_expense(
  p_expense_id uuid,
  p_approve boolean,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expense public.expenses;
  v_ledger_id uuid;
begin
  -- SECURITY DEFINER, because the expenses table has no update policy at all:
  -- this is deliberately the only way a pending expense can change.
  if not public.is_owner_or_admin() then
    raise exception 'Only the owner or an admin may decide an expense.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_expense from public.expenses where id = p_expense_id for update;

  if not found then
    raise exception 'That expense no longer exists.';
  end if;

  if v_expense.status <> 'pending' then
    raise exception 'That expense has already been decided.';
  end if;

  if p_approve then
    insert into public.ledger_entries (
      direction, amount_centavos, tag, category, source, note,
      source_table, source_id, created_by
    )
    values (
      'out', v_expense.amount_centavos, v_expense.tag, v_expense.category,
      v_expense.source, v_expense.note, 'expenses', v_expense.id, auth.uid()
    )
    returning id into v_ledger_id;
  end if;

  update public.expenses
  set status = case when p_approve then 'approved' else 'rejected' end,
      ledger_entry_id = v_ledger_id,
      decided_by = auth.uid(),
      decided_at = now(),
      decision_note = nullif(btrim(p_note), '')
  where id = p_expense_id;
end;
$$;

comment on function public.decide_expense is
  'Owner/Admin approve or refuse a waiting expense. Approving writes the ledger entry; refusing leaves no money trace at all.';

-- ---------------------------------------------------------------------------
-- Receiving stock, as one transaction
-- ---------------------------------------------------------------------------
-- Receiving a delivery is up to three facts at once: more material on the
-- shelf, money spent (or owed), and who it came from. Doing them as separate
-- requests risks the shelf going up while the money never left.

create or replace function public.record_stock_in(
  p_stock_item_id uuid,
  p_quantity_thousandths bigint,
  p_unit_cost_centavos bigint,
  p_supplier_id uuid,
  p_reason text,
  -- true: paid now, so it becomes an expense. false: owed, so it becomes a
  -- payable. Ignored when there is no cost to record.
  p_pay_now boolean,
  p_source text,
  p_due_on date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_movement_id uuid;
  v_expense_id uuid;
  v_payable_id uuid;
  v_total_centavos bigint;
  v_item public.stock_items;
begin
  if not public.has_permission('stock_in_out') then
    raise exception 'You do not have permission to receive stock.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_quantity_thousandths is null or p_quantity_thousandths <= 0 then
    raise exception 'Receiving stock needs a quantity above zero.';
  end if;

  select * into v_item from public.stock_items where id = p_stock_item_id;
  if not found then
    raise exception 'That stock item no longer exists.';
  end if;

  if p_unit_cost_centavos is not null and p_unit_cost_centavos > 0 then
    -- Thousandths times centavos gives thousandths of a centavo. round() in
    -- PostgreSQL rounds half AWAY FROM ZERO, which is how a person rounds by
    -- hand, and matches costOfQuantity() in src/lib/quantity.ts.
    v_total_centavos := round(
      (p_quantity_thousandths::numeric * p_unit_cost_centavos) / 1000
    )::bigint;
  end if;

  if v_total_centavos is not null and v_total_centavos > 0 then
    if p_pay_now then
      -- Goes through record_expense so one rule decides whether a staff
      -- member's large delivery waits for the owner.
      v_expense_id := public.record_expense(
        current_date,
        v_total_centavos,
        'materials_supplies',
        v_item.tag,
        coalesce(p_source, 'cash_drawer'),
        p_supplier_id,
        coalesce(nullif(btrim(p_reason), ''), 'Stock received: ' || v_item.name)
      );
    else
      insert into public.supplier_payables (
        supplier_id, description, amount_centavos, received_on, due_on, created_by
      )
      values (
        p_supplier_id,
        'Stock received: ' || v_item.name,
        v_total_centavos,
        current_date,
        p_due_on,
        auth.uid()
      )
      returning id into v_payable_id;
    end if;
  end if;

  insert into public.stock_movements (
    stock_item_id, kind, delta_thousandths, unit_cost_centavos,
    reason, supplier_id, expense_id, payable_id, created_by
  )
  values (
    p_stock_item_id, 'in', p_quantity_thousandths,
    nullif(p_unit_cost_centavos, 0),
    nullif(btrim(p_reason), ''), p_supplier_id, v_expense_id, v_payable_id,
    auth.uid()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

comment on function public.record_stock_in is
  'Receives stock, and records the purchase as an expense or a supplier payable, in one transaction.';

-- ---------------------------------------------------------------------------
-- Paying a supplier, as one transaction
-- ---------------------------------------------------------------------------

create or replace function public.pay_supplier_payable(
  p_payable_id uuid,
  p_paid_on date,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payable public.supplier_payables;
  v_ledger_id uuid;
  v_supplier text;
begin
  -- SECURITY DEFINER because the update policy only matches an unpaid row, so
  -- nothing can edit a payable once it is paid - including this function's own
  -- second run. That is what makes paying twice impossible.
  if not public.is_owner_or_admin() then
    raise exception 'Only the owner or an admin may pay a supplier.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_payable from public.supplier_payables where id = p_payable_id for update;

  if not found then
    raise exception 'That payable no longer exists.';
  end if;

  if v_payable.status <> 'unpaid' then
    raise exception 'That payable is already paid.';
  end if;

  select name into v_supplier from public.suppliers where id = v_payable.supplier_id;

  insert into public.ledger_entries (
    direction, amount_centavos, tag, category, source, note,
    source_table, source_id, created_by
  )
  values (
    'out', v_payable.amount_centavos, 'whole_shop', 'materials_supplies',
    p_source,
    coalesce(v_supplier || ' - ', '') || v_payable.description,
    'supplier_payables', v_payable.id, auth.uid()
  )
  returning id into v_ledger_id;

  update public.supplier_payables
  set status = 'paid',
      paid_on = p_paid_on,
      paid_source = p_source,
      ledger_entry_id = v_ledger_id
  where id = p_payable_id;

  return v_ledger_id;
end;
$$;

comment on function public.pay_supplier_payable is
  'Writes the payment to the ledger and marks the payable paid, together. A paid payable can never be edited again.';

-- ---------------------------------------------------------------------------
-- Stock photos (spec 14)
-- ---------------------------------------------------------------------------
-- Guarded, because the storage schema only exists on a hosted Supabase
-- project - this block is skipped when the migration runs against a plain
-- PostgreSQL for testing.

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('stock-photos', 'stock-photos', false)
    on conflict (id) do nothing;

    -- Anyone signed in may see them: the photo is there so whoever is standing
    -- at the shelf can tell one white paper from another.
    execute $policy$
      drop policy if exists stock_photos_read on storage.objects;
      create policy stock_photos_read on storage.objects
        for select using (
          bucket_id = 'stock-photos' and public.current_role_name() is not null
        );
    $policy$;

    execute $policy$
      drop policy if exists stock_photos_write on storage.objects;
      create policy stock_photos_write on storage.objects
        for all using (
          bucket_id = 'stock-photos' and public.is_owner_or_admin()
        ) with check (
          bucket_id = 'stock-photos' and public.is_owner_or_admin()
        );
    $policy$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed: quick picks only
-- ---------------------------------------------------------------------------
-- These are the specification's OWN expense categories turned into buttons,
-- with NO amounts. The owner's real shopping list and usual prices are open
-- decision 17.14 - figures only they can know - so the pop-up asks every time
-- until they are filled in.

insert into public.expense_presets (label, category, tag, sort_order)
select * from (values
  ('Paper',                'materials_supplies',   'printshoppe', 10::smallint),
  ('Ink',                  'materials_supplies',   'printshoppe', 20::smallint),
  ('Tarpaulin roll',       'materials_supplies',   'printshoppe', 30::smallint),
  ('Meals & snacks',       'meals_snacks',         'whole_shop',  40::smallint),
  ('Fuel',                 'fuel_transportation',  'whole_shop',  50::smallint),
  ('Delivery / shipping',  'delivery_shipping',    'whole_shop',  60::smallint),
  ('Machine repair',       'machine_maintenance',  'whole_shop',  70::smallint),
  ('Other',                'miscellaneous',        'whole_shop',  80::smallint)
) as seed(label, category, tag, sort_order)
where not exists (select 1 from public.expense_presets);

-- No suppliers and no stock items are seeded. Both are open decision 17.15 -
-- the owner's materials, units, reorder levels and costs. An invented reorder
-- level would warn on the wrong day, which is worse than not warning at all.
