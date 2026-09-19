-- What may be deleted, and what may only be stopped (migration 0011).
--
-- The owner types the bills, the loans and the products in by hand, so a row
-- entered wrongly has to be removable. But deleting one that money has moved
-- against would be a quiet disaster: `bill_payments` and `loan_payments`
-- cascade from their parents, so the delete would take real payment records
-- with it and leave the ledger describing money paid to a lender the system
-- has never heard of.
--
-- So the rule is: no history, may be deleted; any history, may only be
-- stopped. The Server Actions check it so the owner gets a sentence rather
-- than a button that does nothing, but THIS is where it is enforced, and this
-- file is what proves it - against a real PostgreSQL rather than by reading
-- the code.
--
-- One thing worth knowing about every check below: a DELETE whose policy does
-- not match removes no rows and raises NO error. So a refusal is proved by the
-- row still being there afterwards, never by an exception.
--
-- (That the seeded catalogue is gone is proved elsewhere, by 04 and 06: they
-- count exactly the 11 bills, 6 loans and 11 products that
-- 01_catalogue_fixtures.sql inserts. If 0002 and 0005 still left theirs
-- behind, those counts would be double.)

\set ON_ERROR_STOP on

set role authenticated;

-- ---- The owner builds six rows to try this on -----------------------------
-- Three clean, three with money behind them.
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_loan_kept uuid;
  v_bill_kept uuid;
  v_product_kept uuid;
begin
  raise notice '--- delete rules: setting up ---';

  insert into public.bills (name, amount_centavos, type)
  values ('Typo bill', 12300, 'operating');

  insert into public.bills (name, amount_centavos, type)
  values ('Real bill', 45600, 'operating')
  returning id into v_bill_kept;

  insert into public.loans (lender, statement_balance_centavos, statement_date)
  values ('Typo lender', 100000, current_date);

  insert into public.loans (lender, statement_balance_centavos, statement_date)
  values ('Real lender', 200000, current_date)
  returning id into v_loan_kept;

  insert into public.products (name, division, price_centavos, section)
  values ('Typo product', 'printshoppe', 500, 'other');

  insert into public.products (name, division, price_centavos, section)
  values ('Real product', 'printshoppe', 700, 'other')
  returning id into v_product_kept;

  -- "Real bill" gets paid, which writes a bill payment and a ledger entry.
  perform public.mark_bill_paid(
    v_bill_kept, date '2026-09-01', 45600, current_date, 'cash_drawer', null
  );

  -- "Real lender" gets a payment recorded against it.
  insert into public.loan_payments (loan_id, amount_centavos, paid_on, origin)
  values (v_loan_kept, 50000, current_date, 'manual');

  -- "Real product" gets sold, which writes a sale line pointing at it.
  perform public.complete_sale(
    date '2026-10-05', null, 700, 0, 'none', null, 700,
    'cash', null, 100000, 99300,
    jsonb_build_array(jsonb_build_object(
      'name', 'Real product',
      'product_id', v_product_kept,
      'division', 'printshoppe',
      'quantity', 1,
      'unit_price_centavos', 700,
      'line_total_centavos', 700,
      'income_category', 'other_print_jobs'
    )),
    jsonb_build_array(jsonb_build_object(
      'division', 'printshoppe', 'category', 'other_print_jobs', 'amount_centavos', 700
    ))
  );

  raise notice 'PASS: three clean rows and three with money behind them';
end;
$$;

-- ---- The helpers the app and the policies both ask ------------------------
do $$
declare
  v_id uuid;
