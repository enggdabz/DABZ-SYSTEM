-- Phase 4: customers, products, sales and the end-of-day closing (spec 5, 6, 7, 15.2).
--
-- DECISIONS MADE HERE, recorded in docs/DECISIONS.md:
--   * Maya is added alongside Cash, GCash and Bank (open decision 17.12).
--   * Receipt paper is a setting, defaulting to 58mm thermal (17.3).
--   * Bulk pricing is built as a MECHANISM with no rules seeded (17.9) - the
--     owner has not given the rules, and an invented one would overcharge or
--     undercharge a real customer.
--
-- Prices the owner has not given - lamination, stickers, mugs, souvenirs, DTF -
-- are seeded with NO price, so the counter asks for the amount each time. Same
-- rule as bill due days and daily rates.

-- ---------------------------------------------------------------------------
-- Maya, and the receipt paper setting
-- ---------------------------------------------------------------------------

alter table public.ledger_entries drop constraint if exists ledger_entries_source_check;
alter table public.ledger_entries add constraint ledger_entries_source_check
  check (source in ('cash_drawer', 'gcash', 'maya', 'bank', 'owners_pocket'));

alter table public.bill_payments drop constraint if exists bill_payments_source_check;
alter table public.bill_payments add constraint bill_payments_source_check
  check (source in ('cash_drawer', 'gcash', 'maya', 'bank', 'owners_pocket'));

alter table public.cash_advances drop constraint if exists cash_advances_source_check;
alter table public.cash_advances add constraint cash_advances_source_check
  check (source in ('cash_drawer', 'gcash', 'maya', 'bank', 'owners_pocket'));

alter table public.payroll_weeks drop constraint if exists payroll_weeks_paid_source_check;
alter table public.payroll_weeks add constraint payroll_weeks_paid_source_check
  check (paid_source in ('cash_drawer', 'gcash', 'maya', 'bank', 'owners_pocket'));

alter table public.app_settings
  add column if not exists receipt_paper text not null default 'thermal_58'
    check (receipt_paper in ('thermal_58', 'thermal_80', 'bond_short'));

comment on column public.app_settings.receipt_paper is
  'Which paper receipts print on. 58mm thermal is the default (open decision 17.3).';

-- ---------------------------------------------------------------------------
-- Customers (spec 5)
-- ---------------------------------------------------------------------------
-- One shared list across all three divisions.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  contact_number text,
  address text,
  -- Most orders arrive through Messenger (spec 1), so this is a real field,
  -- not an afterthought.
  facebook_name text,
  email text,
  note text,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.customers is
  'Shared customer list. A walk-in sale simply has no customer (spec 5).';

create index if not exists customers_name_idx on public.customers (name);

-- ---------------------------------------------------------------------------
-- Products (spec 7.1, 7.2)
-- ---------------------------------------------------------------------------

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),

  division text not null default 'printshoppe'
    check (division in ('printshoppe', 'apparel', 'dabztech')),

  -- Null means "ask at the counter". That is a real state for the items the
  -- owner has not priced yet, not a mistake (open decision 17.9).
  price_centavos bigint check (price_centavos >= 0),

  -- Some things are priced fresh every time whatever happens - a mug, a
  -- souvenir, a repair part (spec 7.1).
  manual_price boolean not null default false,

  unit text,
  -- Groups the buttons on the counter screen.
  section text not null default 'other',
  sort_order smallint not null default 100,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.products is
  'Preset buttons for the counter. price_centavos null means the price is asked for each time.';

create index if not exists products_section_idx
  on public.products (active, section, sort_order, name);

-- Bulk pricing (spec 7.4). The mechanism only - no rules are seeded, because
-- the owner has not given them.
create table if not exists public.product_price_tiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  min_quantity integer not null check (min_quantity > 1),
  unit_price_centavos bigint not null check (unit_price_centavos >= 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint product_price_tiers_one_per_quantity unique (product_id, min_quantity)
);

comment on table public.product_price_tiers is
  'Bulk discounts: from min_quantity upward, each unit costs unit_price_centavos.';

