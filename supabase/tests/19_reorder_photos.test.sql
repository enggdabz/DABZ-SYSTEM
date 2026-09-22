-- Security tests for putting a product's photos in order (0022).
--
-- The photos are the shop front. `images[0]` is the picture on the product
-- card, on the shop, in this system's own list and in the Messenger message,
-- so who may rearrange them is the same question as who may change what the
-- shop looks like - Owner and Admin, and nobody else.
--
-- `reorder_online_product_images` is deliberately SECURITY INVOKER, so the
-- `online_product_images_write` policy from `0020` is still the thing that
-- decides. That is the interesting part and the easiest to get wrong: a
-- `security definer` here would have been a second answer to a question `0020`
-- already answered, published by PostgREST as a URL, and a staff member could
-- have rearranged the shop front with it. So this file proves the function is
-- NOT definer, and then proves what that buys.
--
-- What it proves:
--
--   * The function exists and runs as the caller.
--   * Owner and Admin may reorder; a staff member with the apparel permission
--     may not, and is TOLD so rather than being quietly ignored.
--   * A short list, a list with a stranger's photo in it, and the same photo
--     twice are all refused - each of which would otherwise leave the photos
--     in an order nobody chose.
--   * A refusal changes nothing at all, because it is one transaction.
--
-- The people come from the earlier files: eddie owner, maria admin, juan a
-- staff member who holds apparel_job_orders.

\set ON_ERROR_STOP on

set role authenticated;

-- ---- The function exists, and runs as the caller --------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  raise notice '--- reorder photos: structure ---';

  if not exists (
    select 1 from pg_proc where proname = 'reorder_online_product_images'
  ) then
    raise exception 'FAIL: reorder_online_product_images does not exist';
  end if;
  raise notice 'PASS: the reorder function exists';

  /*
    The whole point. If this ever flips to definer, every other test in this
    file would still pass while a staff member could rearrange the shop front,
    so it is checked directly rather than inferred from behaviour.
  */
  if exists (
    select 1 from pg_proc
    where proname = 'reorder_online_product_images' and prosecdef
  ) then
    raise exception 'FAIL: reorder_online_product_images is security definer';
  end if;
  raise notice 'PASS: it runs as the caller, so the write policy still decides';
end;
$$;

-- ---- A product with four photos -------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_category uuid;
  v_product uuid;
  v_ids uuid[];
  v_order uuid[];
begin
  raise notice '--- reorder photos: the owner rearranges ---';

  insert into public.online_categories (name, slug, created_by)
  values ('Reorder test', 'reorder-test', '11111111-1111-1111-1111-111111111111')
  returning id into v_category;

  insert into public.online_products
    (category_id, name, slug, pricing_mode, created_by)
  values (v_category, 'Photo order shirt', 'photo-order-shirt', 'fixed',
          '11111111-1111-1111-1111-111111111111')
  returning id into v_product;

  insert into public.online_product_images
    (product_id, storage_path, alt, sort_order, created_by)
  select v_product, 'p/' || n || '.jpg', 'photo ' || n, n - 1,
         '11111111-1111-1111-1111-111111111111'
    from generate_series(1, 4) as n;

  select array_agg(id order by sort_order) into v_ids
    from public.online_product_images where product_id = v_product;

  if cardinality(v_ids) <> 4 then
    raise exception 'FAIL: the fixture did not make four photos';
  end if;

  -- The move that matters: the last photo becomes the card picture.
  perform public.reorder_online_product_images(
    v_product,
    array[v_ids[4], v_ids[1], v_ids[2], v_ids[3]]
  );

  select array_agg(id order by sort_order) into v_order
    from public.online_product_images where product_id = v_product;

  if v_order <> array[v_ids[4], v_ids[1], v_ids[2], v_ids[3]] then
    raise exception 'FAIL: the owner''s new order was not stored';
  end if;
  raise notice 'PASS: the owner may make any photo the main one';

  -- The numbers are 0..n-1 with no gaps and no ties. A tie would make the
  -- card picture depend on whatever order PostgreSQL felt like returning.
  if exists (
    select 1 from public.online_product_images
    where product_id = v_product
    group by sort_order having count(*) > 1
  ) then
    raise exception 'FAIL: two photos share a sort_order';
  end if;

  if (select min(sort_order) from public.online_product_images
        where product_id = v_product) <> 0
     or (select max(sort_order) from public.online_product_images
           where product_id = v_product) <> 3 then
    raise exception 'FAIL: the photos are not numbered 0 to 3';
  end if;
  raise notice 'PASS: the photos are renumbered 0..n-1, with no ties';
end;
$$;

-- ---- An admin may too -----------------------------------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_product uuid;
  v_ids uuid[];
begin
  raise notice '--- reorder photos: an admin ---';

  select id into v_product from public.online_products
   where slug = 'photo-order-shirt';

  select array_agg(id order by sort_order) into v_ids
    from public.online_product_images where product_id = v_product;

  perform public.reorder_online_product_images(
    v_product, array[v_ids[2], v_ids[1], v_ids[3], v_ids[4]]
  );

  if (select id from public.online_product_images
       where product_id = v_product order by sort_order limit 1) <> v_ids[2] then
    raise exception 'FAIL: the admin''s reorder did not take';
  end if;
  raise notice 'PASS: an admin may reorder the shop front';