begin
  raise notice '--- delete rules: has this row got history? ---';

  select id into v_id from public.bills where name = 'Typo bill';
  if public.bill_has_history(v_id) then
    raise exception 'FAIL: a bill never paid was reported as having history';
  end if;

  select id into v_id from public.bills where name = 'Real bill';
  if not public.bill_has_history(v_id) then
    raise exception 'FAIL: a bill that was marked paid was reported as clean';
  end if;
  raise notice 'PASS: bill_has_history answers for a bill';

  select id into v_id from public.loans where lender = 'Typo lender';
  if public.loan_has_history(v_id) then
    raise exception 'FAIL: a loan never paid was reported as having history';
  end if;

  select id into v_id from public.loans where lender = 'Real lender';
  if not public.loan_has_history(v_id) then
    raise exception 'FAIL: a loan with a payment was reported as clean';
  end if;
  raise notice 'PASS: loan_has_history answers for a loan';

  select id into v_id from public.products where name = 'Typo product';
  if public.product_has_history(v_id) then
    raise exception 'FAIL: a product never sold was reported as having history';
  end if;

  select id into v_id from public.products where name = 'Real product';
  if not public.product_has_history(v_id) then
    raise exception 'FAIL: a product that was sold was reported as clean';
  end if;
  raise notice 'PASS: product_has_history answers for a product';

  /*
    The list versions, which is what a screen calls: one round trip for a whole
    page instead of one per card. They have to agree with the row-by-row
    helpers, or the screen would offer a Delete the database then refuses.
  */
  if not exists (
    select 1 from public.bills_with_payments()
     where bill_id = (select id from public.bills where name = 'Real bill')
  ) then
    raise exception 'FAIL: bills_with_payments missed a bill that was paid';
  end if;
  if exists (
    select 1 from public.bills_with_payments()
     where bill_id = (select id from public.bills where name = 'Typo bill')
  ) then
    raise exception 'FAIL: bills_with_payments listed a bill that was never paid';
  end if;

  if not exists (
    select 1 from public.loans_with_payments()
     where loan_id = (select id from public.loans where lender = 'Real lender')
  ) then
    raise exception 'FAIL: loans_with_payments missed a loan with a payment';
  end if;

  if not exists (
    select 1 from public.products_with_sales()
     where product_id = (select id from public.products where name = 'Real product')
  ) then
    raise exception 'FAIL: products_with_sales missed a product that was sold';
  end if;
  if exists (
    select 1 from public.products_with_sales()
     where product_id = (select id from public.products where name = 'Typo product')
  ) then
    raise exception 'FAIL: products_with_sales listed a product never sold';
  end if;
  raise notice 'PASS: the whole-list versions agree with the row-by-row ones';
end;
$$;

-- ---- Juan (staff) --------------------------------------------------------
-- Spec 4.3 keeps bills and loans away from staff entirely, and spec 7.2 keeps
-- removing a product with the owner. A delete changes nothing at all here.
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  raise notice '--- delete rules: staff (Juan) ---';

  delete from public.bills;
  delete from public.loans;
  raise notice 'PASS: a staff delete of the bills and loans runs and removes nothing';

  delete from public.products where name = 'Typo product';
  if not exists (select 1 from public.products where name = 'Typo product') then
    raise exception 'FAIL: a staff member deleted a product';
  end if;
  raise notice 'PASS: staff cannot delete a product, even an unsold one';
end;
$$;

-- The count is checked as someone who can actually see those tables: a staff
-- member reads no bills at all, so "nothing was deleted" cannot be proved from
-- inside their own session.
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  if not exists (select 1 from public.bills where name = 'Typo bill')
     or not exists (select 1 from public.loans where lender = 'Typo lender') then
    raise exception 'FAIL: a staff member deleted a bill or a loan';
  end if;
  raise notice 'PASS: every bill and loan survived the staff delete';
end;
$$;

-- ---- Maria (admin) -------------------------------------------------------
do $$
declare
  v_bill uuid;
  v_loan uuid;
  v_product uuid;
