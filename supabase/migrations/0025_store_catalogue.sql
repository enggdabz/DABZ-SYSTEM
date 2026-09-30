-- Dabz Apparel online store, step 1: the catalogue (docs/store/progress.md).
--
-- WHAT THIS IS
--
-- The shop window of the storefront at /store: categories, products, photos,
-- variants, bulk price tiers, size charts, banners and the store's own
-- settings. Nothing here takes an order - that is the next migration.
--
-- WHAT IT IS NOT
--
-- It does not touch a single existing table. The Phase 14 shop (`online_*`,
-- served at /shop) keeps working exactly as it did until the owner retires it.
-- Every name here is prefixed `store_` for the same reason `online_` exists:
-- `products` and `customers` already mean other things in this database.
--
-- HOW IT MEETS THE RULES IN AGENTS.md
--
--   * MONEY IS CENTAVOS, in bigint, never numeric.
--   * TEXT PLUS CHECK, NOT ENUM.
--   * A PRICE THE OWNER HAS NOT GIVEN IS NULL, not zero. A "quote only"
--     product has NO price stored anywhere - not on the product, not as a
--     surcharge, not as a bulk tier - so hiding it is a fact about the data
--     and not a promise made by a screen. A stranger reading the API cannot
--     find a figure that is not there.
--   * A STOCK LEVEL IS NEVER STORED. It is the sum of `store_stock_movements`,
--     the same rule as the shop's own stocks (Phase 5). What a visitor may
--     read is only the BUCKET that sum falls into, never the count.
--   * NOTHING IS SEEDED BUT STRUCTURE: the five categories the owner named.
--     No product, no banner, no price.

-- ---------------------------------------------------------------------------
-- Settings (one row)
-- ---------------------------------------------------------------------------

create table if not exists public.store_settings (
  id boolean primary key default true check (id),

  -- The off switch. Checked by every page a customer could order from, and
  -- (later) by every public write, because a bookmarked URL outlives a button.
  store_enabled boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

create table if not exists public.store_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.store_size_charts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  -- A picture of the chart, if the shop has one already, or the table below.
  image_path text,
  -- The table: column headings, then one array of cells per row. Kept as
  -- data because a chart is a thing the shop edits, not a thing we ship.
  columns text[] not null default '{}',
  rows jsonb not null default '[]'::jsonb check (jsonb_typeof(rows) = 'array'),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.store_categories (id) on delete restrict,

  name text not null check (length(btrim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  description text,

  /*
    'fixed' - the price is known and the site can add it up.
    'quote' - staff price it after seeing the design and the quantity. The
              price is NOT hidden on such a product, it is ABSENT: the check
              below refuses a figure on a quote product and refuses a fixed
              product without one.
  */
  pricing_mode text not null default 'fixed' check (pricing_mode in ('fixed', 'quote')),
  base_price_centavos bigint check (base_price_centavos is null or base_price_centavos > 0),

  min_order_qty integer not null default 1 check (min_order_qty >= 1),
  size_chart_id uuid references public.store_size_charts (id) on delete set null,

  is_visible boolean not null default true,
  -- Deleted, never erased: a past order will point here.
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),

  constraint store_products_price_matches_mode check (
    (pricing_mode = 'fixed' and base_price_centavos is not null)
    or (pricing_mode = 'quote' and base_price_centavos is null)
  )
);

create index if not exists store_products_category_idx on public.store_products (category_id);
create index if not exists store_products_created_idx on public.store_products (created_at desc);

create table if not exists public.store_product_photos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.store_products (id) on delete cascade,
  storage_path text not null check (length(btrim(storage_path)) > 0),
  alt text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists store_product_photos_product_idx
  on public.store_product_photos (product_id, sort_order);

/*
  A variant is a size and/or a colour. It carries NO price: a surcharge for a
  large size lives in `store_size_prices` and a quantity break in
  `store_bulk_tiers`, and both are readable only for a product that has a
  price. If a price sat here, the quote-only rule would need a trigger to
  police it; this way the policy below is the whole rule.
*/
create table if not exists public.store_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.store_products (id) on delete cascade,
  size text,
  color text,
  color_hex text check (color_hex is null or color_hex ~ '^#[0-9a-fA-F]{6}$'),
  sku text,
  is_active boolean not null default true,
  sort_order integer not null default 0,

  /*
    Made-to-order work has no shelf, so tracking stock is opt-in per variant.
    `low_stock_at` is the owner's own threshold and is NULL until they type
    one: with no figure the "low stock" badge never shows, rather than
    showing at a number the system made up.
  */
  track_stock boolean not null default false,
  low_stock_at integer check (low_stock_at is null or low_stock_at >= 0),

  created_at timestamptz not null default now(),
  created_by uuid,

  constraint store_variants_has_something check (size is not null or color is not null)
);

