-- Phase 6: Dabz Apparel job orders (spec 8, open decision 17.10).
--
-- DECISIONS MADE HERE, recorded in docs/DECISIONS.md:
--   * The order flow is quoted -> confirmed -> layout approved -> in production
--     -> ready -> released, plus cancelled. "Layout approved" is its own step
--     because a sublimation order stalls there more than anywhere else,
--     waiting on the customer to say yes to the design.
--   * A roster IS the quantity. Fifteen names means fifteen jerseys; a typed
--     quantity beside them would be a second answer to the same question.
--   * The size surcharge is COPIED onto each roster entry when it is added, so
--     raising the 2XL surcharge next month never rewrites an old quote.
--   * An order may be released with money still owed. A shop does let a
--     regular take the jerseys; the system says so rather than refusing.
--
-- NOTHING IS PRICED. The item price list, the size surcharges, the fabric and
-- collar options and the down payment percentage are all open decision 17.10 -
-- figures only the owner can know. The size ladder XS..5XL is seeded with the
-- sizes but NO amounts, because the sizes are universal and the money is not.

-- ---------------------------------------------------------------------------
-- The down payment policy (open decision 17.10)
-- ---------------------------------------------------------------------------
-- Nullable on purpose. The specification offers "e.g. 50%", which is an
-- example, not the owner saying so - and a made-up policy would have staff
-- turning away a customer who paid exactly what the owner wanted.

alter table public.app_settings
  add column if not exists apparel_down_payment_percent numeric(5, 2)
    check (apparel_down_payment_percent >= 0 and apparel_down_payment_percent <= 100);

comment on column public.app_settings.apparel_down_payment_percent is
  'Share of an apparel order asked for up front. Null means the owner has not set a policy (open decision 17.10).';

-- ---------------------------------------------------------------------------
-- The apparel price list (spec 8)
-- ---------------------------------------------------------------------------

create table if not exists public.apparel_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,

  -- Null until the owner prices it. The job order still works: the price is
  -- asked for on the line, exactly as the counter asks for an unpriced product.
  base_price_centavos bigint check (base_price_centavos >= 0),

  -- Which set of books a payment for this lands in (spec 10.1).
  income_category text not null default 'sublimation_jerseys',

  sort_order smallint not null default 100,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.apparel_products is
  'What Dabz Apparel sells. Prices are open decision 17.10 and start empty.';

create unique index if not exists apparel_products_name_idx
  on public.apparel_products (lower(name));

-- Size surcharges (spec 8, 17.10: "size add-ons, 2XL and up").
create table if not exists public.apparel_size_prices (
  size text primary key
    check (size in ('XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL')),
  -- Null means "the owner has not said", which is NOT the same as free.
  extra_centavos bigint check (extra_centavos >= 0),
  sort_order smallint not null,
  updated_at timestamptz not null default now()
);

comment on column public.apparel_size_prices.extra_centavos is
  'What this size adds on top of the item price. Null means unset (open decision 17.10).';

-- Fabric and collar choices (17.10). Seeded empty: these are the owner's
-- suppliers and the owner's words, and the order form also takes free text so
-- a job is never blocked by a missing option.
create table if not exists public.apparel_options (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('fabric', 'collar')),
  label text not null,
  extra_centavos bigint check (extra_centavos >= 0),
  sort_order smallint not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint apparel_options_one_per_label unique (kind, label)
);

-- ---------------------------------------------------------------------------
-- Job orders (spec 8)
-- ---------------------------------------------------------------------------

