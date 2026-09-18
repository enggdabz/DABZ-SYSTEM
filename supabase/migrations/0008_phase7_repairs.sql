-- Phase 7: DabzTech Solutions repair tickets (spec 9, open decision 17.11).
--
-- THE FIRST THING TO KNOW ABOUT THIS FILE IS WHAT IS NOT IN IT.
--
-- There is no password column. Spec 9.3 says the shop does not keep laptop
-- passwords, so nowhere in this system is there a box for one - not encrypted,
-- not "temporarily", not in a note field that happens to be called something
-- else. A box that exists gets filled in, and a customer's password written
-- down in a shop database is a liability the shop cannot insure against.
--
-- What IS recorded is how the technician is meant to get in: the customer
-- unlocks it, it arrived unlocked, or it does not need unlocking.
--
-- OTHER DECISIONS MADE HERE, recorded in docs/DECISIONS.md:
--   * The flow is received -> checking -> quoted -> repairing -> ready ->
--     released, plus "customer said no" and "cannot be repaired". Those two
--     are end states that leave the unit IN THE SHOP, which is exactly the
--     pile that grows in the corner (spec 9.4).
--   * A price may be set per unit kind OR for any unit, which answers 17.11's
--     "do a laptop and a desktop cost the same?" by not deciding it.
--   * The warranty period is COPIED onto the ticket when the unit is released.
--     Shortening it next year must not cancel a promise already made.
--
-- NOTHING IS PRICED. The checking fee and every service are open decision
-- 17.11 - figures only the owner can know.

-- ---------------------------------------------------------------------------
-- The repair price list (spec 9.2, open decision 17.11)
-- ---------------------------------------------------------------------------

create table if not exists public.repair_services (
  id uuid primary key default gen_random_uuid(),
  name text not null,

  /*
    'any' when the price does not depend on the machine, or one kind when it
    does. This is how open decision 17.11 - "do a laptop and a desktop cost the
    same for the same service?" - is answered without guessing: BOTH are
    possible, and the owner picks per service.
  */
  unit_kind text not null default 'any'
    check (unit_kind in ('any', 'epson_printer', 'laptop', 'desktop')),

  -- Null until the owner prices it. A ticket still works: the price is asked
  -- for on the line, exactly as the counter asks for an unpriced product.
  price_centavos bigint check (price_centavos >= 0),

  income_category text not null default 'laptop_repair',
  /** True for the diagnostic fee, which is charged even when the job is a no. */
  is_checking_fee boolean not null default false,

  sort_order smallint not null default 100,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.repair_services is
  'What DabzTech charges for. Prices are open decision 17.11 and start empty.';

create unique index if not exists repair_services_name_idx
  on public.repair_services (lower(name), unit_kind);

-- ---------------------------------------------------------------------------
-- The ticket (spec 9.1)
-- ---------------------------------------------------------------------------

create table if not exists public.repair_tickets (
  id uuid primary key default gen_random_uuid(),

  -- T-260918-003. Unique, so a claim stub always means one unit.
  ticket_number text not null unique,
  received_on date not null default current_date,

  customer_id uuid references public.customers (id) on delete set null,
  -- Kept even when a customer record is linked, because a walk-in repair is
  -- often left by somebody other than the owner of the machine.
  customer_name text not null,
  contact_number text,

  -- DabzTech takes Epson printers, laptops and desktops only (spec 1.1).
  unit_kind text not null check (unit_kind in ('epson_printer', 'laptop', 'desktop')),
  brand text,
  model text,
  serial_number text,

  -- What came with it, and what it looked like. Both protect the shop and the
  -- customer, and both are only useful if they are written down on arrival.
  accessories text,
  condition_note text,

  -- The customer's own words, not a diagnosis.
  problem text not null,
  diagnosis text,

  /*
    NOT A PASSWORD. See the note at the top of this file. This says how the
    technician gets in, and nothing more.
  */
  unlock_method text not null default 'not_needed'
    check (unlock_method in ('not_needed', 'customer_unlocks', 'left_unlocked')),

  status text not null default 'received'
    check (status in ('received', 'checking', 'quoted', 'repairing',
                      'ready', 'released', 'declined', 'unrepairable')),

  -- Null is a real state: not every repair gets a date promised on the spot.
  promised_on date,

  -- When the unit became the customer's to collect. The unclaimed count runs
  -- from here, not from when it arrived: a repair that took three weeks is not
  -- an abandoned unit (spec 9.4).
  ready_on date,

  released_on date,
  /*
    COPIED from Settings at the moment of release, never read live. Shortening
    the warranty next year must not quietly cancel a promise already made to a
    customer - the same rule as the daily rate on a payroll week.
  */
  warranty_days integer check (warranty_days >= 0),

  decline_reason text,
  note text,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),

  -- A released unit has to say when it went and how long it is covered for.
  constraint repair_tickets_released_has_date
    check (status <> 'released' or released_on is not null)
);