begin
  raise notice '--- delete rules: admin (Maria) ---';

  -- A row with nothing behind it goes.
  delete from public.bills where name = 'Typo bill';
  if exists (select 1 from public.bills where name = 'Typo bill') then
    raise exception 'FAIL: an admin could not delete a bill that was never paid';
  end if;
  raise notice 'PASS: a bill that was never paid can be deleted';

  delete from public.loans where lender = 'Typo lender';
  if exists (select 1 from public.loans where lender = 'Typo lender') then
    raise exception 'FAIL: an admin could not delete a loan that was never paid';
  end if;
  raise notice 'PASS: a loan that was never paid can be deleted';

  delete from public.products where name = 'Typo product';
  if exists (select 1 from public.products where name = 'Typo product') then
    raise exception 'FAIL: an admin could not delete a product that was never sold';
  end if;
  raise notice 'PASS: a product that was never sold can be deleted';

  -- And a row with money behind it does not, silently.
  select id into v_bill from public.bills where name = 'Real bill';
  delete from public.bills where id = v_bill;
  if not exists (select 1 from public.bills where id = v_bill) then
    raise exception 'FAIL: a bill that had been paid was deleted';
  end if;
  if not exists (select 1 from public.bill_payments where bill_id = v_bill) then
    raise exception 'FAIL: the payment behind the bill was destroyed';
  end if;
  raise notice 'PASS: a bill that has been paid cannot be deleted, and keeps its payment';

  select id into v_loan from public.loans where lender = 'Real lender';
  delete from public.loans where id = v_loan;
  if not exists (select 1 from public.loans where id = v_loan) then
    raise exception 'FAIL: a loan with a payment against it was deleted';
  end if;
  if not exists (select 1 from public.loan_payments where loan_id = v_loan) then
    raise exception 'FAIL: the payment behind the loan was destroyed';
  end if;
  raise notice 'PASS: a loan with a payment cannot be deleted, and keeps it';

  select id into v_product from public.products where name = 'Real product';
  delete from public.products where id = v_product;
  if not exists (select 1 from public.products where id = v_product) then
    raise exception 'FAIL: a product that had been sold was deleted';
  end if;
  raise notice 'PASS: a product that has been sold cannot be deleted';
end;
$$;

-- ---- The owner, on the same rules ----------------------------------------
-- Being the owner is not a way round this. The rule protects the books, not a
-- rank.
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_bill uuid;
  v_tier_count int;
begin
  raise notice '--- delete rules: owner (Eddie) ---';

  select id into v_bill from public.bills where name = 'Real bill';
  delete from public.bills where id = v_bill;
  if not exists (select 1 from public.bills where id = v_bill) then
    raise exception 'FAIL: the owner deleted a bill that had been paid';
  end if;
  raise notice 'PASS: the owner cannot delete a paid bill either';

  -- Undoing the payment makes it deletable again - which is the honest way
  -- back, because undoing also voids the ledger entry the payment created.
  perform public.undo_bill_payment(v_bill, date '2026-09-01', 'Entered by mistake');
  if public.bill_has_history(v_bill) then
    raise exception 'FAIL: the bill still reports a payment after the undo';
  end if;

  delete from public.bills where id = v_bill;
  if exists (select 1 from public.bills where id = v_bill) then
    raise exception 'FAIL: a bill whose payment was undone still could not be deleted';
  end if;
  raise notice 'PASS: undoing the payment makes the bill deletable again';

  -- A deleted product takes its bulk price rules with it: they describe
  -- nothing once it is gone, and they are the owner's rules rather than a
  -- record of money.
  insert into public.products (name, division, price_centavos, section)
  values ('Bulk product', 'printshoppe', 1000, 'other');

  insert into public.product_price_tiers (product_id, min_quantity, unit_price_centavos)
  values (
    (select id from public.products where name = 'Bulk product'), 50, 800
  );

  delete from public.products where name = 'Bulk product';
  select count(*) into v_tier_count
    from public.product_price_tiers t
    join public.products p on p.id = t.product_id
   where p.name = 'Bulk product';
  if v_tier_count <> 0 then
    raise exception 'FAIL: a bulk price rule outlived its product';
  end if;
  raise notice 'PASS: a deleted product takes its bulk price rules with it';

  raise notice 'ALL DELETE RULE TESTS PASSED';
end;
$$;

reset role;