create table if not exists public.apparel_orders (
  id uuid primary key default gen_random_uuid(),

  -- A-260918-003. Unique, so an order number always means one order.
  order_number text not null unique,
  ordered_on date not null default current_date,

  customer_id uuid references public.customers (id) on delete set null,
  -- The team or group, which is often not the same as the person paying.
  team_name text,

  status text not null default 'quoted'
    check (status in ('quoted', 'confirmed', 'layout_approved',
                      'in_production', 'ready', 'released', 'cancelled')),

  -- Null is a real state: not every order gets a date promised on the spot.
  promised_on date,

  layout_note text,
  note text,

  released_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.apparel_orders is
  'Dabz Apparel job orders. The TOTAL IS NOT STORED - it is added up from the lines and roster, so an order sheet can never disagree with itself.';

create index if not exists apparel_orders_status_idx
  on public.apparel_orders (status, promised_on, ordered_on desc);
create index if not exists apparel_orders_customer_idx
  on public.apparel_orders (customer_id);

create table if not exists public.apparel_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.apparel_orders (id) on delete cascade,

  -- COPIED from the price list, not looked up. Renaming an item later must not
  -- rewrite what an old job order said.
  name text not null,
  apparel_product_id uuid references public.apparel_products (id) on delete set null,

  fabric text,
  collar text,

  unit_price_centavos bigint not null default 0 check (unit_price_centavos >= 0),
  -- Used only when the line has no roster: 50 plain shirts, no names.
  quantity integer not null default 1 check (quantity > 0),

  income_category text not null default 'sublimation_jerseys',

  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists apparel_order_lines_order_idx
  on public.apparel_order_lines (order_id);

-- The roster: the heart of a jersey order (spec 1.1, "Your Jersey Market!").
create table if not exists public.apparel_order_names (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.apparel_order_lines (id) on delete cascade,

  player_name text,
  player_number text,
  size text not null
    check (size in ('XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL')),

  -- Copied at the moment it is added, so a later price rise cannot rewrite a
  -- quote the customer already agreed to.
  size_extra_centavos bigint not null default 0 check (size_extra_centavos >= 0),

  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists apparel_order_names_line_idx
  on public.apparel_order_names (line_id, sort_order);

create table if not exists public.apparel_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.apparel_orders (id) on delete cascade,

  amount_centavos bigint not null check (amount_centavos > 0),
  paid_on date not null default current_date,
  source text not null
    check (source in ('cash_drawer', 'gcash', 'maya', 'bank', 'owners_pocket')),
  kind text not null default 'balance'
    check (kind in ('down_payment', 'balance')),
  reference_number text,
  note text,

  -- Voided rather than deleted, exactly like a ledger entry: a payment is a
  -- record that money moved, and it did.
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,

  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists apparel_payments_order_idx
  on public.apparel_payments (order_id, paid_on desc);

drop trigger if exists apparel_products_touch_updated_at on public.apparel_products;
create trigger apparel_products_touch_updated_at
  before update on public.apparel_products
  for each row execute function public.touch_updated_at();

drop trigger if exists apparel_orders_touch_updated_at on public.apparel_orders;
create trigger apparel_orders_touch_updated_at
  before update on public.apparel_orders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.apparel_products enable row level security;
alter table public.apparel_size_prices enable row level security;
alter table public.apparel_options enable row level security;
alter table public.apparel_orders enable row level security;
alter table public.apparel_order_lines enable row level security;
alter table public.apparel_order_names enable row level security;
alter table public.apparel_payments enable row level security;

-- ---- The price list ------------------------------------------------------
-- Readable by anyone signed in, because whoever writes an order needs the
-- prices. Only Owner/Admin set them (spec 7.2, same rule as products).

drop policy if exists apparel_products_read on public.apparel_products;
create policy apparel_products_read on public.apparel_products
  for select using (public.current_role_name() is not null);

drop policy if exists apparel_products_write on public.apparel_products;
create policy apparel_products_write on public.apparel_products
  for all
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

drop policy if exists apparel_size_prices_read on public.apparel_size_prices;
create policy apparel_size_prices_read on public.apparel_size_prices
  for select using (public.current_role_name() is not null);

drop policy if exists apparel_size_prices_write on public.apparel_size_prices;
create policy apparel_size_prices_write on public.apparel_size_prices
  for all
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

drop policy if exists apparel_options_read on public.apparel_options;
create policy apparel_options_read on public.apparel_options
  for select using (public.current_role_name() is not null);

drop policy if exists apparel_options_write on public.apparel_options;
create policy apparel_options_write on public.apparel_options
  for all
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

-- ---- Orders --------------------------------------------------------------
-- Anyone with the apparel permission may write and update an order. Unlike a
-- sale, a job order is a living document - sizes change, a player drops out,
-- the promised date moves - so editing it is the ordinary case, not a
-- correction. What cannot be edited is the MONEY, which lives in
-- apparel_payments and goes through the function below.

drop policy if exists apparel_orders_read on public.apparel_orders;
create policy apparel_orders_read on public.apparel_orders
  for select using (
    public.is_owner_or_admin() or public.has_permission('apparel_job_orders')
  );

drop policy if exists apparel_orders_insert on public.apparel_orders;
create policy apparel_orders_insert on public.apparel_orders
  for insert with check (public.has_permission('apparel_job_orders'));

drop policy if exists apparel_orders_update on public.apparel_orders;
create policy apparel_orders_update on public.apparel_orders
  for update
  using (public.has_permission('apparel_job_orders'))
  with check (public.has_permission('apparel_job_orders'));

-- No delete policy: an order is cancelled with a reason, never erased. The
-- customer may be holding the job order sheet.

drop policy if exists apparel_order_lines_read on public.apparel_order_lines;
create policy apparel_order_lines_read on public.apparel_order_lines
  for select using (
    public.is_owner_or_admin() or public.has_permission('apparel_job_orders')
  );

drop policy if exists apparel_order_lines_write on public.apparel_order_lines;
create policy apparel_order_lines_write on public.apparel_order_lines
  for all
  using (public.has_permission('apparel_job_orders'))
  with check (public.has_permission('apparel_job_orders'));

drop policy if exists apparel_order_names_read on public.apparel_order_names;
create policy apparel_order_names_read on public.apparel_order_names
  for select using (
    public.is_owner_or_admin() or public.has_permission('apparel_job_orders')
  );

drop policy if exists apparel_order_names_write on public.apparel_order_names;
create policy apparel_order_names_write on public.apparel_order_names
  for all
  using (public.has_permission('apparel_job_orders'))
  with check (public.has_permission('apparel_job_orders'));

-- ---- Payments ------------------------------------------------------------
-- Readable, so whoever takes a down payment can see it landed. But no insert
-- or update policy at all: a payment writes to the LEDGER, which is
-- Owner/Admin only, so it goes through the function below - the same shape as
-- a sale and an expense.

drop policy if exists apparel_payments_read on public.apparel_payments;
create policy apparel_payments_read on public.apparel_payments
  for select using (
    public.is_owner_or_admin() or public.has_permission('apparel_job_orders')
  );

-- ---------------------------------------------------------------------------
-- Taking a payment, as one transaction
-- ---------------------------------------------------------------------------

create or replace function public.record_apparel_payment(
  p_order_id uuid,
  p_amount_centavos bigint,
  p_paid_on date,
  p_source text,
  p_kind text,
  p_reference_number text,
  p_note text,
  -- [{category, amount_centavos}], worked out by splitPaymentByCategory so the
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
  v_order public.apparel_orders;
  v_split_total bigint;
begin
  /*
    SECURITY DEFINER, for the same reason as complete_sale and record_expense:
    the ledger is Owner/Admin only, but a staff member with the apparel
    permission has to be able to take a down payment. This is the one
    sanctioned path, and it checks the permission itself, first.
  */
  if not public.has_permission('apparel_job_orders') then
    raise exception 'You do not have permission to take apparel payments.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_amount_centavos is null or p_amount_centavos <= 0 then
    raise exception 'A payment needs an amount.';
  end if;

  select * into v_order from public.apparel_orders where id = p_order_id for update;
  if not found then
    raise exception 'That order no longer exists.';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'That order was cancelled.';
  end if;

  -- The split has to account for every centavo, or the ledger and the order
  -- would disagree about what was taken.
  select coalesce(sum((entry ->> 'amount_centavos')::bigint), 0)
  into v_split_total
  from jsonb_array_elements(p_ledger) as entry;

  if v_split_total <> p_amount_centavos then
    raise exception 'The payment split does not add up to the payment.';
  end if;

  insert into public.apparel_payments (
    order_id, amount_centavos, paid_on, source, kind, reference_number, note,
    created_by
  )
  values (
    p_order_id, p_amount_centavos, coalesce(p_paid_on, current_date), p_source,
    coalesce(p_kind, 'balance'), nullif(btrim(p_reference_number), ''),
    nullif(btrim(p_note), ''), auth.uid()
  )
  returning id into v_payment_id;

  -- One money-in entry per income category, so the books split by themselves.
  insert into public.ledger_entries (
    direction, amount_centavos, tag, category, source, note,
    source_table, source_id, created_by
  )
  select
    'in',
    (entry ->> 'amount_centavos')::bigint,
    'apparel',
    entry ->> 'category',
    p_source,
    'Apparel order ' || v_order.order_number,
    'apparel_payments',
    v_payment_id,
    auth.uid()
  from jsonb_array_elements(p_ledger) as entry
  where (entry ->> 'amount_centavos')::bigint > 0;

  return v_payment_id;
end;
$$;

comment on function public.record_apparel_payment is
  'Records an apparel payment and its ledger entries together, split across the order''s income categories.';

-- ---------------------------------------------------------------------------
-- Voiding a payment, as one transaction
-- ---------------------------------------------------------------------------

create or replace function public.void_apparel_payment(
  p_payment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.apparel_payments;
begin
  -- Only Owner/Admin, the same rule as voiding a sale (spec 4.4).
  if not public.is_owner_or_admin() then
    raise exception 'Only the owner or an admin may void a payment.'
      using errcode = 'insufficient_privilege';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A void needs a reason.';
  end if;

  select * into v_payment from public.apparel_payments
  where id = p_payment_id for update;

  if not found then
    raise exception 'That payment no longer exists.';
  end if;

  if v_payment.voided_at is not null then
    raise exception 'That payment is already voided.';
  end if;

  update public.apparel_payments
  set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  where id = p_payment_id;

  -- The takings go with it, or the day keeps counting money that was handed
  -- back - the same rule as voiding a sale.
  update public.ledger_entries
  set voided_at = now(), voided_by = auth.uid(),
      void_reason = 'Apparel payment voided: ' || btrim(p_reason)
  where source_table = 'apparel_payments'
    and source_id = p_payment_id
    and voided_at is null;
end;
$$;

comment on function public.void_apparel_payment is
  'Voids an apparel payment and its ledger entries together. Never deletes - the customer may hold the receipt.';

-- ---------------------------------------------------------------------------
-- Seed: the size ladder only
-- ---------------------------------------------------------------------------
-- The sizes themselves are universal, so they are seeded. What each one COSTS
-- is open decision 17.10, so every extra is left null. A zero would be a
-- promise that 5XL costs the shop nothing extra to make.

insert into public.apparel_size_prices (size, extra_centavos, sort_order)
select * from (values
  ('XS',  null::bigint, 10::smallint),
  ('S',   null::bigint, 20::smallint),
  ('M',   null::bigint, 30::smallint),
  ('L',   null::bigint, 40::smallint),
  ('XL',  null::bigint, 50::smallint),
  ('2XL', null::bigint, 60::smallint),
  ('3XL', null::bigint, 70::smallint),
  ('4XL', null::bigint, 80::smallint),
  ('5XL', null::bigint, 90::smallint)
) as seed(size, extra_centavos, sort_order)
where not exists (select 1 from public.apparel_size_prices);

-- The five things Dabz Apparel sells, from spec 1.1 - the owner's own list.
-- Every one of them is seeded with NO PRICE (open decision 17.10).
insert into public.apparel_products (name, base_price_centavos, income_category, sort_order)
select * from (values
  ('Sublimation jersey set', null::bigint, 'sublimation_jerseys', 10::smallint),
  ('Shirt',                  null::bigint, 'shirts',              20::smallint),
  ('Jacket',                 null::bigint, 'jackets',             30::smallint),
  ('Long sleeves',           null::bigint, 'long_sleeves',        40::smallint),
  ('DTF process print',      null::bigint, 'dtf_prints',          50::smallint)
) as seed(name, base_price_centavos, income_category, sort_order)
where not exists (select 1 from public.apparel_products);

-- No fabrics and no collars are seeded. Those are the owner's suppliers and
-- the owner's words; the order form takes free text so no job is ever blocked.
