-- Security tests for the Counter's product list (0026): the photo column and
-- putting the products in order.
--
-- The rules that matter:
--   * Only Owner/Admin can change the order - through the ordinary update
--     policy, so a staff member's attempt moves NOTHING and says so.
--   * A reorder is one statement: every position is written or none is.
--   * Only Owner/Admin can set or clear a photo (it is a product edit).
--   * The function never touches a product it was not given.
--
-- Accounts (from 03): 1111 owner, 2222 Maria (admin), 3333 Juan (staff,
-- add_sales), 4444 Rosa (staff, nothing).

\set ON_ERROR_STOP on

set role authenticated;

set test.user_id = '11111111-1111-1111-1111-111111111111';
delete from public.user_permissions
 where user_id in ('33333333-3333-3333-3333-333333333333',
                   '44444444-4444-4444-4444-444444444444');
insert into public.user_permissions (user_id, permission) values
  ('33333333-3333-3333-3333-333333333333', 'add_sales');

create temp table t_order (name text primary key, id uuid);
grant all on t_order to authenticated;

insert into public.products (name, division, price_centavos, section, sort_order)
values ('Order A', 'printshoppe', 100, 'other', 500),
       ('Order B', 'printshoppe', 200, 'other', 501),
       ('Order C', 'printshoppe', 300, 'other', 502);
insert into t_order select name, id from public.products where name like 'Order _';

-- ---- Structure -----------------------------------------------------------
do $$
begin
  raise notice '--- counter product list: structure ---';

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'image_path'
  ) then
    raise exception 'FAIL: a product has nowhere to keep its photo';
  end if;
  raise notice 'PASS: a product can have a photo';

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reorder_products' and p.prosecdef
  ) then
    raise exception 'FAIL: reorder_products runs as its owner, so RLS would not decide who may move a product';
  end if;
  raise notice 'PASS: reorder_products runs as the caller, under the update policy';
end;
$$;

-- ---- Staff cannot reorder or set a photo ---------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_refused boolean := false;
begin
  raise notice '--- counter product list: staff ---';

  begin
    perform public.reorder_products(array(
      select id from t_order order by name desc
    ));
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'FAIL: a staff member was allowed to reorder the products';
  end if;
  if (select sort_order from public.products where name = 'Order A') <> 500 then
    raise exception 'FAIL: a staff member''s reorder moved a product';
  end if;
  raise notice 'PASS: staff cannot change the order of the products';

  update public.products set image_path = 'counter/x.webp' where name = 'Order A';
  if (select image_path from public.products where name = 'Order A') is not null then
    raise exception 'FAIL: a staff member set a product photo';
  end if;
  raise notice 'PASS: staff cannot set a product photo';

  -- ...but they still add products, as spec 7.2 allows.
  insert into public.products (name, division, price_centavos, section, sort_order)
  values ('Order staff added', 'printshoppe', 400, 'other', 503);
  raise notice 'PASS: staff can still add a product from the counter';
end;
$$;

-- ---- The admin reorders --------------------------------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_count integer;
  v_untouched smallint;
  v_refused boolean := false;
begin
  raise notice '--- counter product list: admin ---';

  select sort_order into v_untouched from public.products where name = 'Order staff added';

  v_count := public.reorder_products(array[
    (select id from t_order where name = 'Order C'),
    (select id from t_order where name = 'Order A'),
    (select id from t_order where name = 'Order B')
  ]);

  if v_count <> 3 then
    raise exception 'FAIL: expected 3 products moved, got %', v_count;
  end if;
  if (select string_agg(name, ',' order by sort_order) from public.products
      where name in ('Order A', 'Order B', 'Order C')) <> 'Order C,Order A,Order B' then
    raise exception 'FAIL: the new order did not stick';
  end if;
  raise notice 'PASS: an admin puts the products in a new order';

  if (select sort_order from public.products where name = 'Order staff added') <> v_untouched then
    raise exception 'FAIL: a product left out of the list was moved';
  end if;
  raise notice 'PASS: a product not in the list keeps its place';

  -- The same id twice is refused as a whole: nothing moves.
  begin
    perform public.reorder_products(array[
      (select id from t_order where name = 'Order A'),
      (select id from t_order where name = 'Order A')
    ]);
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'FAIL: a list with the same product twice was accepted';
  end if;
  if (select sort_order from public.products where name = 'Order C') <> 1 then
    raise exception 'FAIL: a refused reorder moved something anyway';
  end if;
  raise notice 'PASS: a reorder naming a product twice is refused whole';

  update public.products set image_path = 'counter/a.webp' where name = 'Order A';
  if (select image_path from public.products where name = 'Order A') <> 'counter/a.webp' then
    raise exception 'FAIL: an admin could not set a product photo';
  end if;
  update public.products set image_path = null where name = 'Order A';
  if (select image_path from public.products where name = 'Order A') is not null then
    raise exception 'FAIL: an admin could not remove a product photo';
  end if;
  raise notice 'PASS: an admin sets and removes a product photo';
end;
$$;

-- Tidy up so a later file counting products is not surprised.
set test.user_id = '11111111-1111-1111-1111-111111111111';
delete from public.products where name like 'Order %';
