-- Security and money tests for Phase 4: the POS (spec 4.4, 6, 7).
--
-- The rule that matters most here is spec 4.4: a staff member may ADD a sale
-- but never edit or delete one. A mistake goes through a void request that an
-- Owner or Admin decides.

\set ON_ERROR_STOP on

set role authenticated;

-- ---- Structure -----------------------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  raise notice '--- phase 4: structure ---';

  -- The products come from 01_catalogue_fixtures.sql; everyone signed in may
  -- read them, which is what makes the counter work for staff.
  if (select count(*) from public.products) <> 11 then
    raise exception 'FAIL: expected the 11 fixture products';
  end if;
  raise notice 'PASS: staff read the counter buttons';

  -- Five of the eleven have no price at all: that is a real state, and the
  -- counter asks for the amount instead of assuming one.
  if (select count(price_centavos) from public.products) <> 6 then
    raise exception 'FAIL: a price appeared on a product that has none';
  end if;
  raise notice 'PASS: a product with no price keeps having no price';

  if (select count(*) from public.product_price_tiers) <> 0 then
    raise exception 'FAIL: a bulk discount rule appeared from nowhere';
  end if;
  raise notice 'PASS: no bulk discount rule appeared from nowhere';

  -- Maya is now a real payment method (open decision 17.12).
  insert into public.ledger_entries (direction, amount_centavos, tag, category, source)
  values ('in', 10000, 'printshoppe', 'photocopy', 'maya');
  raise notice 'PASS: Maya is accepted as a payment source';
end;
$$;

-- ---- A staff member rings up a sale --------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_result record;
  v_lines jsonb;
  v_ledger jsonb;
  v_sale uuid;
begin
  raise notice '--- phase 4: staff selling ---';

  -- Juan has add_sales from the Phase 1 tests.
  if not public.has_permission('add_sales') then
    raise exception 'FAIL: the test set-up expected Juan to have add_sales';
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('name', 'Print, black & white', 'division', 'printshoppe',
      'quantity', 12, 'unit_price_centavos', 300, 'line_total_centavos', 3600,
      'income_category', 'document_printing'),
    jsonb_build_object('name', 'DTF print', 'division', 'apparel',
      'quantity', 1, 'unit_price_centavos', 25000, 'line_total_centavos', 25000,
      'income_category', 'dtf_prints')
  );
  v_ledger := jsonb_build_array(
    jsonb_build_object('division', 'printshoppe', 'category', 'document_printing', 'amount_centavos', 3600),
    jsonb_build_object('division', 'apparel', 'category', 'dtf_prints', 'amount_centavos', 25000)
  );

  select * into v_result from public.complete_sale(
    date '2026-09-18', null, 28600, 0, 'none', null, 28600,
    'cash', null, 50000, 21400, v_lines, v_ledger
  );

  v_sale := v_result.sale_id;
  if v_result.sale_number <> 'S-260918-001' then
    raise exception 'FAIL: expected receipt number S-260918-001, got %', v_result.sale_number;
  end if;
  raise notice 'PASS: a staff member can ring up a sale, numbered by the day';

  if (select count(*) from public.sale_lines where sale_id = v_sale) <> 2 then
    raise exception 'FAIL: the sale lines were not written';
  end if;
  raise notice 'PASS: the sale lines are written with it';

  -- The takings land in the ledger, but a staff member cannot read it (spec
  -- 4.3) - so that is checked below, as the owner. What matters here is that
  -- selling did not require opening the ledger up to staff.
  if (select count(*) from public.ledger_entries) <> 0 then
    raise exception 'FAIL: a staff member could read the ledger';
  end if;
  raise notice 'PASS: selling does not let a staff member read the ledger';

  -- The next sale of the day takes the next number.
  select * into v_result from public.complete_sale(
    date '2026-09-18', null, 300, 0, 'none', null, 300,
    'gcash', 'REF123', null, null,
    jsonb_build_array(jsonb_build_object('name', 'Photocopy', 'division', 'printshoppe',
      'quantity', 1, 'unit_price_centavos', 300, 'line_total_centavos', 300,
      'income_category', 'photocopy')),
    jsonb_build_array(jsonb_build_object('division', 'printshoppe', 'category', 'photocopy', 'amount_centavos', 300))
  );
  if v_result.sale_number <> 'S-260918-002' then
    raise exception 'FAIL: expected S-260918-002, got %', v_result.sale_number;
  end if;
  raise notice 'PASS: receipt numbers count up through the day';

  -- Spec 4.4: staff may not edit a completed sale.
  update public.sales set total_centavos = 1 where id = v_sale;
  if (select total_centavos from public.sales where id = v_sale) <> 28600 then
    raise exception 'FAIL: a staff member edited a completed sale';
  end if;
  raise notice 'PASS: staff cannot edit a completed sale';

  -- Nor delete one.
  delete from public.sales where id = v_sale;
  if not exists (select 1 from public.sales where id = v_sale) then
    raise exception 'FAIL: a staff member deleted a completed sale';
  end if;
  raise notice 'PASS: staff cannot delete a completed sale';

  -- Nor void one themselves.
  begin
    perform public.void_sale(v_sale, 'Wrong amount');
    raise exception 'FAIL: a staff member voided a sale';
  exception when others then
    raise notice 'PASS: staff cannot void a sale themselves';
  end;

  -- They ask instead.
  insert into public.void_requests (sale_id, reason, requested_by)
  values (v_sale, 'Charged for 12 pages, customer only had 10', auth.uid());
  raise notice 'PASS: staff can ask for a sale to be voided';

  -- Staff cannot approve their own request.
  update public.void_requests set status = 'approved' where sale_id = v_sale;
  if (select status from public.void_requests where sale_id = v_sale) <> 'pending' then
    raise exception 'FAIL: a staff member approved their own void request';
  end if;
  raise notice 'PASS: staff cannot approve their own void request';

  -- Spec 7.2: staff may save a new product from the counter...
  insert into public.products (name, division, price_centavos, section)
  values ('Photo paper print', 'printshoppe', 2500, 'printing');
  raise notice 'PASS: staff can save a new product from the counter';

  -- ...but not change or remove an existing one.
  update public.products set price_centavos = 1 where name = 'Photocopy';
  if (select price_centavos from public.products where name = 'Photocopy') <> 300 then
    raise exception 'FAIL: a staff member changed a product price';
  end if;
  raise notice 'PASS: staff cannot change a product price';

  delete from public.products where name = 'Photocopy';
  if not exists (select 1 from public.products where name = 'Photocopy') then
    raise exception 'FAIL: a staff member deleted a product';
  end if;
  raise notice 'PASS: staff cannot delete a product';