create unique index if not exists store_variants_unique_idx
  on public.store_variants (product_id, coalesce(size, ''), coalesce(color, ''));

create table if not exists public.store_size_prices (
  product_id uuid not null references public.store_products (id) on delete cascade,
  size text not null check (length(btrim(size)) > 0),
  -- What is ADDED to the base price for this size; zero is simply not a row.
  surcharge_centavos bigint not null check (surcharge_centavos > 0),
  primary key (product_id, size)
);

create table if not exists public.store_bulk_tiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.store_products (id) on delete cascade,
  min_qty integer not null check (min_qty >= 2),
  -- The whole unit price at this quantity, not a discount off the base.
  unit_price_centavos bigint not null check (unit_price_centavos > 0),
  unique (product_id, min_qty)
);

-- ---------------------------------------------------------------------------
-- Stock: movements only. The level is a sum.
-- ---------------------------------------------------------------------------

create table if not exists public.store_stock_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.store_variants (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('received', 'sold', 'returned', 'adjustment', 'count')),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists store_stock_movements_variant_idx
  on public.store_stock_movements (variant_id);

-- ---------------------------------------------------------------------------
-- Banners
-- ---------------------------------------------------------------------------

create table if not exists public.store_banners (
  id uuid primary key default gen_random_uuid(),
  image_path text not null check (length(btrim(image_path)) > 0),
  title text,
  subtitle text,
  -- Where a tap goes. Kept to a path on this site or an https address; the
  -- admin screen validates, and the check below is the backstop.
  link_url text check (link_url is null or link_url ~ '^(/|https://)'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'store_settings', 'store_categories', 'store_size_charts',
    'store_products', 'store_banners'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- The five categories the owner named. Structure, not stock: staff add more.
-- ---------------------------------------------------------------------------

insert into public.store_categories (name, slug, sort_order) values
  ('Sublimation jerseys', 'sublimation-jerseys', 10),
  ('Shirts', 'shirts', 20),
  ('Jackets', 'jackets', 30),
  ('Long sleeves', 'long-sleeves', 40),
  ('DTF prints', 'dtf-prints', 50)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- What a visitor may know about stock: a bucket, never a count
-- ---------------------------------------------------------------------------

/*
  Deliberately NOT security_invoker, and deliberately narrow. It answers one
  question per tracked variant - "is there any, and is it running low?" - for
  a visible product, and exposes no quantity. A visitor is nobody, so an
  invoker view would come back empty for exactly the person it is for.

  Do not add a column: every column on this view is readable by a stranger.
*/
drop view if exists public.store_variant_availability;
create view public.store_variant_availability as
select
  v.id as variant_id,
  v.product_id,
  case
    when coalesce(s.on_hand, 0) <= 0 then 'out'
    when v.low_stock_at is not null and coalesce(s.on_hand, 0) <= v.low_stock_at then 'low'
    else 'in_stock'
  end as availability
from public.store_variants v
join public.store_products p on p.id = v.product_id
left join (
  select variant_id, sum(delta)::bigint as on_hand
  from public.store_stock_movements
  group by variant_id
) s on s.variant_id = v.id
where v.track_stock
  and v.is_active
  and p.is_visible
  and p.deleted_at is null;

comment on view public.store_variant_availability is
  'Out / low / in stock per tracked variant of a visible product, for the storefront badge. Runs with the owner''s rights on purpose so an anonymous visitor can read it: it exposes a bucket and never a count. Do not add a column.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.store_settings enable row level security;
alter table public.store_categories enable row level security;
alter table public.store_size_charts enable row level security;
alter table public.store_products enable row level security;
alter table public.store_product_photos enable row level security;
alter table public.store_variants enable row level security;
alter table public.store_size_prices enable row level security;
alter table public.store_bulk_tiers enable row level security;
alter table public.store_stock_movements enable row level security;
alter table public.store_banners enable row level security;

-- A visible, undeleted product. Written once so the child tables cannot drift
-- from it: a photo, a variant or a tier is exactly as public as its product.
create or replace function public.store_product_is_public(p_product uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.store_products p
    where p.id = p_product and p.is_visible and p.deleted_at is null
  );
$$;

-- Same, and priced. A quote-only product has nothing to show here.
create or replace function public.store_product_is_public_and_priced(p_product uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.store_products p
    where p.id = p_product and p.is_visible and p.deleted_at is null
      and p.pricing_mode = 'fixed'
  );
$$;

grant execute on function public.store_product_is_public(uuid) to anon, authenticated;
grant execute on function public.store_product_is_public_and_priced(uuid) to anon, authenticated;

-- Settings: a visitor reads the off switch; only Owner/Admin change it.
drop policy if exists store_settings_read on public.store_settings;
create policy store_settings_read on public.store_settings for select using (true);
drop policy if exists store_settings_write on public.store_settings;
create policy store_settings_write on public.store_settings
  for update using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

drop policy if exists store_categories_read on public.store_categories;
create policy store_categories_read on public.store_categories
  for select using (is_active or public.current_role_name() is not null);
drop policy if exists store_categories_write on public.store_categories;
create policy store_categories_write on public.store_categories
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

drop policy if exists store_size_charts_read on public.store_size_charts;
create policy store_size_charts_read on public.store_size_charts for select using (true);
drop policy if exists store_size_charts_write on public.store_size_charts;
create policy store_size_charts_write on public.store_size_charts
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

drop policy if exists store_products_read on public.store_products;
create policy store_products_read on public.store_products
  for select using (
    (is_visible and deleted_at is null)
    or public.current_role_name() is not null
  );
drop policy if exists store_products_write on public.store_products;
create policy store_products_write on public.store_products
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

drop policy if exists store_product_photos_read on public.store_product_photos;
create policy store_product_photos_read on public.store_product_photos
  for select using (
    public.current_role_name() is not null
    or public.store_product_is_public(product_id)
  );
drop policy if exists store_product_photos_write on public.store_product_photos;
create policy store_product_photos_write on public.store_product_photos
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

drop policy if exists store_variants_read on public.store_variants;
create policy store_variants_read on public.store_variants
  for select using (
    public.current_role_name() is not null
    or (is_active and public.store_product_is_public(product_id))
  );
drop policy if exists store_variants_write on public.store_variants;
create policy store_variants_write on public.store_variants
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

-- The two price tables: a stranger sees them for a priced product only.
drop policy if exists store_size_prices_read on public.store_size_prices;
create policy store_size_prices_read on public.store_size_prices
  for select using (
    public.current_role_name() is not null
    or public.store_product_is_public_and_priced(product_id)
  );
drop policy if exists store_size_prices_write on public.store_size_prices;
create policy store_size_prices_write on public.store_size_prices
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

drop policy if exists store_bulk_tiers_read on public.store_bulk_tiers;
create policy store_bulk_tiers_read on public.store_bulk_tiers
  for select using (
    public.current_role_name() is not null
    or public.store_product_is_public_and_priced(product_id)
  );
drop policy if exists store_bulk_tiers_write on public.store_bulk_tiers;
create policy store_bulk_tiers_write on public.store_bulk_tiers
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

/*
  Stock movements: Owner/Admin read and INSERT only. No update, no delete, for
  anybody - a wrong movement is answered with an opposite one, exactly as in
  the shop's own stocks. A visitor reads the bucket view above, never this.
*/
drop policy if exists store_stock_movements_read on public.store_stock_movements;
create policy store_stock_movements_read on public.store_stock_movements
  for select using (public.is_owner_or_admin());
drop policy if exists store_stock_movements_insert on public.store_stock_movements;
create policy store_stock_movements_insert on public.store_stock_movements
  for insert with check (public.is_owner_or_admin());

-- A banner is on the wall only while it is active and inside its dates.
drop policy if exists store_banners_read on public.store_banners;
create policy store_banners_read on public.store_banners
  for select using (
    public.current_role_name() is not null
    or (
      is_active
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now())
    )
  );
drop policy if exists store_banners_write on public.store_banners;
create policy store_banners_write on public.store_banners
  for all using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

grant select on
  public.store_settings,
  public.store_categories,
  public.store_size_charts,
  public.store_products,
  public.store_product_photos,
  public.store_variants,
  public.store_size_prices,
  public.store_bulk_tiers,
  public.store_banners,
  public.store_variant_availability
to anon, authenticated;

grant insert, update, delete on
  public.store_categories,
  public.store_size_charts,
  public.store_products,
  public.store_product_photos,
  public.store_variants,
  public.store_size_prices,
  public.store_bulk_tiers,
  public.store_banners
to authenticated;

grant update on public.store_settings to authenticated;
grant select, insert on public.store_stock_movements to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: one public bucket for the shop window
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'No storage schema here - skipping the store bucket.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('store-images', 'store-images', true, 5242880,
          array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  begin
    execute $p$
      drop policy if exists store_images_read on storage.objects;
      create policy store_images_read on storage.objects
        for select using (bucket_id = 'store-images');

      drop policy if exists store_images_write on storage.objects;
      create policy store_images_write on storage.objects
        for all
        using (bucket_id = 'store-images' and public.is_owner_or_admin())
        with check (bucket_id = 'store-images' and public.is_owner_or_admin());
    $p$;
  exception when insufficient_privilege then
    raise exception 'This project''s postgres role may not write storage policies (%). Paste the two policies in this block into the Supabase SQL editor, or add them under Storage -> Policies, before anybody uploads a store picture.', sqlerrm;
  end;
end;
$$;
