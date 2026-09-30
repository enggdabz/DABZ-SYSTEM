-- Security tests for the store's catalogue (0025, docs/store/progress.md).
--
-- The store is a shop window read by strangers, so what is worth proving is
-- about what a stranger can and cannot find:
--
--   1. A visible product is readable; a hidden or deleted one is not, and
--      neither are its photos, variants or tiers.
--   2. A QUOTE-ONLY PRODUCT HAS NO PRICE ANYWHERE - the database refuses to
--      store one, and the two price tables are closed to a stranger for it.
--   3. A stranger reads a stock BUCKET, never a count, and cannot read the
--      movements the bucket is built from.
--   4. Only Owner/Admin write. A staff member reads hidden products (they
--      write orders against the catalogue) and changes nothing.
--   5. Stock movements are append-only, for everyone.
--
-- People from the earlier files: eddie owner, maria admin, juan and rosa staff.

\set ON_ERROR_STOP on

reset role;

do $$
declare
  v_table text;
begin
  raise notice '--- store catalogue: structure ---';

  foreach v_table in array array[
    'store_settings', 'store_categories', 'store_size_charts', 'store_products',
    'store_product_photos', 'store_variants', 'store_size_prices',
    'store_bulk_tiers', 'store_stock_movements', 'store_banners'
  ]
  loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'FAIL: public.% does not exist', v_table;
    end if;
    if not (select relrowsecurity from pg_class where relname = v_table) then
      raise exception 'FAIL: public.% has Row Level Security switched off', v_table;
    end if;
  end loop;
  raise notice 'PASS: all ten tables exist, every one with RLS on';

  -- Exactly one column on the availability view: every column is readable by
  -- a stranger, so a count sneaking in would be a leak.
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'store_variant_availability') <> 3 then
    raise exception 'FAIL: store_variant_availability has an unexpected number of columns';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_variant_availability'
      and column_name in ('on_hand', 'qty', 'count', 'stock')
  ) then
    raise exception 'FAIL: store_variant_availability exposes a stock count';
  end if;
  raise notice 'PASS: the availability view exposes a bucket and no count';

  if (select count(*) from public.store_categories) <> 5 then
    raise exception 'FAIL: expected the five categories the owner named';
  end if;
  raise notice 'PASS: the five named categories exist and nothing else was seeded';

  if (select count(*) from public.store_products) <> 0 then
    raise exception 'FAIL: a migration seeded a product';
  end if;
  raise notice 'PASS: no product is seeded - the catalogue is the owner''s';
end;
$$;

-- ---- fixtures (as the migration role, so RLS is not in the way) -----------

insert into public.store_products
  (id, category_id, name, slug, pricing_mode, base_price_centavos, is_visible, deleted_at)
values
  ('c0000001-0000-0000-0000-000000000001',
   (select id from public.store_categories where slug = 'shirts'),
   'Plain shirt', 'plain-shirt', 'fixed', 25000, true, null),
  ('c0000002-0000-0000-0000-000000000002',
   (select id from public.store_categories where slug = 'jackets'),
   'Custom jacket', 'custom-jacket-store', 'quote', null, true, null),
  ('c0000003-0000-0000-0000-000000000003',
   (select id from public.store_categories where slug = 'shirts'),
   'Hidden shirt', 'hidden-shirt', 'fixed', 19900, false, null),
  ('c0000004-0000-0000-0000-000000000004',
   (select id from public.store_categories where slug = 'shirts'),
   'Deleted shirt', 'deleted-shirt', 'fixed', 19900, true, now());

insert into public.store_product_photos (product_id, storage_path)
values
  ('c0000001-0000-0000-0000-000000000001', 'p/plain-1.jpg'),
  ('c0000003-0000-0000-0000-000000000003', 'p/hidden-1.jpg');

insert into public.store_variants (id, product_id, size, track_stock, low_stock_at)
values
  ('d0000001-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001', 'M', true, 5),
  ('d0000002-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000001', 'L', true, 5),
  ('d0000003-0000-0000-0000-000000000003', 'c0000001-0000-0000-0000-000000000001', 'XL', true, 5),
  ('d0000004-0000-0000-0000-000000000004', 'c0000001-0000-0000-0000-000000000001', 'S', false, null),
  ('d0000005-0000-0000-0000-000000000005', 'c0000003-0000-0000-0000-000000000003', 'M', true, 5);

insert into public.store_stock_movements (variant_id, delta, reason)
values
  ('d0000001-0000-0000-0000-000000000001', 20, 'received'),  -- in stock
  ('d0000002-0000-0000-0000-000000000002', 4, 'received'),   -- low (<= 5)
  ('d0000003-0000-0000-0000-000000000003', 3, 'received'),
  ('d0000003-0000-0000-0000-000000000003', -3, 'sold'),      -- out
  ('d0000005-0000-0000-0000-000000000005', 9, 'received');

