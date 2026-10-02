-- Security tests for putting the product categories in order (0028).
--
-- The rules that matter:
--   * Only Owner/Admin can change the order - through the ordinary update
--     policy, so a staff member's attempt moves NOTHING and says so.
--   * A reorder is one statement: every position is written or none is.
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

create temp table t_cats (name text primary key, id uuid);
grant all on t_cats to authenticated;

insert into public.product_categories (name, sort_order)
values ('Order cat A', 501), ('Order cat B', 502), ('Order cat C', 503);
insert into t_cats select name, id from public.product_categories where name like 'Order cat _';

-- ---- Structure -----------------------------------------------------------
do $$
begin
  raise notice '--- category order: structure ---';

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'product_categories'
      and column_name = 'sort_order'
  ) then
    raise exception 'FAIL: a category has no position';
  end if;
  raise notice 'PASS: a category has a position';

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reorder_product_categories' and p.prosecdef
  ) then
    raise exception 'FAIL: reorder_product_categories runs as its owner, so RLS would not decide who may move one';
  end if;
  raise notice 'PASS: reorder_product_categories runs as the caller, under the update policy';
end;
$$;

-- ---- Staff cannot reorder ------------------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_refused boolean := false;
begin
  raise notice '--- category order: staff ---';

  begin
    perform public.reorder_product_categories(array(
      select id from t_cats order by name desc
    ));
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'FAIL: a staff member was allowed to reorder the categories';
  end if;
  if (select sort_order from public.product_categories where name = 'Order cat A') <> 501 then
    raise exception 'FAIL: a staff member''s reorder moved a category';
  end if;
  raise notice 'PASS: staff cannot change the order of the categories';
end;
$$;

-- ---- The admin reorders --------------------------------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_count integer;
  v_refused boolean := false;
begin
  raise notice '--- category order: admin ---';

  v_count := public.reorder_product_categories(array[
    (select id from t_cats where name = 'Order cat C'),
    (select id from t_cats where name = 'Order cat A'),
    (select id from t_cats where name = 'Order cat B')
  ]);

  if v_count <> 3 then
    raise exception 'FAIL: expected 3 categories moved, got %', v_count;
  end if;
  if (select string_agg(name, ',' order by sort_order) from public.product_categories
      where name like 'Order cat _') <> 'Order cat C,Order cat A,Order cat B' then
    raise exception 'FAIL: the new category order did not stick';
  end if;
  raise notice 'PASS: an admin puts the categories in a new order';

  begin
    perform public.reorder_product_categories(array[
      (select id from t_cats where name = 'Order cat A'),
      (select id from t_cats where name = 'Order cat A')
    ]);
  exception when raise_exception then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'FAIL: a list with the same category twice was accepted';
  end if;
  if (select sort_order from public.product_categories where name = 'Order cat C') <> 1 then
    raise exception 'FAIL: a refused reorder moved something anyway';
  end if;
  raise notice 'PASS: a reorder naming a category twice is refused whole';
end;
$$;

-- Tidy up.
set test.user_id = '11111111-1111-1111-1111-111111111111';
delete from public.product_categories where name like 'Order cat %';
