-- Phase 14: Dabz Apparel online orders (docs/spec.md).
--
-- WHAT THIS IS
--
-- A customer orders jerseys from their phone without chatting first, and the
-- shop pushes that order through production without the details living in a
-- Messenger thread. Everything the module needs is in this one file.
--
-- WHAT IT IS NOT
--
-- It is not online payment. `online_payments.method` can hold 'gateway' and
-- the table keeps a `gateway_ref`, so a PayMongo QR can be wired in later
-- without a migration - but nothing here charges anybody.
--
-- It is not Messenger automation either. `customers.messenger_psid` is a
-- column and nothing more: linking a chat to an order needs a Meta app, a
-- page token and Meta's own review, which are the owner's to obtain.
--
-- HOW IT MEETS THE RULES IN AGENTS.md (all of this is in
-- docs/open-questions.md too, with how to change each one back)
--
--   * MONEY IS CENTAVOS. docs/spec.md asks for numeric(10,2); this system
--     stores whole centavos everywhere and the later finance modules will add
--     these rows to the ledger's. Two money types in one database is how a
--     one-centavo hole appears in a report that sums both.
--   * NAMES ARE PREFIXED `online_`. `products`, `customers` and `payments`
--     already exist here and mean other things.
--   * TEXT PLUS CHECK, NOT ENUM. Every status column in eleven phases is
--     written this way; one enum would be the odd one out and a new value
--     would need a migration where the others need none.
--   * NO staff_profiles. `profiles` already answers "who is this person", and
--     every policy in this file uses the helpers built on it.
--   * NOTHING IS SEEDED BUT STRUCTURE. The five categories and the eight
--     production stages, both fixed by name in the specification. No products,
--     no designs, no orders, no capacity, no sales target - those are the
--     owner's, and 0011-0013 exist because rows an earlier migration shipped
--     were mistaken for the shop's real prices.
--
-- THE ONE THING WORTH READING TWICE is the split at the bottom between what
-- `anon` may select (the catalogue, and nothing else) and what only a function
-- may write (every order, every payment, every log line).

-- ---------------------------------------------------------------------------
-- Settings the module adds (all on the existing single-row app_settings)
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists online_notify_email text,
  add column if not exists online_daily_capacity_pcs integer
    check (online_daily_capacity_pcs is null or online_daily_capacity_pcs > 0),
  add column if not exists online_monthly_target_centavos bigint
    check (online_monthly_target_centavos is null or online_monthly_target_centavos > 0),
  add column if not exists online_min_days_ahead integer not null default 2
    check (online_min_days_ahead between 0 and 90),
  add column if not exists online_show_steps_to_customers boolean not null default true,
  add column if not exists online_shop_enabled boolean not null default true;

comment on column public.app_settings.online_daily_capacity_pcs is
  'How many pieces the shop can finish for one due date. NULL means nobody has said - the calendar then shows no FULL marker rather than inventing one, because a made-up capacity turns a customer away on a day the shop was free.';

comment on column public.app_settings.online_monthly_target_centavos is
  'NULL until the owner sets one. Reports then show no target meter and say so: a target of zero would read as reached before the first order.';

comment on column public.app_settings.online_min_days_ahead is
  'The earliest date a customer may ask for, counted from today in Manila. Two days is the specification''s own default, not a guess at the shop''s.';

-- The online shop matches a customer by the number they type. The table
-- predates this module and may already hold two rows for one number, so this
-- index is NOT unique - the module matches on it and never adds a second row
-- for a number it found.
create index if not exists customers_contact_number_idx
  on public.customers (contact_number);

alter table public.customers
  add column if not exists messenger_psid text;

comment on column public.customers.messenger_psid is
  'Reserved for Messenger automation, which is not built. Nothing writes it yet; it is here so linking a chat to a customer later needs no migration.';

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------