comment on table public.repair_tickets is
  'DabzTech repair jobs. There is deliberately NO password column (spec 9.3). The total is not stored either - it is added up from repair_lines.';

comment on column public.repair_tickets.unlock_method is
  'How the technician gets into the unit. NOT a password - the shop does not keep those (spec 9.3).';

create index if not exists repair_tickets_status_idx
  on public.repair_tickets (status, promised_on, received_on desc);
create index if not exists repair_tickets_customer_idx
  on public.repair_tickets (customer_id);

create table if not exists public.repair_lines (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.repair_tickets (id) on delete cascade,

  kind text not null check (kind in ('checking_fee', 'service', 'part')),

  -- COPIED from the price list. Renaming a service later must not rewrite what
  -- an old ticket said it charged for.
  name text not null,
  repair_service_id uuid references public.repair_services (id) on delete set null,

  unit_price_centavos bigint not null default 0 check (unit_price_centavos >= 0),
  quantity integer not null default 1 check (quantity > 0),
  income_category text not null default 'laptop_repair',

  -- Set when the part came off the shop's own shelf, so the stock movement and
  -- the charge can be traced to each other.
  stock_item_id uuid references public.stock_items (id) on delete set null,
  stock_movement_id uuid references public.stock_movements (id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists repair_lines_ticket_idx
  on public.repair_lines (ticket_id);

create table if not exists public.repair_payments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.repair_tickets (id) on delete cascade,

  amount_centavos bigint not null check (amount_centavos > 0),
  paid_on date not null default current_date,
  source text not null
    check (source in ('cash_drawer', 'gcash', 'maya', 'bank', 'owners_pocket')),
  reference_number text,
  note text,

  -- Voided rather than deleted, exactly like a ledger entry.
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,

  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists repair_payments_ticket_idx
  on public.repair_payments (ticket_id, paid_on desc);

drop trigger if exists repair_services_touch_updated_at on public.repair_services;
create trigger repair_services_touch_updated_at
  before update on public.repair_services
  for each row execute function public.touch_updated_at();

drop trigger if exists repair_tickets_touch_updated_at on public.repair_tickets;
create trigger repair_tickets_touch_updated_at
  before update on public.repair_tickets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.repair_services enable row level security;
alter table public.repair_tickets enable row level security;
alter table public.repair_lines enable row level security;
alter table public.repair_payments enable row level security;

-- ---- The price list ------------------------------------------------------

drop policy if exists repair_services_read on public.repair_services;
create policy repair_services_read on public.repair_services
  for select using (public.current_role_name() is not null);

drop policy if exists repair_services_write on public.repair_services;
create policy repair_services_write on public.repair_services
  for all
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

-- ---- Tickets -------------------------------------------------------------
-- A ticket is a living document: the diagnosis arrives after the unit does,
-- the promised date moves, a part is added. So editing one is the ordinary
-- case. What cannot be edited is the MONEY, which lives in repair_payments and
-- goes through the functions below.

drop policy if exists repair_tickets_read on public.repair_tickets;
create policy repair_tickets_read on public.repair_tickets
  for select using (
    public.is_owner_or_admin() or public.has_permission('dabztech_tickets')
  );

drop policy if exists repair_tickets_insert on public.repair_tickets;
create policy repair_tickets_insert on public.repair_tickets
  for insert with check (public.has_permission('dabztech_tickets'));

drop policy if exists repair_tickets_update on public.repair_tickets;
create policy repair_tickets_update on public.repair_tickets
  for update
  using (public.has_permission('dabztech_tickets'))
  with check (public.has_permission('dabztech_tickets'));

-- No delete policy: the customer holds the claim stub, so a ticket is marked
-- declined or unrepairable, never erased.

drop policy if exists repair_lines_read on public.repair_lines;
create policy repair_lines_read on public.repair_lines
  for select using (
    public.is_owner_or_admin() or public.has_permission('dabztech_tickets')
  );

drop policy if exists repair_lines_write on public.repair_lines;
create policy repair_lines_write on public.repair_lines
  for all
  using (public.has_permission('dabztech_tickets'))
  with check (public.has_permission('dabztech_tickets'));

-- ---- Payments ------------------------------------------------------------
-- Readable so whoever takes money can see it landed, but no insert or update
-- policy at all: a payment writes to the LEDGER, which is Owner/Admin only.

drop policy if exists repair_payments_read on public.repair_payments;
create policy repair_payments_read on public.repair_payments
  for select using (
    public.is_owner_or_admin() or public.has_permission('dabztech_tickets')
  );

-- ---------------------------------------------------------------------------
-- Taking a payment, as one transaction
-- ---------------------------------------------------------------------------

create or replace function public.record_repair_payment(
  p_ticket_id uuid,
  p_amount_centavos bigint,
  p_paid_on date,
  p_source text,
  p_reference_number text,
  p_note text,
  -- [{category, amount_centavos}], worked out by splitTicketPayment so the
  -- parts add back up to the payment exactly.
  p_ledger jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_id uuid;
  v_ticket public.repair_tickets;
  v_split_total bigint;
begin
  -- SECURITY DEFINER for the same reason as complete_sale, record_expense and
  -- record_apparel_payment: the ledger is Owner/Admin only, but a technician
  -- with the DabzTech permission has to be able to take money for a repair.
  if not public.has_permission('dabztech_tickets') then
    raise exception 'You do not have permission to take repair payments.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_amount_centavos is null or p_amount_centavos <= 0 then
    raise exception 'A payment needs an amount.';
  end if;

  select * into v_ticket from public.repair_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'That ticket no longer exists.';
  end if;

  select coalesce(sum((entry ->> 'amount_centavos')::bigint), 0)
  into v_split_total
  from jsonb_array_elements(p_ledger) as entry;

  if v_split_total <> p_amount_centavos then
    raise exception 'The payment split does not add up to the payment.';
  end if;

  insert into public.repair_payments (
    ticket_id, amount_centavos, paid_on, source, reference_number, note, created_by
  )
  values (
    p_ticket_id, p_amount_centavos, coalesce(p_paid_on, current_date), p_source,
    nullif(btrim(p_reference_number), ''), nullif(btrim(p_note), ''), auth.uid()
  )
  returning id into v_payment_id;

  insert into public.ledger_entries (
    direction, amount_centavos, tag, category, source, note,
    source_table, source_id, created_by
  )
  select
    'in',
    (entry ->> 'amount_centavos')::bigint,
    'dabztech',
    entry ->> 'category',
    p_source,
    'Repair ' || v_ticket.ticket_number,
    'repair_payments',
    v_payment_id,
    auth.uid()
  from jsonb_array_elements(p_ledger) as entry
  where (entry ->> 'amount_centavos')::bigint > 0;

  return v_payment_id;
end;
$$;

comment on function public.record_repair_payment is
  'Records a repair payment and its ledger entries together, split across the checking fee, labour and parts.';

create or replace function public.void_repair_payment(
  p_payment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.repair_payments;
begin
  -- Only Owner/Admin, the same rule as voiding a sale (spec 4.4).
  if not public.is_owner_or_admin() then
    raise exception 'Only the owner or an admin may void a payment.'
      using errcode = 'insufficient_privilege';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A void needs a reason.';
  end if;

  select * into v_payment from public.repair_payments
  where id = p_payment_id for update;

  if not found then
    raise exception 'That payment no longer exists.';
  end if;

  if v_payment.voided_at is not null then
    raise exception 'That payment is already voided.';
  end if;

  update public.repair_payments
  set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  where id = p_payment_id;

  update public.ledger_entries
  set voided_at = now(), voided_by = auth.uid(),
      void_reason = 'Repair payment voided: ' || btrim(p_reason)
  where source_table = 'repair_payments'
    and source_id = p_payment_id
    and voided_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fitting a part from the shop's own shelf, as one transaction
-- ---------------------------------------------------------------------------
-- Two facts at once: the customer is charged for the part, and the part leaves
-- the shelf. As separate requests one can succeed without the other, and then
-- the stock count is wrong for a reason nobody can find later.

create or replace function public.fit_repair_part(
  p_ticket_id uuid,
  p_stock_item_id uuid,
  p_quantity integer,
  p_unit_price_centavos bigint,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line_id uuid;
  v_movement_id uuid;
  v_item public.stock_items;
  v_ticket public.repair_tickets;
begin
  if not public.has_permission('dabztech_tickets') then
    raise exception 'You do not have permission to add parts to a repair.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_quantity is null or p_quantity < 1 then
    raise exception 'Fitting a part needs a quantity of at least one.';
  end if;

  select * into v_ticket from public.repair_tickets where id = p_ticket_id;
  if not found then
    raise exception 'That ticket no longer exists.';
  end if;

  if p_stock_item_id is not null then
    select * into v_item from public.stock_items where id = p_stock_item_id;
    if not found then
      raise exception 'That stock item no longer exists.';
    end if;

    -- Quantities are whole thousandths of a unit (see src/lib/quantity.ts).
    insert into public.stock_movements (
      stock_item_id, kind, delta_thousandths, reason, created_by
    )
    values (
      p_stock_item_id, 'out', -(p_quantity::bigint * 1000),
      'Fitted to repair ' || v_ticket.ticket_number, auth.uid()
    )
    returning id into v_movement_id;
  end if;

  insert into public.repair_lines (
    ticket_id, kind, name, unit_price_centavos, quantity, income_category,
    stock_item_id, stock_movement_id, created_by
  )
  values (
    p_ticket_id, 'part',
    coalesce(nullif(btrim(p_name), ''), v_item.name, 'Part'),
    coalesce(p_unit_price_centavos, 0), p_quantity, 'parts_sold',
    p_stock_item_id, v_movement_id, auth.uid()
  )
  returning id into v_line_id;

  return v_line_id;
end;
$$;

comment on function public.fit_repair_part is
  'Charges a part to a repair and takes it off the shelf, in one transaction.';

-- ---------------------------------------------------------------------------
-- Seed: the services DabzTech offers, with no prices
-- ---------------------------------------------------------------------------
-- These names come from the specification's own list of what DabzTech does
-- (spec 1.1, 9.2). Every price is null, because the checking fee and the
-- repair prices are open decision 17.11.
--
-- Note the two "cleaning" rows: one for a laptop and one for a desktop. They
-- exist SEPARATELY so the owner can price them differently if a desktop really
-- does cost more - and can leave them the same if it does not. That is 17.11's
-- question, left open in the shape of the data rather than answered by me.

insert into public.repair_services
  (name, unit_kind, price_centavos, income_category, is_checking_fee, sort_order)
select * from (values
  ('Checking / diagnostic fee', 'any',           null::bigint, 'checking_fee',        true,   10::smallint),
  ('Head cleaning',             'epson_printer', null::bigint, 'epson_printer_repair', false,  20::smallint),
  ('Ink system repair',         'epson_printer', null::bigint, 'epson_printer_repair', false,  30::smallint),
  ('Printer general service',   'epson_printer', null::bigint, 'epson_printer_repair', false,  40::smallint),
  ('Cleaning & repaste',        'laptop',        null::bigint, 'laptop_repair',        false,  50::smallint),
  ('Operating system install',  'laptop',        null::bigint, 'laptop_repair',        false,  60::smallint),
  ('Screen replacement',        'laptop',        null::bigint, 'laptop_repair',        false,  70::smallint),
  ('Keyboard replacement',      'laptop',        null::bigint, 'laptop_repair',        false,  80::smallint),
  ('Cleaning & repaste',        'desktop',       null::bigint, 'desktop_repair',       false,  90::smallint),
  ('Operating system install',  'desktop',       null::bigint, 'desktop_repair',       false, 100::smallint),
  ('Upgrade / parts fitting',   'desktop',       null::bigint, 'desktop_repair',       false, 110::smallint),
  ('Virus removal',             'any',           null::bigint, 'laptop_repair',        false, 120::smallint)
) as seed(name, unit_kind, price_centavos, income_category, is_checking_fee, sort_order)
where not exists (select 1 from public.repair_services);