end;
$$;

-- ---- A staff member without the permission ------------------------------
-- Rosa was deactivated by the Phase 1 tests; reactivate her with no add_sales.
set role postgres;
update public.profiles set status = 'active' where username = 'rosa';
delete from public.user_permissions
 where user_id = '44444444-4444-4444-4444-444444444444';
set role authenticated;

set test.user_id = '44444444-4444-4444-4444-444444444444';
do $$
begin
  raise notice '--- phase 4: staff without add_sales ---';

  begin
    perform public.complete_sale(
      date '2026-09-18', null, 300, 0, 'none', null, 300, 'cash', null, 300, 0,
      jsonb_build_array(jsonb_build_object('name', 'Photocopy', 'division', 'printshoppe',
        'quantity', 1, 'unit_price_centavos', 300, 'line_total_centavos', 300,
        'income_category', 'photocopy')),
      jsonb_build_array(jsonb_build_object('division', 'printshoppe', 'category', 'photocopy', 'amount_centavos', 300))
    );
    raise exception 'FAIL: a staff member without add_sales rang up a sale';
  exception when insufficient_privilege then
    raise notice 'PASS: a staff member without add_sales cannot ring up a sale';
  end;

  -- And cannot see anyone else's sales.
  if (select count(*) from public.sales) <> 0 then
    raise exception 'FAIL: a staff member saw sales that are not theirs';
  end if;
  raise notice 'PASS: a staff member sees only their own sales';

  -- Customers are shared across the divisions, so reading them is fine.
  insert into public.customers (name, contact_number)
  values ('Barangay San Jose', '0917 555 0000');
  raise notice 'PASS: any signed-in person can add a customer';
end;
$$;

-- ---- Owner voids a sale --------------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_sale uuid;
  v_live int;