create table if not exists public.online_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),

  /*
    Which way through the workshop a thing in this category goes. A DTF print
    is pressed onto a finished shirt, so it never sees a pattern, a cutting
    table or a sewing machine; a sublimated jersey sees all three. The order's
    step list is worked out from this, so it is data rather than a branch in
    the code - spec 2 asks for categories a later division can be added to
    without touching code.
  */
  production_path text not null default 'full'
    check (production_path in ('full', 'dtf')),
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.online_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.online_categories (id) on delete restrict,

  name text not null check (length(btrim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  description text,

  /*
    'fixed'  - the price is known, and the shop's site can add it up.
    'quote'  - staff price it after seeing the design and the quantity.

    Both may sit in one order. A quote item's price is NOT zero and is not a
    guess: the order says "to be quoted" until somebody types a figure.
  */
  pricing_mode text not null check (pricing_mode in ('fixed', 'quote')),

  min_order_qty integer not null default 1 check (min_order_qty >= 1),
  lead_time_days integer not null default 7 check (lead_time_days >= 1),

  uses_sizes boolean not null default true,
  -- A roster IS the quantity: fifteen names means fifteen jerseys. Sizes are
  -- then asked per player rather than as a tally.
  uses_roster boolean not null default false,
  uses_design_gallery boolean not null default false,

  size_chart_path text,
  is_visible boolean not null default true,

  -- Deleted, never erased: a past order points here, and the shop's own copy
  -- of what was ordered must not lose the link it was written against.
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.online_products is
  'The online shop''s catalogue. Separate from public.products, which is the Counter''s. Deleting is soft, so an order placed last month still reads correctly.';

create index if not exists online_products_visible_idx
  on public.online_products (is_visible, deleted_at);
create index if not exists online_products_created_idx
  on public.online_products (created_at desc);
create index if not exists online_products_category_idx
  on public.online_products (category_id);

create table if not exists public.online_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.online_products (id) on delete cascade,
  storage_path text not null,
  alt text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists online_product_images_product_idx
  on public.online_product_images (product_id, sort_order);

create table if not exists public.online_product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.online_products (id) on delete cascade,
  -- "A4 print", "Long sleeve", "Kids". A fixed-price product has at least one;
  -- a quote product has none.
  label text not null check (length(btrim(label)) > 0),
  price_centavos bigint not null check (price_centavos >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists online_product_prices_product_idx
  on public.online_product_prices (product_id, sort_order);

create table if not exists public.online_product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.online_products (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  choices text[] not null check (array_length(choices, 1) >= 1),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists online_product_options_product_idx
  on public.online_product_options (product_id, sort_order);

create table if not exists public.online_designs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(btrim(code)) and length(btrim(code)) > 0),
  name text not null check (length(btrim(name)) > 0),
  description text,
  image_path text,
  is_visible boolean not null default true,
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

create index if not exists online_designs_visible_idx
  on public.online_designs (is_visible, deleted_at);

create table if not exists public.online_design_products (
  design_id uuid not null references public.online_designs (id) on delete cascade,
  product_id uuid not null references public.online_products (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (design_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Production stages (fixed by the specification, read-only in version 1)
-- ---------------------------------------------------------------------------

create table if not exists public.online_production_stages (
  key text primary key,
  label text not null,
  -- What the CUSTOMER is shown. "Tabas" is what the shop calls cutting; the
  -- track page says "Cutting (tabas)" so a customer who has never set foot in
  -- a print shop can still read their own order.
  customer_label text not null,
  description text not null,
  position integer not null unique,
  in_dtf_path boolean not null
);

insert into public.online_production_stages
  (key, label, customer_label, description, position, in_dtf_path)
values
  ('design', 'Design', 'Design', 'Layout made and approved by the customer', 1, true),
  ('pattern', 'Pattern', 'Pattern', 'Pattern pieces laid out for every size', 2, false),
  ('print', 'Print', 'Print', 'Design printed on transfer paper or film', 3, true),
  ('heat_press', 'Heat press', 'Heat press', 'Print pressed onto the fabric', 4, true),
  ('tabas', 'Tabas', 'Cutting (tabas)', 'Fabric pieces cut', 5, false),
  ('sewing', 'Sewing', 'Sewing', 'Pieces sewn into finished garments', 6, false),
  ('quality_check', 'Quality check', 'Quality check', 'Names, numbers, sizes and stitching checked', 7, true),
  ('packaging', 'Packaging', 'Packaging', 'Folded, counted and packed', 8, true)
on conflict (key) do update set
  label = excluded.label,
  customer_label = excluded.customer_label,
  description = excluded.description,
  position = excluded.position,
  in_dtf_path = excluded.in_dtf_path;

-- The five categories the specification names. Structure, not commerce: a
-- category is which way through the workshop a thing goes, and nobody can get
-- that wrong the way they can get a price wrong.
insert into public.online_categories (name, slug, production_path, sort_order)
values
  ('Jerseys', 'jerseys', 'full', 1),
  ('Shirts', 'shirts', 'full', 2),
  ('Jackets', 'jackets', 'full', 3),
  ('Long Sleeves', 'long-sleeves', 'full', 4),
  ('DTF Prints', 'dtf-prints', 'dtf', 5)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

-- DA-0001, DA-0002, ... and past DA-9999 without anybody noticing.
create sequence if not exists public.online_order_no_seq as bigint start with 1;

create table if not exists public.online_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,

  -- The shop's customer record, for the Counter and the customers screen. The
  -- name and number below are COPIES: a customer correcting their name next
  -- year must not rewrite what last year's order said.
  customer_id uuid references public.customers (id) on delete set null,
  customer_name text not null check (length(btrim(customer_name)) > 0),
  mobile text not null check (mobile ~ '^09[0-9]{9}$'),
  facebook_name text,

  method text not null check (method in ('pickup', 'delivery')),
  address text,

  date_needed date not null,
  notes text,

  status text not null default 'new' check (
    status in ('new', 'quoted', 'confirmed', 'in_production',
               'ready_to_ship', 'completed', 'cancelled')
  ),

  -- One figure for the whole order, as the specification has it - not a price
  -- per quote item. NULL means nobody has priced it yet, which is a real
  -- state and shows as "To be quoted" rather than as zero.
  quote_amount_centavos bigint check (quote_amount_centavos >= 0),

  source text not null default 'website' check (source in ('website', 'manual')),

  -- What addresses the "order received" page. Never the order number: DA-0042
  -- is guessable and the page carries a name and a phone number.
  receipt_token text not null unique,

  -- Kept for rate limiting only, exactly as `enquiries` and `login_events`
  -- keep one. Never shown, never exported, and null for an order staff typed
  -- in themselves.
  ip_address text,

  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),

  -- Delivery without an address is an order nobody can deliver. Checked here
  -- as well as in the form, because the form is not the boundary.
  constraint online_orders_delivery_needs_address check (
    method <> 'delivery' or length(btrim(coalesce(address, ''))) > 0
  )
);

comment on table public.online_orders is
  'Orders placed on the online shop, and the Messenger and walk-in orders staff type in so the reports count the whole shop rather than the website half.';

create index if not exists online_orders_status_idx on public.online_orders (status);
create index if not exists online_orders_needed_idx on public.online_orders (date_needed);
create index if not exists online_orders_created_idx on public.online_orders (created_at desc);
create index if not exists online_orders_mobile_idx on public.online_orders (mobile);
create index if not exists online_orders_rate_idx
  on public.online_orders (ip_address, created_at desc);

/*
  The server's own notebook of what strangers have been doing.

  Two kinds of row, and both exist so a limit can be counted per address the
  way the enquiry form counts messages:

    'upload' - a file a customer attached, written before the order exists.
               It is also what the purge reads: a file in `tmp/` that no order
               picked up is found here by its date, rather than by listing a
               bucket that will one day be large.
    'track'  - somebody looking an order up. Guessing an order number has to
               cost the guesser something, or the lookup is an index of every
               order in the shop.

  No policy of any kind, for anybody. Only the server writes it, and nothing
  reads it but those two limits and the purge.
*/
create table if not exists public.online_rate_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('upload', 'track')),
  -- Kept for the limit only, the same as `enquiries` and `login_events`.
  ip_address text,
  -- Only an upload has one.
  storage_path text,
  -- Set when order creation takes the file, so the purge can skip it without
  -- having to ask whether an order points at it.
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists online_rate_events_rate_idx
  on public.online_rate_events (kind, ip_address, created_at desc);
create index if not exists online_rate_events_purge_idx
  on public.online_rate_events (kind, claimed_at, created_at);

create table if not exists public.online_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.online_orders (id) on delete cascade,

  -- Nullable, and everything beside it is a SNAPSHOT. A product deleted or
  -- renamed next year must not change what this order says was bought.
  product_id uuid references public.online_products (id) on delete set null,
  product_name text not null,
  category_name text not null,
  production_path text not null check (production_path in ('full', 'dtf')),
  pricing_mode text not null check (pricing_mode in ('fixed', 'quote')),

  variant_label text,
  unit_price_centavos bigint check (unit_price_centavos >= 0),

  -- {"Collar": "Round", "Sleeve": "Short"}. A bag of strings is right here:
  -- the options are the product's own, they differ per product, and nothing
  -- ever queries across them.
  options jsonb not null default '{}'::jsonb,

  qty integer not null check (qty > 0),
  -- {"S": 2, "M": 4}. Empty for roster products, where the roster is the tally.
  sizes jsonb not null default '{}'::jsonb,

  design_id uuid references public.online_designs (id) on delete set null,
  design_code text,
  design_name text,
  team_colors text,

  notes text,
  position integer not null default 0,

  created_at timestamptz not null default now(),
  created_by uuid,

  /*
    A fixed item HAS a price and a quote item has none. Written as a check
    rather than left to the code, because a quote item carrying a zero would
    add nothing to the total and look exactly like a free one.
  */
  constraint online_order_items_price_matches_mode check (
    (pricing_mode = 'fixed' and unit_price_centavos is not null)
    or (pricing_mode = 'quote' and unit_price_centavos is null)
  )
);

create index if not exists online_order_items_order_idx
  on public.online_order_items (order_id, position);
create index if not exists online_order_items_product_idx
  on public.online_order_items (product_id);

create table if not exists public.online_order_roster (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.online_order_items (id) on delete cascade,
  position integer not null,
  -- Blank is allowed: some teams hand in the names later. The SIZE is not.
  player_name text,
  player_number text check (player_number is null or player_number ~ '^[0-9]{0,3}$'),
  size text not null check (size in ('XS', 'S', 'M', 'L', 'XL', '2XL', '3XL')),
  created_at timestamptz not null default now()
);

create index if not exists online_order_roster_item_idx
  on public.online_order_roster (order_item_id, position);

create table if not exists public.online_order_files (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.online_order_items (id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists online_order_files_item_idx
  on public.online_order_files (order_item_id);

create table if not exists public.online_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.online_orders (id) on delete cascade,

  amount_centavos bigint not null check (amount_centavos > 0),
  method text not null
    check (method in ('cash', 'gcash_manual', 'bank_transfer', 'gateway')),
  paid_on date not null default (now() at time zone 'Asia/Manila')::date,

  recorded_by uuid,
  note text,
  -- For the payment gateway that is not built. Nothing writes it yet.
  gateway_ref text,

  -- Voided, never deleted, never negative: a payment row is a record that
  -- money changed hands, and it did. Every sum skips a voided row.
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,

  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists online_payments_order_idx
  on public.online_payments (order_id, paid_on desc);
create index if not exists online_payments_paid_on_idx
  on public.online_payments (paid_on);

create table if not exists public.online_order_production (
  order_id uuid not null references public.online_orders (id) on delete cascade,
  stage_key text not null references public.online_production_stages (key),
  done_at timestamptz not null default now(),
  done_by uuid,
  /*
    The name as well as the id, for the reason `status_log.actor_label` keeps
    one: a staff member may only read their OWN profile row, so a join would
    show every other tick as done by nobody - and after an account is removed
    it would show that way for the owner too.
  */
  done_by_name text,
  -- "Not needed for this order" is a finished step, not a missing one. The
  -- difference is kept because the shop will want to know which orders skip
  -- which steps, and a missing row would just read as "not started".
  skipped boolean not null default false,
  primary key (order_id, stage_key)
);

create table if not exists public.online_status_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.online_orders (id) on delete cascade,
  event text not null,
  actor_id uuid,
  -- "Website", or the staff member's name as it was at the time. A name
  -- rather than only an id, so the history still reads after an account goes.
  actor_label text not null,
  created_at timestamptz not null default now()
);

create index if not exists online_status_log_order_idx
  on public.online_status_log (order_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

drop trigger if exists online_categories_touch_updated_at on public.online_categories;
create trigger online_categories_touch_updated_at
  before update on public.online_categories
  for each row execute function public.touch_updated_at();

drop trigger if exists online_products_touch_updated_at on public.online_products;
create trigger online_products_touch_updated_at
  before update on public.online_products
  for each row execute function public.touch_updated_at();

drop trigger if exists online_designs_touch_updated_at on public.online_designs;
create trigger online_designs_touch_updated_at
  before update on public.online_designs
  for each row execute function public.touch_updated_at();

drop trigger if exists online_orders_touch_updated_at on public.online_orders;
create trigger online_orders_touch_updated_at
  before update on public.online_orders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

/*
  What an order comes to, added up from its own rows.

  `security_invoker = true`, and that is not decoration. The view reads
  `online_orders`, `online_order_items` and `online_payments`, three tables
  that staff see only with the apparel permission. A view running as its OWNER
  would hand every signed-in account the whole order book one row at a time -
  the exact mistake `public.collections` was written to avoid in Phase 10.

  Nothing is stored. An order's total is added up every time it is asked for,
  the same rule as a payslip, a receipt and an apparel job order: a stored
  total and a list of items can disagree, and the customer holding the sheet
  will believe whichever is larger.
*/
drop view if exists public.online_order_totals;
create view public.online_order_totals
with (security_invoker = true) as
select
  o.id as order_id,
  coalesce(i.fixed_total_centavos, 0) as fixed_total_centavos,
  o.quote_amount_centavos,
  coalesce(i.has_quote_items, false) as has_quote_items,
  coalesce(i.fixed_total_centavos, 0)
    + coalesce(o.quote_amount_centavos, 0) as total_centavos,
  coalesce(p.paid_centavos, 0) as paid_centavos,
  coalesce(i.fixed_total_centavos, 0)
    + coalesce(o.quote_amount_centavos, 0)
    - coalesce(p.paid_centavos, 0) as balance_centavos,
  coalesce(i.pieces, 0) as pieces
from public.online_orders o
left join lateral (
  select
    sum(
      case when it.pricing_mode = 'fixed'
        then it.unit_price_centavos * it.qty
        else 0
      end
    )::bigint as fixed_total_centavos,
    bool_or(it.pricing_mode = 'quote') as has_quote_items,
    sum(it.qty)::bigint as pieces
  from public.online_order_items it
  where it.order_id = o.id
) i on true
left join lateral (
  -- A voided payment is skipped everywhere. Forgetting this shows money that
  -- was handed back.
  select sum(pay.amount_centavos)::bigint as paid_centavos
  from public.online_payments pay
  where pay.order_id = o.id and pay.voided_at is null
) p on true;

comment on view public.online_order_totals is
  'Per order: the fixed total, the quote, what is paid and what is left. security_invoker, so the caller''s own policies decide which orders they see.';

/*
  How often each product has been ordered.

  This one runs with the VIEW OWNER'S rights - the opposite of the view above -
  and that is deliberate. "Most ordered" is the shop catalogue's default sort,
  so a visitor who is nobody has to be able to read it, and every order table
  underneath is shut to them.

  What it can leak is the whole of what it selects: a product id, a number of
  pieces and a number of orders. No customer, no date, no money, no row. That
  is a thing a customer could work out by watching the shop for a month, and
  it is what the specification asks to be public (6.4).

  The line that matters is below it: do not add a column here. Every column
  added to this view is added to what an anonymous visitor may read.
*/
drop view if exists public.online_product_stats;
create view public.online_product_stats as
select
  i.product_id,
  sum(i.qty)::bigint as pieces,
  count(distinct i.order_id)::bigint as order_count
from public.online_order_items i
join public.online_orders o on o.id = i.order_id
where o.status <> 'cancelled'
  and i.product_id is not null
group by i.product_id;

comment on view public.online_product_stats is
  'Pieces and orders per product, for the "Most ordered" sort. Runs with the owner''s rights on purpose so an anonymous visitor can sort by it: it exposes counts and never a row. Do not add a column.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.online_categories enable row level security;
alter table public.online_products enable row level security;
alter table public.online_product_images enable row level security;
alter table public.online_product_prices enable row level security;
alter table public.online_product_options enable row level security;
alter table public.online_designs enable row level security;
alter table public.online_design_products enable row level security;
alter table public.online_production_stages enable row level security;
alter table public.online_orders enable row level security;
alter table public.online_order_items enable row level security;
alter table public.online_order_roster enable row level security;
alter table public.online_order_files enable row level security;
alter table public.online_payments enable row level security;
alter table public.online_order_production enable row level security;
alter table public.online_status_log enable row level security;
alter table public.online_rate_events enable row level security;

/*
  `online_rate_events` gets NO policy at all - not read, not write, not for
  anybody signed in. It is the server's own notebook: an address and a storage
  path, kept only long enough to stop one person filling the bucket and to
  find the files nobody claimed. Nothing in the app reads it, so nothing needs
  to be allowed to.
*/

-- ---- The catalogue: the one thing a stranger may read ---------------------
--
-- A visitor arriving from Facebook is nobody, so these policies say `true` -
-- they are the shop window. Every one of them is narrowed to what is VISIBLE
-- and not deleted, so hiding a product takes it off the shop immediately
-- without any code asking.
--
-- Writing is Owner/Admin, the same rule as every other price list in this
-- system (spec 7.2). Staff read the catalogue because they write orders
-- against it.

drop policy if exists online_categories_read on public.online_categories;
create policy online_categories_read on public.online_categories
  for select using (true);

drop policy if exists online_categories_write on public.online_categories;
create policy online_categories_write on public.online_categories
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

drop policy if exists online_production_stages_read on public.online_production_stages;
create policy online_production_stages_read on public.online_production_stages
  for select using (true);

-- No write policy at all. The eight stages are fixed by the specification and
-- changing one would rewrite the history of every order already through it.

drop policy if exists online_products_read on public.online_products;
create policy online_products_read on public.online_products
  for select using (
    (is_visible and deleted_at is null)
    or public.current_role_name() is not null
  );

drop policy if exists online_products_write on public.online_products;
create policy online_products_write on public.online_products
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

drop policy if exists online_product_images_read on public.online_product_images;
create policy online_product_images_read on public.online_product_images
  for select using (
    public.current_role_name() is not null
    or exists (
      select 1 from public.online_products p
      where p.id = product_id and p.is_visible and p.deleted_at is null
    )
  );

drop policy if exists online_product_images_write on public.online_product_images;
create policy online_product_images_write on public.online_product_images
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

drop policy if exists online_product_prices_read on public.online_product_prices;
create policy online_product_prices_read on public.online_product_prices
  for select using (
    public.current_role_name() is not null
    or exists (
      select 1 from public.online_products p
      where p.id = product_id and p.is_visible and p.deleted_at is null
    )
  );

drop policy if exists online_product_prices_write on public.online_product_prices;
create policy online_product_prices_write on public.online_product_prices
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

drop policy if exists online_product_options_read on public.online_product_options;
create policy online_product_options_read on public.online_product_options
  for select using (
    public.current_role_name() is not null
    or exists (
      select 1 from public.online_products p
      where p.id = product_id and p.is_visible and p.deleted_at is null
    )
  );

drop policy if exists online_product_options_write on public.online_product_options;
create policy online_product_options_write on public.online_product_options
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

drop policy if exists online_designs_read on public.online_designs;
create policy online_designs_read on public.online_designs
  for select using (
    (is_visible and deleted_at is null)
    or public.current_role_name() is not null
  );

drop policy if exists online_designs_write on public.online_designs;
create policy online_designs_write on public.online_designs
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

drop policy if exists online_design_products_read on public.online_design_products;
create policy online_design_products_read on public.online_design_products
  for select using (true);

drop policy if exists online_design_products_write on public.online_design_products;
create policy online_design_products_write on public.online_design_products
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

-- ---- Orders: nothing for a stranger, and no writes for anybody ------------
--
-- Read is for Owner/Admin and for a staff member with the apparel permission:
-- these are Dabz Apparel's orders, and the person trusted with the job orders
-- is the person who runs these.
--
-- There is deliberately NO insert, update or delete policy on any table
-- below. Every write goes through one of the functions further down, which
-- check the caller themselves and write the order, its items, its money and
-- its history in ONE transaction. That is what makes it impossible to record
-- a payment without its log line, or to move an order to "ready to ship"
-- without doing the work.

drop policy if exists online_orders_read on public.online_orders;
create policy online_orders_read on public.online_orders
  for select using (
    public.is_owner_or_admin() or public.has_permission('apparel_job_orders')
  );

drop policy if exists online_order_items_read on public.online_order_items;
create policy online_order_items_read on public.online_order_items
  for select using (
    public.is_owner_or_admin() or public.has_permission('apparel_job_orders')
  );

drop policy if exists online_order_roster_read on public.online_order_roster;
create policy online_order_roster_read on public.online_order_roster
  for select using (
    public.is_owner_or_admin() or public.has_permission('apparel_job_orders')
  );

drop policy if exists online_order_files_read on public.online_order_files;
create policy online_order_files_read on public.online_order_files
  for select using (
    public.is_owner_or_admin() or public.has_permission('apparel_job_orders')
  );

drop policy if exists online_payments_read on public.online_payments;
create policy online_payments_read on public.online_payments
  for select using (
    public.is_owner_or_admin() or public.has_permission('apparel_job_orders')
  );

drop policy if exists online_order_production_read on public.online_order_production;
create policy online_order_production_read on public.online_order_production
  for select using (
    public.is_owner_or_admin() or public.has_permission('apparel_job_orders')
  );

drop policy if exists online_status_log_read on public.online_status_log;
create policy online_status_log_read on public.online_status_log
  for select using (
    public.is_owner_or_admin() or public.has_permission('apparel_job_orders')
  );

-- ---------------------------------------------------------------------------
-- Reading an order's step list
-- ---------------------------------------------------------------------------

/*
  The DTF path when EVERY item is a DTF print, otherwise the full eight.

  An order with one sublimated jersey in it goes the long way round even if
  the other nine lines are DTF, because the jersey still has to be cut and
  sewn. "Every item" is therefore the right test and "any item" would be the
  wrong one.

  An order with no items yet answers 'full', the longer of the two: it is the
  safe direction for a question about how much work is left.
*/
create or replace function public.online_order_path(p_order_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.online_order_items
      where order_id = p_order_id and production_path <> 'dtf'
    ) then 'full'
    when exists (
      select 1 from public.online_order_items where order_id = p_order_id
    ) then 'dtf'
    else 'full'
  end;
$$;

comment on function public.online_order_path(uuid) is
  'full or dtf. SECURITY DEFINER so the write functions can call it, and it answers only with the shape of the work - never with a row.';

-- ---------------------------------------------------------------------------
-- Placing an order, as one transaction
-- ---------------------------------------------------------------------------

/*
  THE ONE PLACE AN ORDER COMES INTO EXISTENCE.

  `online_orders` and every table hanging off it have no insert policy for
  anybody, so this function is the only way in - for the website and for the
  staff member typing in a Messenger order alike.

  It does not trust one figure the caller sends. The product, its name, its
  category, which way it goes through the workshop, its price and its minimum
  are all read back out of the database here; the quantity is worked out from
  the roster or the size tally rather than taken; a hidden or deleted product
  is refused. The browser's totals are a preview, and this is the record - the
  same shape as `complete_sale` at the counter.

  WHO MAY CALL IT. Nobody signed in means the website, and the website reaches
  this only through a Server Action that has already checked every field,
  capped every length, dropped a filled honeypot and counted how many orders
  that address has placed this hour. `anon` has no EXECUTE privilege, so the
  function is not a way round any of that. Somebody signed in means a staff
  member typing an order in, and they need the apparel permission.
*/
create or replace function public.create_online_order(
  p_customer_name text,
  p_mobile text,
  p_facebook_name text,
  p_method text,
  p_address text,
  p_date_needed date,
  p_notes text,
  p_items jsonb,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_label text := 'Website';
  v_source text := 'website';
  v_min_days integer;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_no text;
  v_token text;
  v_item jsonb;
  v_product record;
  v_qty integer;
  v_price bigint;
  v_variant text;
  v_item_id uuid;
  v_position integer := 0;
  v_roster jsonb;
  v_entry jsonb;
  v_sizes jsonb;
  v_option record;
  v_chosen text;
  -- Built up from the product's OWN options, never taken wholesale.
  v_options jsonb;
  v_sizes_clean jsonb;
  v_size text;
  -- Three scalars rather than one record: a record cannot be set back to
  -- nothing between loop passes, and most items carry no design at all.
  v_design_id uuid;
  v_design_code text;
  v_design_name text;
  v_index integer;
begin
  if v_actor is not null then
    if not (public.is_owner_or_admin() or public.has_permission('apparel_job_orders')) then
      raise exception 'You do not have permission to add an online order.'
        using errcode = '42501';
    end if;
    v_source := 'manual';
    select full_name into v_actor_label from public.profiles where id = v_actor;
    v_actor_label := coalesce(v_actor_label, 'Staff');
  end if;

  if length(btrim(coalesce(p_customer_name, ''))) = 0 then
    raise exception 'An order needs a name.';
  end if;

  if coalesce(p_mobile, '') !~ '^09[0-9]{9}$' then
    raise exception 'A mobile number is eleven digits starting 09.';
  end if;

  if coalesce(p_method, '') not in ('pickup', 'delivery') then
    raise exception 'Choose pick up or delivery.';
  end if;

  if p_method = 'delivery' and length(btrim(coalesce(p_address, ''))) = 0 then
    raise exception 'Delivery needs an address.';
  end if;

  if p_date_needed is null then
    raise exception 'An order needs a date it is needed by.';
  end if;

  select online_min_days_ahead into v_min_days from public.app_settings where id = 1;
  v_min_days := coalesce(v_min_days, 2);

  /*
    Staff typing in a Messenger order are NOT held to the lead time: the
    customer may already have agreed a date, and refusing to record what was
    agreed would only mean the date lived in the chat thread again. The
    website is held to it, because there the date is still being chosen.
  */
  if v_source = 'website'
     and p_date_needed < ((now() at time zone 'Asia/Manila')::date + v_min_days) then
    raise exception 'The earliest date we can take is % days from today.', v_min_days;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order needs at least one item.';
  end if;

  -- One customer row per number. The name, Facebook name and address are
  -- brought up to date, because the newest order is the newest answer.
  select id into v_customer_id
  from public.customers
  where contact_number = p_mobile
  order by updated_at desc
  limit 1;

  if v_customer_id is null then
    insert into public.customers (name, contact_number, facebook_name, address, created_by)
    values (btrim(p_customer_name), p_mobile, nullif(btrim(coalesce(p_facebook_name, '')), ''),
            nullif(btrim(coalesce(p_address, '')), ''), v_actor)
    returning id into v_customer_id;
  else
    update public.customers set
      name = btrim(p_customer_name),
      facebook_name = coalesce(nullif(btrim(coalesce(p_facebook_name, '')), ''), facebook_name),
      address = coalesce(nullif(btrim(coalesce(p_address, '')), ''), address)
    where id = v_customer_id;
  end if;

  v_order_no := 'DA-' || lpad(nextval('public.online_order_no_seq')::text, 4, '0');
  -- Two uuids' worth of randomness, so the "order received" page cannot be
  -- walked by guessing. No extension needed to produce it.
  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');

  insert into public.online_orders (
    order_no, customer_id, customer_name, mobile, facebook_name,
    method, address, date_needed, notes, source, receipt_token,
    ip_address, created_by
  ) values (
    v_order_no, v_customer_id, btrim(p_customer_name), p_mobile,
    nullif(btrim(coalesce(p_facebook_name, '')), ''),
    p_method, nullif(btrim(coalesce(p_address, '')), ''), p_date_needed,
    nullif(btrim(coalesce(p_notes, '')), ''), v_source, v_token,
    -- Only for a website order. Staff typing one in are not a stranger to be
    -- rate limited, and their address is nobody's business.
    case when v_source = 'website' then p_ip_address else null end,
    v_actor
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_position := v_position + 1;

    select p.id, p.name, p.pricing_mode, p.min_order_qty, p.uses_sizes, p.uses_roster,
           p.uses_design_gallery, c.name as category_name, c.production_path
      into v_product
    from public.online_products p
    left join public.online_categories c on c.id = p.category_id
    where p.id = (v_item ->> 'product_id')::uuid
      and p.is_visible
      and p.deleted_at is null;

    if not found then
      raise exception 'One of the items is no longer on the shop. Please open your order again.';
    end if;

    v_roster := coalesce(v_item -> 'roster', '[]'::jsonb);
    if jsonb_typeof(v_roster) <> 'array' then v_roster := '[]'::jsonb; end if;

    /*
      The size tally, rebuilt from the SEVEN SIZES THE SHOP SELLS rather than
      taken as sent. A "4XL: 5" that came from a browser would otherwise be
      counted into the quantity and printed on the job order, and there is no
      4XL to cut.
    */
    v_sizes_clean := '{}'::jsonb;
    for v_size, v_chosen in
      select key, value from jsonb_each_text(coalesce(v_item -> 'sizes', '{}'::jsonb))
    loop
      if v_size = any (array['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'])
         and v_chosen ~ '^[0-9]+$'
         and v_chosen::integer > 0 then
        v_sizes_clean := v_sizes_clean || jsonb_build_object(v_size, v_chosen::integer);
      end if;
    end loop;

    -- The quantity is DERIVED, never taken. A roster is the quantity; a size
    -- tally is the quantity; only a product with neither has a typed one.
    if v_product.uses_roster then
      v_qty := jsonb_array_length(v_roster);
      v_sizes := '{}'::jsonb;
    elsif v_product.uses_sizes then
      select coalesce(sum(value::integer), 0) into v_qty
      from jsonb_each_text(v_sizes_clean);
      v_sizes := v_sizes_clean;
    else
      -- A quantity that is not a number at all is nothing, not an error with
      -- a cast in it that nobody at a counter could read.
      v_qty := case
        when coalesce(v_item ->> 'qty', '') ~ '^[0-9]+$'
          then (v_item ->> 'qty')::integer
        else 0
      end;
      v_sizes := '{}'::jsonb;
    end if;

    if v_qty < 1 then
      raise exception '% needs at least one piece.', v_product.name;
    end if;

    if v_qty < v_product.min_order_qty then
      raise exception 'The smallest order for % is % pieces. You have %.',
        v_product.name, v_product.min_order_qty, v_qty;
    end if;

    -- Every option the product asks must be answered, and answered with one
    -- of its own choices. A product whose options changed since the cart was
    -- filled is refused rather than stored with a made-up answer.
    v_options := '{}'::jsonb;
    for v_option in
      select name, choices from public.online_product_options
      where product_id = v_product.id order by sort_order, name
    loop
      v_chosen := coalesce(v_item -> 'options', '{}'::jsonb) ->> v_option.name;
      if v_chosen is null or not (v_chosen = any (v_option.choices)) then
        raise exception 'The choices for % have changed. Please open it again and re-pick.',
          v_product.name;
      end if;
      -- Only the product's own questions are kept. Anything else the caller
      -- put in that object is dropped rather than stored and later printed.
      v_options := v_options || jsonb_build_object(v_option.name, v_chosen);
    end loop;

    v_variant := nullif(btrim(coalesce(v_item ->> 'variant_label', '')), '');
    v_price := null;

    if v_product.pricing_mode = 'fixed' then
      -- The price comes from the database, never from the browser.
      if v_variant is null then
        select price_centavos, label into v_price, v_variant
        from public.online_product_prices
        where product_id = v_product.id
        order by sort_order, price_centavos
        limit 1;
      else
        select price_centavos into v_price
        from public.online_product_prices
        where product_id = v_product.id and label = v_variant
        limit 1;
      end if;

      if v_price is null then
        raise exception 'The price for % has changed. Please open it again.', v_product.name;
      end if;
    end if;

    v_design_id := null;
    v_design_code := null;
    v_design_name := null;

    if (v_item ->> 'design_id') is not null and v_product.uses_design_gallery then
      select d.id, d.code, d.name into v_design_id, v_design_code, v_design_name
      from public.online_designs d
      join public.online_design_products dp on dp.design_id = d.id
      where d.id = (v_item ->> 'design_id')::uuid
        and dp.product_id = v_product.id
        and d.is_visible
        and d.deleted_at is null;

      if not found then
        raise exception 'That design is no longer offered on %.', v_product.name;
      end if;
    end if;

    insert into public.online_order_items (
      order_id, product_id, product_name, category_name, production_path,
      pricing_mode, variant_label, unit_price_centavos, options, qty, sizes,
      design_id, design_code, design_name, team_colors, notes, position, created_by
    ) values (
      v_order_id, v_product.id, v_product.name,
      coalesce(v_product.category_name, 'Uncategorised'),
      coalesce(v_product.production_path, 'full'),
      v_product.pricing_mode, v_variant, v_price,
      v_options, v_qty, v_sizes,
      v_design_id, v_design_code, v_design_name,
      nullif(btrim(coalesce(v_item ->> 'team_colors', '')), ''),
      nullif(btrim(coalesce(v_item ->> 'notes', '')), ''),
      v_position, v_actor
    )
    returning id into v_item_id;

    if v_product.uses_roster then
      v_index := 0;
      for v_entry in select * from jsonb_array_elements(v_roster)
      loop
        v_index := v_index + 1;
        v_size := upper(btrim(coalesce(v_entry ->> 'size', '')));
        if not (v_size = any (array['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'])) then
          raise exception 'Every player needs a size we make. Row % of % has "%".',
            v_index, v_product.name, coalesce(v_entry ->> 'size', '');
        end if;

        insert into public.online_order_roster
          (order_item_id, position, player_name, player_number, size)
        values (
          v_item_id,
          v_index,
          nullif(left(upper(btrim(coalesce(v_entry ->> 'player_name', ''))), 20), ''),
          -- A number that is not one to three digits is dropped rather than
          -- refused: the team can still be cut, and nobody is turned away
          -- over a typo in a jersey number.
          case
            when btrim(coalesce(v_entry ->> 'player_number', '')) ~ '^[0-9]{1,3}$'
              then btrim(v_entry ->> 'player_number')
            else null
          end,
          v_size
        );
      end loop;
    end if;

    for v_entry in select * from jsonb_array_elements(coalesce(v_item -> 'files', '[]'::jsonb))
    loop
      insert into public.online_order_files
        (order_item_id, storage_path, original_name, mime_type, size_bytes)
      values (
        v_item_id,
        v_entry ->> 'storage_path',
        left(coalesce(v_entry ->> 'original_name', 'attachment'), 200),
        v_entry ->> 'mime_type',
        nullif(v_entry ->> 'size_bytes', '')::bigint
      );

      -- The purge leaves a claimed file alone: an order points at it now.
      update public.online_rate_events
      set claimed_at = now()
      where kind = 'upload' and storage_path = v_entry ->> 'storage_path';
    end loop;
  end loop;

  insert into public.online_status_log (order_id, event, actor_id, actor_label)
  values (v_order_id, 'New', v_actor, v_actor_label);

  return jsonb_build_object(
    'id', v_order_id,
    'order_no', v_order_no,
    'receipt_token', v_token
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Moving an order along - all of it from the shop floor, none of it from anon
-- ---------------------------------------------------------------------------

-- Peso amounts inside a log line. The history is read by people, so it says
-- "Payment PHP 2,250.00 Cash" rather than a column of centavos.
create or replace function public.online_pesos(p_centavos bigint)
returns text
language sql
immutable
as $$
  select '₱' || to_char(p_centavos / 100.0, 'FM999,999,999,990.00');
$$;

/*
  Refuses anybody who is not Owner, Admin, or a staff member with the apparel
  permission, and otherwise hands back the name to write in the history.

  It checks the CALLER itself rather than trusting whoever called it, because
  PostgREST publishes every function as a URL - one that answered anybody
  would be a way to read a name out of `profiles` one request at a time.
*/
create or replace function public.online_staff_label()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not (public.is_owner_or_admin() or public.has_permission('apparel_job_orders')) then
    raise exception 'You do not have permission to work on online orders.'
      using errcode = '42501';
  end if;

  select full_name into v_name from public.profiles where id = auth.uid();
  return coalesce(v_name, 'Staff');
end;
$$;

create or replace function public.online_send_quote(
  p_order_id uuid,
  p_amount_centavos bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := public.online_staff_label();
  v_status text;
begin
  if p_amount_centavos is null or p_amount_centavos < 0 then
    raise exception 'A quote is an amount of nothing or more.';
  end if;

  select status into v_status from public.online_orders where id = p_order_id for update;
  if not found then
    raise exception 'That order no longer exists.';
  end if;

  if v_status not in ('new', 'quoted') then
    raise exception 'A quote can only be set on an order that is New or Quoted.';
  end if;

  update public.online_orders
  set quote_amount_centavos = p_amount_centavos,
      -- Saving a quote on a New order quotes it, in the same action. Two
      -- buttons for one act is how an order ends up priced but still "New".
      status = 'quoted'
  where id = p_order_id;

  insert into public.online_status_log (order_id, event, actor_id, actor_label)
  values (p_order_id, 'Quoted ' || public.online_pesos(p_amount_centavos), auth.uid(), v_label);
end;
$$;

create or replace function public.online_set_status(
  p_order_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := public.online_staff_label();
  v_status text;
  v_has_quote_items boolean;
  v_quote bigint;
  v_event text;
begin
  select o.status, o.quote_amount_centavos,
         exists (
           select 1 from public.online_order_items i
           where i.order_id = o.id and i.pricing_mode = 'quote'
         )
    into v_status, v_quote, v_has_quote_items
  from public.online_orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'That order no longer exists.';
  end if;

  if p_status = 'confirmed' then
    if v_status not in ('new', 'quoted') then
      raise exception 'Only a New or Quoted order can be confirmed.';
    end if;
    -- An order with something still to be priced cannot be agreed to: the
    -- customer has not been told what it costs.
    if v_has_quote_items and v_quote is null then
      raise exception 'Send the quote first - part of this order has no price yet.';
    end if;
    v_event := 'Confirmed';

  elsif p_status = 'in_production' then
    if v_status <> 'confirmed' then
      raise exception 'Production starts from a confirmed order.';
    end if;
    v_event := 'Production started';

  elsif p_status = 'completed' then
    if v_status <> 'ready_to_ship' then
      raise exception 'An order is completed once it is ready to ship and the customer has it.';
    end if;
    v_event := 'Completed';

  elsif p_status = 'cancelled' then
    if v_status not in ('new', 'quoted', 'confirmed') then
      raise exception 'An order already in production cannot be cancelled here.';
    end if;
    v_event := 'Cancelled'
      || coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), '');

  else
    -- 'ready_to_ship' is reached by finishing the work, never by saying so.
    raise exception 'An order cannot be moved to % by hand.', p_status;
  end if;

  update public.online_orders
  set status = p_status,
      completed_at = case when p_status = 'completed' then now() else completed_at end,
      cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
      cancel_reason = case
        when p_status = 'cancelled' then nullif(btrim(coalesce(p_reason, '')), '')
        else cancel_reason
      end
  where id = p_order_id;

  insert into public.online_status_log (order_id, event, actor_id, actor_label)
  values (p_order_id, v_event, auth.uid(), v_label);
end;
$$;

create or replace function public.online_set_date_needed(
  p_order_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := public.online_staff_label();
  v_status text;
  v_old date;
begin
  if p_date is null then
    raise exception 'An order needs a date it is needed by.';
  end if;

  select status, date_needed into v_status, v_old
  from public.online_orders where id = p_order_id for update;

  if not found then
    raise exception 'That order no longer exists.';
  end if;

  if v_status in ('completed', 'cancelled') then
    raise exception 'A finished order''s date cannot be moved.';
  end if;

  if v_old = p_date then
    return;
  end if;

  update public.online_orders set date_needed = p_date where id = p_order_id;

  insert into public.online_status_log (order_id, event, actor_id, actor_label)
  values (
    p_order_id,
    'Date moved to ' || to_char(p_date, 'FMMon FMDD'),
    auth.uid(),
    v_label
  );
end;
$$;

/*
  Marking the CURRENT step done, or not needed for this order.

  Three rules live here and nowhere else, so a board, an order page and an
  action cannot disagree about them:

    * only the current step may be acted on, and the current step is the first
      one in this order's path with no row;
    * the first step also starts production, so nobody has to press two
      buttons to begin;
    * the last step makes the order ready to ship by itself. There is no
      button for that, on purpose - an order that says it is packed when it is
      not is a customer standing at the counter.
*/
create or replace function public.online_mark_stage(
  p_order_id uuid,
  p_stage_key text,
  p_skipped boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := public.online_staff_label();
  v_status text;
  v_path text;
  v_current text;
  v_stage_label text;
  v_remaining integer;
begin
  select status into v_status from public.online_orders where id = p_order_id for update;
  if not found then
    raise exception 'That order no longer exists.';
  end if;

  if v_status not in ('confirmed', 'in_production') then
    raise exception 'Production steps are ticked on a confirmed order that is not finished.';
  end if;

  v_path := public.online_order_path(p_order_id);

  select s.key, s.label into v_current, v_stage_label
  from public.online_production_stages s
  where (v_path = 'full' or s.in_dtf_path)
    and not exists (
      select 1 from public.online_order_production p
      where p.order_id = p_order_id and p.stage_key = s.key
    )
  order by s.position
  limit 1;

  if v_current is null then
    raise exception 'Every step on this order is already done.';
  end if;

  if v_current <> p_stage_key then
    raise exception 'Steps are done in order. The next one is %.', v_stage_label;
  end if;

  insert into public.online_order_production
    (order_id, stage_key, done_by, done_by_name, skipped)
  values (p_order_id, v_current, auth.uid(), v_label, coalesce(p_skipped, false));

  select count(*) into v_remaining
  from public.online_production_stages s
  where (v_path = 'full' or s.in_dtf_path)
    and not exists (
      select 1 from public.online_order_production p
      where p.order_id = p_order_id and p.stage_key = s.key
    );

  update public.online_orders
  set status = case when v_remaining = 0 then 'ready_to_ship' else 'in_production' end
  where id = p_order_id;

  insert into public.online_status_log (order_id, event, actor_id, actor_label)
  values (
    p_order_id,
    v_stage_label || case when coalesce(p_skipped, false) then ': not needed' else ' OK' end,
    auth.uid(),
    v_label
  );

  if v_remaining = 0 then
    insert into public.online_status_log (order_id, event, actor_id, actor_label)
    values (p_order_id, 'Ready to ship', auth.uid(), v_label);
  end if;
end;
$$;

create or replace function public.online_undo_stage(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := public.online_staff_label();
  v_status text;
  v_path text;
  v_last text;
  v_stage_label text;
begin
  select status into v_status from public.online_orders where id = p_order_id for update;
  if not found then
    raise exception 'That order no longer exists.';
  end if;

  if v_status not in ('in_production', 'ready_to_ship') then
    raise exception 'There is nothing to undo on this order.';
  end if;

  v_path := public.online_order_path(p_order_id);

  -- The LAST step in path order, not the most recently ticked: undoing must
  -- walk back along the path, whatever order the rows happen to carry.
  select s.key, s.label into v_last, v_stage_label
  from public.online_production_stages s
  join public.online_order_production p
    on p.stage_key = s.key and p.order_id = p_order_id
  where (v_path = 'full' or s.in_dtf_path)
  order by s.position desc
  limit 1;

  if v_last is null then
    raise exception 'There is nothing to undo on this order.';
  end if;

  delete from public.online_order_production
  where order_id = p_order_id and stage_key = v_last;

  update public.online_orders set status = 'in_production' where id = p_order_id;

  insert into public.online_status_log (order_id, event, actor_id, actor_label)
  values (p_order_id, 'Undo: ' || v_stage_label, auth.uid(), v_label);
end;
$$;

/*
  Taking a payment.

  `online_payments` has no insert policy for anybody, so this is the way in,
  and it writes the payment and its log line together. Version 1 writes
  NOTHING to the shop's ledger: the three sanctioned paths into it stay three
  (see AGENTS.md), and whether an online order is the same money as an apparel
  job order is a decision about the books, not a detail to settle here.
*/
create or replace function public.online_record_payment(
  p_order_id uuid,
  p_amount_centavos bigint,
  p_method text,
  p_paid_on date,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := public.online_staff_label();
  v_status text;
  v_payment_id uuid;
  v_method_label text;
begin
  if p_amount_centavos is null or p_amount_centavos <= 0 then
    raise exception 'A payment is an amount above zero.';
  end if;

  -- 'gateway' is reserved for the payment gateway that is not built. Nobody
  -- may type it in by hand, or the books would show an online payment that
  -- never went through one.
  if coalesce(p_method, '') not in ('cash', 'gcash_manual', 'bank_transfer') then
    raise exception 'Choose cash, GCash or a bank transfer.';
  end if;

  select status into v_status from public.online_orders where id = p_order_id;
  if not found then
    raise exception 'That order no longer exists.';
  end if;

  if v_status = 'cancelled' then
    raise exception 'That order is cancelled.';
  end if;

  v_method_label := case p_method
    when 'cash' then 'Cash'
    when 'gcash_manual' then 'GCash'
    else 'Bank transfer'
  end;

  insert into public.online_payments
    (order_id, amount_centavos, method, paid_on, recorded_by, note, created_by)
  values (
    p_order_id, p_amount_centavos, p_method,
    coalesce(p_paid_on, (now() at time zone 'Asia/Manila')::date),
    auth.uid(), nullif(btrim(coalesce(p_note, '')), ''), auth.uid()
  )
  returning id into v_payment_id;

  insert into public.online_status_log (order_id, event, actor_id, actor_label)
  values (
    p_order_id,
    'Payment ' || public.online_pesos(p_amount_centavos) || ' ' || v_method_label,
    auth.uid(),
    v_label
  );

  return v_payment_id;
end;
$$;

-- Staff take a payment; only Owner/Admin take one back (spec 4.4). A voided
-- row stays, struck through, and every sum skips it.
create or replace function public.online_void_payment(
  p_payment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_order_id uuid;
  v_amount bigint;
begin
  if not public.is_owner_or_admin() then
    raise exception 'Only the owner or an admin can void a payment.'
      using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Say why the payment is being voided.';
  end if;

  select full_name into v_label from public.profiles where id = auth.uid();
  v_label := coalesce(v_label, 'Staff');

  select order_id, amount_centavos into v_order_id, v_amount
  from public.online_payments
  where id = p_payment_id and voided_at is null
  for update;

  if not found then
    raise exception 'That payment no longer exists, or is already voided.';
  end if;

  update public.online_payments
  set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  where id = p_payment_id;

  insert into public.online_status_log (order_id, event, actor_id, actor_label)
  values (
    v_order_id,
    'Voided payment ' || public.online_pesos(v_amount) || ': ' || btrim(p_reason),
    auth.uid(),
    v_label
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

/*
  EXECUTE is granted to PUBLIC by default in PostgreSQL, and PUBLIC includes
  `anon`. Left alone, every function above would be a URL a stranger could
  post to - which for `create_online_order` would mean a way round the
  validation, the length caps, the honeypot and the rate limit that the Server
  Action does first.

  So: revoked from everybody, then handed back deliberately.

    * create_online_order  -> the server (service_role) for a website order,
                              and signed-in staff for a Messenger or walk-in
                              one. Never anon.
    * everything else      -> signed-in staff only. Each one re-checks the
                              caller anyway; this is the belt beside it.
*/
revoke all on function public.create_online_order(text, text, text, text, text, date, text, jsonb, text) from public;
revoke all on function public.online_staff_label() from public;
revoke all on function public.online_order_path(uuid) from public;
revoke all on function public.online_pesos(bigint) from public;
revoke all on function public.online_send_quote(uuid, bigint) from public;
revoke all on function public.online_set_status(uuid, text, text) from public;
revoke all on function public.online_set_date_needed(uuid, date) from public;
revoke all on function public.online_mark_stage(uuid, text, boolean) from public;
revoke all on function public.online_undo_stage(uuid) from public;
revoke all on function public.online_record_payment(uuid, bigint, text, date, text) from public;
revoke all on function public.online_void_payment(uuid, text) from public;

grant execute on function public.create_online_order(text, text, text, text, text, date, text, jsonb, text)
  to authenticated, service_role;
grant execute on function public.online_staff_label() to authenticated;
-- The server reads the path too, when it puts an order's steps in an email.
grant execute on function public.online_order_path(uuid) to authenticated, service_role;
grant execute on function public.online_pesos(bigint) to authenticated;
grant execute on function public.online_send_quote(uuid, bigint) to authenticated;
grant execute on function public.online_set_status(uuid, text, text) to authenticated;
grant execute on function public.online_set_date_needed(uuid, date) to authenticated;
grant execute on function public.online_mark_stage(uuid, text, boolean) to authenticated;
grant execute on function public.online_undo_stage(uuid) to authenticated;
grant execute on function public.online_record_payment(uuid, bigint, text, date, text) to authenticated;
grant execute on function public.online_void_payment(uuid, text) to authenticated;

-- The order number sequence is stepped inside create_online_order, which runs
-- as its owner, so nobody else needs it.
revoke all on sequence public.online_order_no_seq from public;

/*
  Table privileges, said out loud.

  Supabase's own default privileges already hand `anon` and `authenticated`
  SELECT on a new table in `public`, and RLS is what decides the rows. This
  repeats it for the catalogue anyway, because the shop window is the one part
  of this module that a project-level setting could quietly close: a visitor
  who cannot select the products sees an empty shop and no error at all.

  Only the catalogue and the two views. The order tables are left exactly as
  Supabase made them - their policies are what keep them shut, and adding a
  grant here would say something this file does not mean.
*/
grant select on
  public.online_categories,
  public.online_products,
  public.online_product_images,
  public.online_product_prices,
  public.online_product_options,
  public.online_designs,
  public.online_design_products,
  public.online_production_stages,
  public.online_product_stats
to anon, authenticated;

grant select on public.online_order_totals to authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------

/*
  Supabase provides the `storage` schema; a plain PostgreSQL does not, and the
  security-rule suite runs against one. So this whole block is skipped when
  there is no storage schema, rather than failing a test run that has nothing
  to do with buckets.

  Two buckets are public: a product photo and a design mockup are the shop
  window. One is private and stays that way - `order-files` holds whatever a
  customer uploaded, which is their artwork and sometimes their logo, and
  staff reach it through a signed link that expires in minutes.
*/
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'No storage schema here - skipping the online shop buckets.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('product-images', 'product-images', true, 5242880,
     array['image/jpeg', 'image/png', 'image/webp']),
    ('design-images', 'design-images', true, 5242880,
     array['image/jpeg', 'image/png', 'image/webp']),
    ('order-files', 'order-files', false, 20971520,
     array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  /*
    Owner/Admin put pictures up and take them down; everybody may look at the
    two public buckets, because that is what a shop window is.

    `storage.objects` belongs to `supabase_storage_admin`, and a project whose
    `postgres` role has not been granted on it will refuse these. That is
    worth FAILING for rather than skipping quietly - a bucket with no write
    policy is a bucket nobody can upload to, and finding that out from a
    screen that silently does nothing is far worse than finding it out here.
    The handler below only makes the refusal say what to do about it.
  */
  begin
  execute $p$
    drop policy if exists online_public_images_read on storage.objects;
    create policy online_public_images_read on storage.objects
      for select using (bucket_id in ('product-images', 'design-images'));

    drop policy if exists online_public_images_write on storage.objects;
    create policy online_public_images_write on storage.objects
      for all
      using (bucket_id in ('product-images', 'design-images') and public.is_owner_or_admin())
      with check (bucket_id in ('product-images', 'design-images') and public.is_owner_or_admin());

    drop policy if exists online_order_files_read on storage.objects;
    create policy online_order_files_read on storage.objects
      for select using (
        bucket_id = 'order-files'
        and (public.is_owner_or_admin() or public.has_permission('apparel_job_orders'))
      );
  $p$;
  exception when insufficient_privilege then
    raise exception 'This project''s postgres role may not write storage policies (%). Paste the three policies in this block into the Supabase SQL editor, or add them under Storage -> Policies, before anybody uploads a picture.', sqlerrm;
  end;

  /*
    No write policy on `order-files` for anybody signed in or not. A customer's
    upload arrives before their order exists, so it is written by the server
    with the service-role client after the bytes have been looked at - the
    same shape as the enquiry form, and for the same reason: the one place a
    stranger causes something to exist stays shut, and the way in is code that
    can be read and tested.
  */
end;
$$;
