-- Security tests for the Counter's product categories (0027).
--
-- The rules that matter:
--   * Everybody signed in reads them - the Counter shows them to staff.
--   * Only Owner/Admin create, rename or delete one.
--   * "Xerox" and " xerox" are one category, not two.
--   * Deleting a category leaves its products in none - it never takes a
--     product with it.
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

-- ---- Structure -----------------------------------------------------------
do $$
begin
  raise notice '--- product categories: structure ---';

  if not (select relrowsecurity from pg_class where oid = 'public.product_categories'::regclass) then
    raise exception 'FAIL: product_categories has no Row Level Security';
  end if;
  raise notice 'PASS: product_categories has Row Level Security';

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'category_id'
  ) then
    raise exception 'FAIL: a product has nowhere to keep its category';
  end if;
  raise notice 'PASS: a product can have a category';
end;
$$;

-- ---- The admin makes categories -----------------------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_refused boolean := false;
begin
  raise notice '--- product categories: admin ---';

  insert into public.product_categories (name) values ('Cat Xerox'), ('Cat Printing');
  if (select count(*) from public.product_categories where name like 'Cat %') <> 2 then
    raise exception 'FAIL: an admin could not add categories';
  end if;
  raise notice 'PASS: an admin adds categories';

  begin
    insert into public.product_categories (name) values ('  cat xerox ');
  exception when unique_violation then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'FAIL: the same category name was accepted twice';
  end if;
  raise notice 'PASS: the same name in other capitals or spacing is one category';

  update public.product_categories set name = 'Cat Photocopy' where name = 'Cat Xerox';
  if not exists (select 1 from public.product_categories where name = 'Cat Photocopy') then
    raise exception 'FAIL: an admin could not rename a category';
  end if;
  raise notice 'PASS: an admin renames a category';

  insert into public.products (name, division, price_centavos, section, category_id)
  values ('Cat product', 'printshoppe', 300, 'other',
          (select id from public.product_categories where name = 'Cat Photocopy'));
end;
$$;

-- ---- Staff read, and cannot write ----------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_refused boolean := false;
begin
  raise notice '--- product categories: staff ---';

  if (select count(*) from public.product_categories where name like 'Cat %') <> 2 then
    raise exception 'FAIL: staff cannot read the categories the Counter shows';
  end if;
  raise notice 'PASS: staff read the categories';

  begin
    insert into public.product_categories (name) values ('Cat staff');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  if not v_refused then
    raise exception 'FAIL: a staff member added a category';
  end if;
  raise notice 'PASS: staff cannot add a category';

  update public.product_categories set name = 'Cat renamed by staff' where name = 'Cat Printing';
  if exists (select 1 from public.product_categories where name = 'Cat renamed by staff') then
    raise exception 'FAIL: a staff member renamed a category';
  end if;
  raise notice 'PASS: staff cannot rename a category';

  delete from public.product_categories where name = 'Cat Printing';
  if not exists (select 1 from public.product_categories where name = 'Cat Printing') then
    raise exception 'FAIL: a staff member deleted a category';
  end if;
  raise notice 'PASS: staff cannot delete a category';

  -- Staff may still add a product into an existing category (spec 7.2).
  insert into public.products (name, division, price_centavos, section, category_id)
  values ('Cat staff product', 'printshoppe', 300, 'other',
          (select id from public.product_categories where name = 'Cat Printing'));
  raise notice 'PASS: staff can add a product into an existing category';
end;
$$;

-- ---- Deleting a category keeps its products -----------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  raise notice '--- product categories: delete ---';

  delete from public.product_categories where name = 'Cat Photocopy';
  if not exists (select 1 from public.products where name = 'Cat product') then
    raise exception 'FAIL: deleting a category took its product with it';
  end if;
  if (select category_id from public.products where name = 'Cat product') is not null then
    raise exception 'FAIL: a product still points at a deleted category';
  end if;
  raise notice 'PASS: deleting a category leaves its products in none';
end;
$$;

-- Tidy up so a later file counting products is not surprised.
set test.user_id = '11111111-1111-1111-1111-111111111111';
delete from public.products where name like 'Cat %';
delete from public.product_categories where name like 'Cat %';