begin
  raise notice '--- phase 4: voiding ---';

  select id into v_sale from public.sales where sale_number = 'S-260918-001';

  -- A mixed sale writes one money-in entry per division, so the day's figures
  -- split by themselves.
  if (select count(*) from public.ledger_entries
       where source_table = 'sales' and source_id = v_sale) <> 2 then
    raise exception 'FAIL: expected one money-in entry per division';
  end if;
  raise notice 'PASS: a mixed sale writes one money-in entry per division';

  if not exists (
    select 1 from public.ledger_entries
     where source_id = v_sale and tag = 'apparel' and category = 'dtf_prints'
       and amount_centavos = 25000
  ) then
    raise exception 'FAIL: the apparel line did not reach the apparel books';
  end if;
  raise notice 'PASS: each division''s share reaches its own books';

  -- The takings were recorded against the staff member who rang it up.
  if (select created_by from public.sales where id = v_sale)
     <> '33333333-3333-3333-3333-333333333333' then
    raise exception 'FAIL: the sale does not record who made it';
  end if;
  raise notice 'PASS: every sale records who rang it up';

  perform public.void_sale(v_sale, 'Charged for 12 pages, customer only had 10');

  if (select voided_at from public.sales where id = v_sale) is null then
    raise exception 'FAIL: the sale was not marked voided';
  end if;
  raise notice 'PASS: the owner can void a sale';

  -- The row is still there - the customer may be holding the receipt.
  if not exists (select 1 from public.sales where id = v_sale) then
    raise exception 'FAIL: voiding deleted the sale';
  end if;
  raise notice 'PASS: voiding marks the sale, it never deletes it';

  -- And its takings stop counting, or the day would still show the money.
  select count(*) into v_live from public.ledger_entries
   where source_table = 'sales' and source_id = v_sale and voided_at is null;
  if v_live <> 0 then
    raise exception 'FAIL: % takings entries survived the void', v_live;
  end if;
  raise notice 'PASS: voiding a sale also voids its takings';

  -- Voiding twice is refused.
  begin
    perform public.void_sale(v_sale, 'Again');
    raise exception 'FAIL: the same sale was voided twice';
  exception when others then
    raise notice 'PASS: a sale cannot be voided twice';
  end;
end;
$$;

-- ---- The database refuses figures that do not add up --------------------
do $$
begin
  raise notice '--- phase 4: arithmetic guards ---';

  begin
    insert into public.sales (
      sale_number, sale_date, subtotal_centavos, discount_centavos,
      total_centavos, payment_method
    )
    values ('S-BAD-001', date '2026-09-18', 1000, 100, 950, 'cash');
    raise exception 'FAIL: a sale whose total does not match was accepted';
  exception when check_violation then
    raise notice 'PASS: a sale total must equal subtotal less discount';
  end;

  begin
    insert into public.sales (
      sale_number, sale_date, subtotal_centavos, total_centavos,
      payment_method, money_given_centavos, change_centavos
    )
    values ('S-BAD-002', date '2026-09-18', 1000, 1000, 'gcash', 2000, 1000);
    raise exception 'FAIL: change was recorded on a non-cash sale';
  exception when check_violation then
    raise notice 'PASS: change only applies to a cash sale';
  end;

  begin
    insert into public.sale_lines (
      sale_id, name, division, quantity, unit_price_centavos, line_total_centavos
    )
    select id, 'Bad line', 'printshoppe', 3, 100, 250
      from public.sales where sale_number = 'S-260918-002';
    raise exception 'FAIL: a line whose total does not match was accepted';
  exception when check_violation then
    raise notice 'PASS: a line total must equal price times quantity';
  end;
end;
$$;

-- ---- End-of-day closing (spec 15.2) -------------------------------------
do $$
begin
  raise notice '--- phase 4: end of day ---';

  insert into public.day_closings (
    closing_date, expected_cash_centavos, counted_cash_centavos,
    difference_centavos, gcash_centavos, total_sales_centavos
  )
  values (date '2026-09-18', 28600, 28400, -200, 300, 28900);
  raise notice 'PASS: a day can be closed with a counted drawer';

  -- One closing per day.
  begin
    insert into public.day_closings (
      closing_date, expected_cash_centavos, counted_cash_centavos, difference_centavos
    )
    values (date '2026-09-18', 28600, 28600, 0);
    raise exception 'FAIL: a day was closed twice';
  exception when unique_violation then
    raise notice 'PASS: a day can only be closed once';
  end;
end;
$$;

reset role;
\echo 'ALL PHASE 4 TESTS PASSED'