-- ---------------------------------------------------------------------------
-- Sales (spec 6)
-- ---------------------------------------------------------------------------

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),

  -- S-260918-007. Unique, so a receipt number always means one sale.
  sale_number text not null unique,
  occurred_at timestamptz not null default now(),
  -- The Manila calendar date, so a day's takings never split across a timezone.
  sale_date date not null,

  customer_id uuid references public.customers (id) on delete set null,

  subtotal_centavos bigint not null check (subtotal_centavos >= 0),
  discount_centavos bigint not null default 0 check (discount_centavos >= 0),
  -- Kept so a receipt can show "10%" rather than only the peso amount.
  discount_kind text not null default 'none'
    check (discount_kind in ('none', 'amount', 'percent')),
  discount_percent numeric(5, 2) check (discount_percent >= 0 and discount_percent <= 100),
  total_centavos bigint not null check (total_centavos >= 0),

  payment_method text not null
    check (payment_method in ('cash', 'gcash', 'maya', 'bank')),
  -- For the non-cash methods (spec 6).
  reference_number text,
  money_given_centavos bigint check (money_given_centavos >= 0),
  change_centavos bigint check (change_centavos >= 0),

  -- Staff may add but never edit or delete a completed sale (spec 4.4).
  -- A mistake goes through a void request instead.
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,

  created_at timestamptz not null default now(),
  created_by uuid,

  -- The discount has to make sense against the figures.
  constraint sales_total_adds_up
    check (total_centavos = subtotal_centavos - discount_centavos),
  -- Change is only a cash idea.
  constraint sales_change_is_cash_only
    check (payment_method = 'cash' or (money_given_centavos is null and change_centavos is null))
);

comment on table public.sales is
  'Completed sales. Never edited or deleted - a mistake is voided, with a reason.';

create index if not exists sales_date_idx on public.sales (sale_date desc, occurred_at desc);
create index if not exists sales_customer_idx on public.sales (customer_id);

create table if not exists public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,

  -- The name is COPIED, not looked up. Renaming a product later must not
  -- rewrite what an old receipt said.
  name text not null,
  product_id uuid references public.products (id) on delete set null,

  -- Each line keeps its own division, so one sale can feed three sets of
  -- books (spec 6).
  division text not null
    check (division in ('printshoppe', 'apparel', 'dabztech')),

  quantity integer not null check (quantity > 0),
  unit_price_centavos bigint not null check (unit_price_centavos >= 0),
  line_total_centavos bigint not null check (line_total_centavos >= 0),

  constraint sale_lines_total_adds_up
    check (line_total_centavos = unit_price_centavos * quantity)
);

create index if not exists sale_lines_sale_idx on public.sale_lines (sale_id);

-- ---------------------------------------------------------------------------
-- Void requests (spec 4.4)
-- ---------------------------------------------------------------------------
-- Staff cannot undo a sale themselves. They ask, and an Owner/Admin decides.

create table if not exists public.void_requests (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  reason text not null check (length(btrim(reason)) > 0),

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,

  requested_by uuid,
  created_at timestamptz not null default now(),

  -- One open request per sale, so the same mistake is not queued twice.
  constraint void_requests_one_pending unique (sale_id, status) deferrable initially immediate
);

comment on table public.void_requests is
  'A staff member asking for a sale to be voided. Owner/Admin approve or reject.';

-- ---------------------------------------------------------------------------
-- End-of-day closing (spec 15.2)
-- ---------------------------------------------------------------------------