insert into public.store_size_prices (product_id, size, surcharge_centavos)
values ('c0000001-0000-0000-0000-000000000001', '2XL', 5000);
insert into public.store_bulk_tiers (product_id, min_qty, unit_price_centavos)
values ('c0000001-0000-0000-0000-000000000001', 10, 22000),
       ('c0000003-0000-0000-0000-000000000003', 10, 17000);

do $$
begin
  raise notice '--- store catalogue: the price rule is in the data ---';

  begin
    insert into public.store_products (name, slug, pricing_mode, base_price_centavos)
    values ('Quote with a price', 'quote-with-a-price', 'quote', 1000);
    raise exception 'FAIL: a quote-only product accepted a price';
  exception when check_violation then
    raise notice 'PASS: a quote-only product cannot hold a price';
  end;

  begin
    insert into public.store_products (name, slug, pricing_mode, base_price_centavos)
    values ('Fixed with none', 'fixed-with-none', 'fixed', null);
    raise exception 'FAIL: a fixed-price product accepted no price';
  exception when check_violation then
    raise notice 'PASS: a fixed-price product must have one';
  end;

  begin
    insert into public.store_products (name, slug, pricing_mode, base_price_centavos)
    values ('Zero', 'zero', 'fixed', 0);
    raise exception 'FAIL: a zero price was accepted';
  exception when check_violation then
    raise notice 'PASS: a price of zero is refused - "unknown" is NULL, never zero';
  end;

  begin
    insert into public.store_variants (product_id) values ('c0000001-0000-0000-0000-000000000001');
    raise exception 'FAIL: a variant with neither size nor colour was accepted';
  exception when check_violation then
    raise notice 'PASS: a variant must be a size or a colour';
  end;

  begin
    insert into public.store_variants (product_id, size)
    values ('c0000001-0000-0000-0000-000000000001', 'M');
    raise exception 'FAIL: a duplicate size was accepted';
  exception when unique_violation then
    raise notice 'PASS: the same size cannot be listed twice';
  end;

  begin
    insert into public.store_banners (image_path, link_url) values ('b.jpg', 'javascript:alert(1)');
    raise exception 'FAIL: a banner accepted a javascript: link';
  exception when check_violation then
    raise notice 'PASS: a banner link is a path on this site or https only';
  end;
end;
$$;

-- ---- a stranger -----------------------------------------------------------

set role anon;
set test.user_id = '';

do $$
begin
  raise notice '--- store catalogue: a stranger ---';

  if (select count(*) from public.store_products) <> 2 then
    raise exception 'FAIL: a stranger sees % products, expected the 2 visible ones',
      (select count(*) from public.store_products);
  end if;
  raise notice 'PASS: a stranger sees visible products only - not hidden, not deleted';

  if (select count(*) from public.store_product_photos) <> 1 then
    raise exception 'FAIL: a stranger sees a photo of a hidden product';
  end if;
  raise notice 'PASS: a hidden product''s photos go with it';

  if (select count(*) from public.store_variants
      where product_id = 'c0000003-0000-0000-0000-000000000003') <> 0 then
    raise exception 'FAIL: a stranger sees the variants of a hidden product';
  end if;
  raise notice 'PASS: a hidden product''s variants go with it';

  if (select count(*) from public.store_bulk_tiers) <> 1
     or (select count(*) from public.store_size_prices) <> 1 then
    raise exception 'FAIL: a stranger sees the price tables of a hidden product';
  end if;
  raise notice 'PASS: a hidden product''s tiers and surcharges go with it';

  if exists (select 1 from public.store_products where pricing_mode = 'quote' and base_price_centavos is not null) then
    raise exception 'FAIL: a quote-only product carries a price';
  end if;
  raise notice 'PASS: the quote-only product reaches a stranger with no price on it';

  if (select count(*) from public.store_stock_movements) <> 0 then
    raise exception 'FAIL: a stranger reads stock movements';
  end if;
  raise notice 'PASS: a stranger cannot read a stock movement';

  if (select availability from public.store_variant_availability
      where variant_id = 'd0000001-0000-0000-0000-000000000001') <> 'in_stock' then
    raise exception 'FAIL: 20 on hand with a threshold of 5 should read in stock';
  end if;
  if (select availability from public.store_variant_availability
      where variant_id = 'd0000002-0000-0000-0000-000000000002') <> 'low' then
    raise exception 'FAIL: 4 on hand with a threshold of 5 should read low';
  end if;
  if (select availability from public.store_variant_availability
      where variant_id = 'd0000003-0000-0000-0000-000000000003') <> 'out' then
    raise exception 'FAIL: 0 on hand should read out';
  end if;
  raise notice 'PASS: the buckets are in stock, low and out';

  if exists (select 1 from public.store_variant_availability
             where variant_id = 'd0000004-0000-0000-0000-000000000004') then
    raise exception 'FAIL: an untracked variant has an availability row';
  end if;
  if exists (select 1 from public.store_variant_availability
             where product_id = 'c0000003-0000-0000-0000-000000000003') then
    raise exception 'FAIL: the availability of a hidden product is readable';
  end if;
  raise notice 'PASS: untracked variants and hidden products have no availability row';

  begin
    insert into public.store_products (name, slug, pricing_mode) values ('Sneaky', 'sneaky', 'quote');
    raise exception 'FAIL: a stranger added a product';
  exception when insufficient_privilege then
    raise notice 'PASS: a stranger cannot add a product';
  end;

  begin
    insert into public.store_stock_movements (variant_id, delta, reason)
    values ('d0000001-0000-0000-0000-000000000001', 100, 'received');
    raise exception 'FAIL: a stranger added stock';
  exception when insufficient_privilege then
    raise notice 'PASS: a stranger cannot add stock';
  end;

  begin
    update public.store_settings set store_enabled = false;
    raise exception 'FAIL: a stranger could reach the off switch';
  exception when insufficient_privilege then
    raise notice 'PASS: a stranger cannot flip the off switch';
  end;