end;
$$;

-- ---- A staff member may not, and is told so -------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_product uuid;
  v_ids uuid[];
  v_after uuid[];
  v_refused boolean := false;
begin
  raise notice '--- reorder photos: a staff member ---';

  select id into v_product from public.online_products
   where slug = 'photo-order-shirt';

  -- Juan can SEE the photos: the read policy lets anybody signed in read the
  -- catalogue, and a customer can see them too. Seeing is not arranging.
  select array_agg(id order by sort_order) into v_ids
    from public.online_product_images where product_id = v_product;

  if cardinality(coalesce(v_ids, '{}')) <> 4 then
    raise exception 'FAIL: a staff member cannot read the catalogue photos';
  end if;

  begin
    perform public.reorder_online_product_images(
      v_product, array[v_ids[4], v_ids[3], v_ids[2], v_ids[1]]
    );
  exception when others then
    v_refused := true;
  end;

  /*
    Being REFUSED is the point, not merely being ineffective. The write policy
    removes the rows from the update quietly, so without the row-count check
    inside the function this would have returned happily and the screen would
    have redrawn in an order the shop never stored.
  */
  if not v_refused then
    raise exception 'FAIL: a staff member was not refused';
  end if;
  raise notice 'PASS: a staff member is refused, not silently ignored';

  select array_agg(id order by sort_order) into v_after
    from public.online_product_images where product_id = v_product;

  if v_after <> v_ids then
    raise exception 'FAIL: a refused reorder still moved the photos';
  end if;
  raise notice 'PASS: nothing moved';
end;
$$;

-- ---- Lists that are not this product's photos -----------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_product uuid;
  v_other uuid;
  v_ids uuid[];
  v_stranger uuid;
  v_before uuid[];
  v_after uuid[];
  v_refused boolean;
begin
  raise notice '--- reorder photos: a list that is not the list ---';

  select id into v_product from public.online_products
   where slug = 'photo-order-shirt';

  select array_agg(id order by sort_order) into v_ids
    from public.online_product_images where product_id = v_product;
  v_before := v_ids;

  -- A second product, so there is a photo that belongs to somebody else.
  insert into public.online_products
    (category_id, name, slug, pricing_mode, created_by)
  select category_id, 'Other shirt', 'other-shirt', 'fixed',
         '11111111-1111-1111-1111-111111111111'
    from public.online_products where id = v_product
  returning id into v_other;

  insert into public.online_product_images
    (product_id, storage_path, alt, sort_order, created_by)
  values (v_other, 'other/1.jpg', 'not yours', 0,
          '11111111-1111-1111-1111-111111111111')
  returning id into v_stranger;

  /*
    A SHORT list is the dangerous one. The function renumbers what it is given
    and nothing else, so three ids against four photos would leave the fourth
    sitting at whatever number it had, interleaved with the new ones - an
    order that is neither the old one nor the one that was asked for.
  */
  v_refused := false;
  begin
    perform public.reorder_online_product_images(
      v_product, array[v_ids[1], v_ids[2], v_ids[3]]
    );
  exception when others then v_refused := true;
  end;
  if not v_refused then
    raise exception 'FAIL: a short list was accepted';
  end if;
  raise notice 'PASS: a list with a photo missing is refused';

  v_refused := false;
  begin
    perform public.reorder_online_product_images(
      v_product, array[v_ids[1], v_ids[2], v_ids[3], v_stranger]
    );
  exception when others then v_refused := true;
  end;
  if not v_refused then
    raise exception 'FAIL: another product''s photo was accepted';
  end if;
  raise notice 'PASS: another product''s photo is refused';

  v_refused := false;
  begin
    perform public.reorder_online_product_images(
      v_product, array[v_ids[1], v_ids[1], v_ids[2], v_ids[3]]
    );
  exception when others then v_refused := true;
  end;
  if not v_refused then
    raise exception 'FAIL: the same photo twice was accepted';
  end if;
  raise notice 'PASS: the same photo listed twice is refused';

  v_refused := false;
  begin
    perform public.reorder_online_product_images(v_product, '{}'::uuid[]);
  exception when others then v_refused := true;
  end;
  if not v_refused then
    raise exception 'FAIL: an empty list was accepted';
  end if;
  raise notice 'PASS: an empty list is refused';

  -- And after all four refusals the photos are exactly where they were.
  select array_agg(id order by sort_order) into v_after
    from public.online_product_images where product_id = v_product;
  if v_after <> v_before then
    raise exception 'FAIL: a refused reorder left the photos moved';
  end if;
  raise notice 'PASS: four refusals, nothing moved';

  -- The stranger's own photo is untouched as well.
  if (select sort_order from public.online_product_images where id = v_stranger) <> 0 then
    raise exception 'FAIL: another product''s photo was renumbered';
  end if;
  raise notice 'PASS: the other product''s photo was never touched';
end;
$$;

do $$
begin
  raise notice 'ALL REORDER-PHOTOS TESTS PASSED';
end;
$$;

reset role;