create table if not exists public.day_closings (
  id uuid primary key default gen_random_uuid(),
  closing_date date not null unique,

  -- What the system expected, frozen at the moment of closing.
  expected_cash_centavos bigint not null,
  counted_cash_centavos bigint not null check (counted_cash_centavos >= 0),
  -- counted - expected. Negative means the drawer is short.
  difference_centavos bigint not null,

  gcash_centavos bigint not null default 0,
  maya_centavos bigint not null default 0,
  bank_centavos bigint not null default 0,
  total_sales_centavos bigint not null default 0,

  target_centavos bigint not null default 0,
  target_reached boolean not null default false,

  note text,
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.day_closings is
  'One row per day counted. difference_centavos negative means the drawer was short.';

drop trigger if exists customers_touch_updated_at on public.customers;
create trigger customers_touch_updated_at
  before update on public.customers
  for each row execute function public.touch_updated_at();

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- Products carry the ledger category their sales count as (spec 10.1), so a
-- day's takings split into "photocopy", "tarpaulin" and so on by themselves.
alter table public.products
  add column if not exists income_category text not null default 'other_print_jobs';

alter table public.sale_lines
  add column if not exists income_category text not null default 'other_print_jobs';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.product_price_tiers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_lines enable row level security;
alter table public.void_requests enable row level security;
alter table public.day_closings enable row level security;

-- ---- Customers -----------------------------------------------------------
-- All three divisions need them, so anyone signed in may read and add. They
-- are contact details, not money.

drop policy if exists customers_read on public.customers;
create policy customers_read on public.customers
  for select using (public.current_role_name() is not null);

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert with check (public.current_role_name() is not null);

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update
  using (public.current_role_name() is not null)
  with check (public.current_role_name() is not null);

-- No delete policy: a customer is deactivated, so their purchase history and
-- any unpaid balance survive.

-- ---- Products ------------------------------------------------------------

drop policy if exists products_read on public.products;
create policy products_read on public.products
  for select using (public.current_role_name() is not null);

-- Spec 7.2 lets staff tick "save this product to my product list" at the
-- counter, so adding one is a selling permission, not an owner one.
drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert with check (public.has_permission('add_sales'));

-- Editing and removing stay with Owner/Admin (spec 7.2).
drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete using (public.is_owner_or_admin());

drop policy if exists product_price_tiers_read on public.product_price_tiers;
create policy product_price_tiers_read on public.product_price_tiers
  for select using (public.current_role_name() is not null);

drop policy if exists product_price_tiers_write on public.product_price_tiers;
create policy product_price_tiers_write on public.product_price_tiers
  for all
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

-- ---- Sales ---------------------------------------------------------------
-- Spec 4.4: staff may ADD a sale but never edit or delete one. A mistake goes
-- through a void request instead.

drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales
  for insert with check (public.has_permission('add_sales'));

-- A staff member sees the sales they rang up, so they can spot their own
-- mistake and ask for it to be voided.
drop policy if exists sales_read_own on public.sales;
create policy sales_read_own on public.sales
  for select using (created_by = auth.uid());

-- The daily sales report is its own permission (spec 4.3).
drop policy if exists sales_read_all on public.sales;
create policy sales_read_all on public.sales
  for select using (public.has_permission('view_daily_sales_report'));

-- Only Owner/Admin may change a sale at all, and in practice only to void it.
drop policy if exists sales_update on public.sales;
create policy sales_update on public.sales
  for update
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

-- No delete policy at all: a completed sale is never removed.

drop policy if exists sale_lines_read_own on public.sale_lines;
create policy sale_lines_read_own on public.sale_lines
  for select using (
    exists (
      select 1 from public.sales s
      where s.id = sale_id and s.created_by = auth.uid()
    )
  );

drop policy if exists sale_lines_read_all on public.sale_lines;
create policy sale_lines_read_all on public.sale_lines
  for select using (public.has_permission('view_daily_sales_report'));

drop policy if exists sale_lines_insert on public.sale_lines;
create policy sale_lines_insert on public.sale_lines
  for insert with check (public.has_permission('add_sales'));

-- ---- Void requests -------------------------------------------------------

drop policy if exists void_requests_insert on public.void_requests;
create policy void_requests_insert on public.void_requests
  for insert with check (public.has_permission('add_sales'));

drop policy if exists void_requests_read_own on public.void_requests;
create policy void_requests_read_own on public.void_requests
  for select using (requested_by = auth.uid());

drop policy if exists void_requests_read_all on public.void_requests;
create policy void_requests_read_all on public.void_requests
  for select using (public.is_owner_or_admin());

-- Deciding is an Owner/Admin job (spec 4.3).
drop policy if exists void_requests_decide on public.void_requests;
create policy void_requests_decide on public.void_requests
  for update
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

-- ---- End-of-day closing --------------------------------------------------

drop policy if exists day_closings_insert on public.day_closings;
create policy day_closings_insert on public.day_closings
  for insert with check (public.has_permission('add_sales'));

drop policy if exists day_closings_read on public.day_closings;
create policy day_closings_read on public.day_closings
  for select using (
    public.is_owner_or_admin() or public.has_permission('view_daily_sales_report')
  );

-- A count stands as it was made; correcting it is an Owner/Admin job.
drop policy if exists day_closings_update on public.day_closings;
create policy day_closings_update on public.day_closings
  for update
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

-- ---------------------------------------------------------------------------
-- Completing a sale, as one transaction
-- ---------------------------------------------------------------------------
-- A sale writes the sale, its lines, and one money-in entry per division and
-- category. Done as separate requests, a failure halfway would leave a receipt
-- the customer is holding with no money recorded against it - or takings in the
-- ledger for a sale that does not exist.
--
-- The per-division split of a discount is worked out in TypeScript
-- (src/lib/pos.ts, `totalsByDivision`), which is tested to add back up to the
-- total exactly. This function is handed the finished figures.

create or replace function public.complete_sale(
  p_sale_date date,
  p_customer_id uuid,
  p_subtotal_centavos bigint,
  p_discount_centavos bigint,
  p_discount_kind text,
  p_discount_percent numeric,
  p_total_centavos bigint,
  p_payment_method text,
  p_reference_number text,
  p_money_given_centavos bigint,
  p_change_centavos bigint,
  p_lines jsonb,
  p_ledger jsonb
)
returns table (sale_id uuid, sale_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale_id uuid;
  v_number text;
  v_sequence int;
  v_attempt int := 0;
  v_source text;
begin
  /*
    SECURITY DEFINER, for the same reason as unlock_payroll_week.

    The ledger is Owner/Admin only (spec 4.3) - a staff member cannot write to
    it, and should not be able to. But every sale has to put its takings there.
    Running as the caller would mean either the sale fails, or the ledger has to
    be opened up to staff, which would let them write any entry they liked.

    So this function is the one sanctioned path: it bypasses the policies, and
    checks the selling permission itself, first. It writes only what the sale in
    front of it says.
  */
  if not public.has_permission('add_sales') then
    raise exception 'You do not have permission to add sales.'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(p_lines) = 0 then
    raise exception 'A sale needs at least one item.';
  end if;

  -- Where the money landed, for the ledger (spec 10.3).
  v_source := case p_payment_method
    when 'cash' then 'cash_drawer'
    when 'gcash' then 'gcash'
    when 'maya' then 'maya'
    when 'bank' then 'bank'
    else 'cash_drawer'
  end;

  -- The receipt number counts sales within the day. Two tills ringing up at
  -- the same instant would collide, so the unique constraint is allowed to
  -- reject it and the next number is tried.
  select count(*) into v_sequence from public.sales where sale_date = p_sale_date;

  loop
    v_attempt := v_attempt + 1;
    v_sequence := v_sequence + 1;
    v_number := 'S-' || to_char(p_sale_date, 'YYMMDD') || '-' ||
                lpad(v_sequence::text, 3, '0');

    begin
      insert into public.sales (
        sale_number, sale_date, customer_id,
        subtotal_centavos, discount_centavos, discount_kind, discount_percent,
        total_centavos, payment_method, reference_number,
        money_given_centavos, change_centavos, created_by
      )
      values (
        v_number, p_sale_date, p_customer_id,
        p_subtotal_centavos, p_discount_centavos, p_discount_kind, p_discount_percent,
        p_total_centavos, p_payment_method, nullif(btrim(p_reference_number), ''),
        p_money_given_centavos, p_change_centavos, auth.uid()
      )
      returning id into v_sale_id;

      exit;
    exception when unique_violation then
      if v_attempt >= 20 then
        raise exception 'Could not find a free receipt number for today.';
      end if;
    end;
  end loop;

  insert into public.sale_lines (
    sale_id, name, product_id, division, quantity,
    unit_price_centavos, line_total_centavos, income_category
  )
  select
    v_sale_id,
    line ->> 'name',
    nullif(line ->> 'product_id', '')::uuid,
    line ->> 'division',
    (line ->> 'quantity')::int,
    (line ->> 'unit_price_centavos')::bigint,
    (line ->> 'line_total_centavos')::bigint,
    coalesce(line ->> 'income_category', 'other_print_jobs')
  from jsonb_array_elements(p_lines) as line;

  -- One money-in entry per division and category, so the daily figures split
  -- by themselves. Zero-value groups are skipped: the ledger refuses them, and
  -- a nothing entry tells nobody anything.
  insert into public.ledger_entries (
    direction, amount_centavos, tag, category, source, note,
    source_table, source_id, created_by
  )
  select
    'in',
    (entry ->> 'amount_centavos')::bigint,
    entry ->> 'division',
    entry ->> 'category',
    v_source,
    'Sale ' || v_number,
    'sales',
    v_sale_id,
    auth.uid()
  from jsonb_array_elements(p_ledger) as entry
  where (entry ->> 'amount_centavos')::bigint > 0;

  return query select v_sale_id, v_number;
end;
$$;

comment on function public.complete_sale is
  'Writes a sale, its lines and its money-in entries in one transaction.';

-- ---------------------------------------------------------------------------
-- Voiding a sale (spec 4.4)
-- ---------------------------------------------------------------------------

create or replace function public.void_sale(
  p_sale_id uuid,
  p_reason text
)
returns void
language plpgsql
as $$
declare
  v_sale public.sales;
begin
  if not public.is_owner_or_admin() then
    raise exception 'Only the owner or an admin can void a sale.';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why the sale is being voided.';
  end if;

  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'That sale no longer exists.';
  end if;
  if v_sale.voided_at is not null then
    raise exception 'That sale is already voided.';
  end if;

  -- The sale row stays, marked. It is never deleted (spec 2.1), so the receipt
  -- the customer is holding can still be looked up.
  update public.sales
     set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
   where id = p_sale_id;

  -- Its takings are voided too, or the day's figures would still count them.
  update public.ledger_entries
     set voided_at = now(), voided_by = auth.uid(),
         void_reason = 'Sale ' || v_sale.sale_number || ' voided: ' || p_reason
   where source_table = 'sales' and source_id = p_sale_id and voided_at is null;
end;
$$;

comment on function public.void_sale is
  'Marks a sale and its ledger entries voided. Never deletes either.';

grant execute on function public.complete_sale(
  date, uuid, bigint, bigint, text, numeric, bigint, text, text, bigint, bigint, jsonb, jsonb
) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed the counter buttons (spec 7.1)
-- ---------------------------------------------------------------------------
-- Only the prices the owner actually gave. Everything else has no price, so
-- the counter asks for it - and the Products screen says so.

insert into public.products (name, division, price_centavos, manual_price, unit, section, sort_order, income_category)
select * from (values
  -- Printing, priced by the owner.
  ('Print, black & white',        'printshoppe',  300::bigint, false, 'page',  'printing',  10::smallint, 'document_printing'),
  ('Print, colored - light',      'printshoppe',  500::bigint, false, 'page',  'printing',  20::smallint, 'document_printing'),
  ('Print, colored - medium',     'printshoppe',  800::bigint, false, 'page',  'printing',  30::smallint, 'document_printing'),
  ('Print, colored - heavy',      'printshoppe', 1000::bigint, false, 'page',  'printing',  40::smallint, 'document_printing'),
  ('Print, colored - full page',  'printshoppe', 1500::bigint, false, 'page',  'printing',  50::smallint, 'document_printing'),
  ('Photocopy',                   'printshoppe',  300::bigint, false, 'page',  'photocopy', 60::smallint, 'photocopy'),
  -- Priced fresh every time, by the owner's own description (spec 7.1).
  ('Mug',                         'printshoppe', null::bigint, true,  'piece', 'souvenirs', 70::smallint, 'mugs_souvenirs'),
  ('Souvenir',                    'printshoppe', null::bigint, true,  'piece', 'souvenirs', 80::smallint, 'mugs_souvenirs'),
  -- Real products the owner has not given a price for yet. They work at the
  -- counter - the price is simply asked for - and the Products screen asks the
  -- owner to set one.
  ('Lamination',                  'printshoppe', null::bigint, true,  'piece', 'other',     90::smallint, 'lamination'),
  ('Sticker',                     'printshoppe', null::bigint, true,  'piece', 'other',    100::smallint, 'stickers'),
  ('DTF print',                   'apparel',     null::bigint, true,  'piece', 'other',    110::smallint, 'dtf_prints')
) as seed(name, division, price_centavos, manual_price, unit, section, sort_order, income_category)
where not exists (select 1 from public.products);