end;
$$;

-- ---- banners: only while they are on the wall -----------------------------

reset role;
insert into public.store_banners (image_path, title, is_active, starts_at, ends_at) values
  ('b/live.jpg', 'Live', true, now() - interval '1 day', now() + interval '1 day'),
  ('b/off.jpg', 'Switched off', false, null, null),
  ('b/future.jpg', 'Not yet', true, now() + interval '1 day', null),
  ('b/past.jpg', 'Over', true, null, now() - interval '1 hour');

set role anon;
do $$
begin
  if (select count(*) from public.store_banners) <> 1 then
    raise exception 'FAIL: a stranger sees % banners, expected only the live one',
      (select count(*) from public.store_banners);
  end if;
  raise notice 'PASS: a stranger sees a banner only while it is active and in date';
end;
$$;

-- ---- staff: read everything, write nothing --------------------------------

reset role;
set role authenticated;
set test.user_id = '33333333-3333-3333-3333-333333333333';

do $$
declare
  v_rows integer;
begin
  raise notice '--- store catalogue: a staff member ---';

  if (select count(*) from public.store_products) <> 4 then
    raise exception 'FAIL: a staff member should read all four products, saw %',
      (select count(*) from public.store_products);
  end if;
  raise notice 'PASS: staff read hidden products (orders are written against them)';

  update public.store_products set name = 'Renamed' where slug = 'plain-shirt';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL: a staff member edited a product';
  end if;
  raise notice 'PASS: a staff member cannot edit a product';

  begin
    insert into public.store_stock_movements (variant_id, delta, reason)
    values ('d0000001-0000-0000-0000-000000000001', 1, 'adjustment');
    raise exception 'FAIL: a staff member added a stock movement';
  exception when insufficient_privilege or others then
    if sqlstate in ('42501') then
      raise notice 'PASS: a staff member cannot add stock';
    else raise; end if;
  end;
end;
$$;

-- ---- admin and owner: write; movements stay append-only -------------------

reset role;
set role authenticated;
set test.user_id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_rows integer;
begin
  raise notice '--- store catalogue: an admin ---';

  update public.store_products set name = 'Plain shirt (renamed)' where slug = 'plain-shirt';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'FAIL: an admin could not edit a product';
  end if;
  raise notice 'PASS: an admin edits a product';

  if (select updated_at from public.store_products where slug = 'plain-shirt') < now() - interval '1 minute' then
    raise exception 'FAIL: updated_at did not move';
  end if;

  insert into public.store_stock_movements (variant_id, delta, reason)
  values ('d0000001-0000-0000-0000-000000000001', 5, 'adjustment');
  raise notice 'PASS: an admin records a stock movement';

  update public.store_stock_movements set delta = 999;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL: a stock movement was edited';
  end if;
  delete from public.store_stock_movements;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL: a stock movement was deleted';
  end if;
  raise notice 'PASS: a movement can be neither edited nor deleted - even by an admin';
end;
$$;

reset role;
set role authenticated;
set test.user_id = '11111111-1111-1111-1111-111111111111';

do $$
declare
  v_rows integer;
begin
  update public.store_settings set store_enabled = false;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'FAIL: the owner could not flip the off switch';
  end if;
  update public.store_settings set store_enabled = true;
  raise notice 'PASS: the owner flips the off switch';
end;
$$;

reset role;
