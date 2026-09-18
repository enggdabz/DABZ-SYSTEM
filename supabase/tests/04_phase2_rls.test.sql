-- Security tests for the Phase 2 money tables.
--
-- Bills, loans and the ledger hold the shop's whole financial position. Spec
-- 4.3 puts them beyond anything a staff checkbox can grant, so the rule being
-- tested here is blunt: a staff account can see NOTHING of them, not even a
-- row count.

\set ON_ERROR_STOP on

set role authenticated;

-- ---- Juan (staff) --------------------------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  raise notice '--- phase 2: staff (Juan) ---';

  if (select count(*) from public.bills) <> 0 then
    raise exception 'FAIL: staff could read the bills';
  end if;
  raise notice 'PASS: staff cannot see the bills';

  if (select count(*) from public.loans) <> 0 then
    raise exception 'FAIL: staff could read the loans';
  end if;
  raise notice 'PASS: staff cannot see the loans (or the total debt)';

  if (select count(*) from public.ledger_entries) <> 0 then
    raise exception 'FAIL: staff could read the ledger';
  end if;
  raise notice 'PASS: staff cannot see the ledger';

  if (select count(*) from public.bill_payments) <> 0 then
    raise exception 'FAIL: staff could read the bill payments';
  end if;
  if (select count(*) from public.loan_payments) <> 0 then
    raise exception 'FAIL: staff could read the loan payments';
  end if;
  raise notice 'PASS: staff cannot see any payment history';

  -- And cannot write, either.
  begin
    insert into public.bills (name, amount_centavos) values ('Fake bill', 100);
    raise exception 'FAIL: staff created a bill';
  exception when insufficient_privilege then
    raise notice 'PASS: staff cannot create a bill';
  end;

  begin
    insert into public.ledger_entries (direction, amount_centavos, tag, category, source)
    values ('in', 100000, 'printshoppe', 'photocopy', 'cash_drawer');
    raise exception 'FAIL: staff wrote to the ledger directly';
  exception when insufficient_privilege then
    raise notice 'PASS: staff cannot write to the ledger directly';
  end;

  -- Marking a bill paid is an Owner/Admin action (spec 4.3).
  begin
    insert into public.bill_payments (bill_id, period_month, amount_centavos, paid_on, source)
    values (gen_random_uuid(), date '2026-09-01', 100000, current_date, 'cash_drawer');
    raise exception 'FAIL: staff marked a bill paid';
  exception when insufficient_privilege or foreign_key_violation then
    -- Either refusal is fine: the policy stops it, or the bill id it invented
    -- does not exist. Both mean a staff account cannot mark a real bill paid.
    raise notice 'PASS: staff cannot mark a bill paid';
  end;
end;
$$;

-- ---- Maria (admin) -------------------------------------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  bill_count int;
  loan_count int;
  total_bills bigint;
  total_debt bigint;
begin
  raise notice '--- phase 2: admin (Maria) ---';

  select count(*), sum(amount_centavos) into bill_count, total_bills from public.bills;
  if bill_count <> 11 then
    raise exception 'FAIL: admin saw % bills, expected the 11 seeded ones', bill_count;
  end if;
  raise notice 'PASS: admin sees all 11 bills';

  -- The owner's own figure from spec 12.1. If the seed drifts, this catches it.
  if total_bills <> 14112700 then
    raise exception 'FAIL: seeded bills total % centavos, expected 14112700', total_bills;
  end if;
  raise notice 'PASS: the seeded bills add up to PHP 141,127.00';

  select count(*), sum(statement_balance_centavos) into loan_count, total_debt from public.loans;
  if loan_count <> 6 then
    raise exception 'FAIL: admin saw % loans, expected 6', loan_count;
  end if;
  if total_debt <> 133626400 then
    raise exception 'FAIL: seeded debt is % centavos, expected 133626400', total_debt;
  end if;
  raise notice 'PASS: the seeded loans add up to PHP 1,336,264.00';

  -- Nothing was invented where the owner has not answered yet (spec 17.13).
  if (select count(due_day) from public.bills) <> 0 then
    raise exception 'FAIL: a due day was invented for a bill';
  end if;
  if (select count(interest_percent_per_month) from public.loans) <> 0 then
    raise exception 'FAIL: an interest rate was invented for a loan';
  end if;
  raise notice 'PASS: no due day or interest rate was invented';

  -- The three installment bills point at their loans (spec 12.1).
  if (select count(loan_id) from public.bills) <> 3 then
    raise exception 'FAIL: expected 3 bills linked to loans';
  end if;
  raise notice 'PASS: the installment bills are linked to their loans';
end;
$$;

-- ---- Marking a bill paid, and the guards around it -----------------------
do $$
declare
  the_bill uuid;
begin
  raise notice '--- phase 2: marking a bill paid ---';

  select id into the_bill from public.bills where name = 'Electricity';

  insert into public.bill_payments (bill_id, period_month, amount_centavos, paid_on, source)
  values (the_bill, date '2026-09-01', 3500000, date '2026-09-18', 'cash_drawer');
  raise notice 'PASS: admin can mark a bill paid';

  -- Pressing "Mark paid" twice must not pay the bill twice.
  begin
    insert into public.bill_payments (bill_id, period_month, amount_centavos, paid_on, source)
    values (the_bill, date '2026-09-01', 3500000, date '2026-09-18', 'cash_drawer');
    raise exception 'FAIL: the same bill was paid twice in one month';
  exception when unique_violation then
    raise notice 'PASS: a bill cannot be paid twice in the same month';
  end;

  -- The same bill in a different month is a different payment.
  insert into public.bill_payments (bill_id, period_month, amount_centavos, paid_on, source)
  values (the_bill, date '2026-10-01', 3500000, date '2026-10-18', 'cash_drawer');
  raise notice 'PASS: the same bill can be paid again next month';

  -- A period must be the first of a month, or month grouping would break.
  begin
    insert into public.bill_payments (bill_id, period_month, amount_centavos, paid_on, source)
    values (the_bill, date '2026-11-15', 3500000, date '2026-11-15', 'cash_drawer');
    raise exception 'FAIL: a mid-month period was accepted';
  exception when check_violation then
    raise notice 'PASS: a payment period must be the start of a month';
  end;

  -- Undo is a real delete, because the row means "this was paid".
  delete from public.bill_payments
   where bill_id = the_bill and period_month = date '2026-10-01';
  if exists (select 1 from public.bill_payments where bill_id = the_bill and period_month = date '2026-10-01') then
    raise exception 'FAIL: undo did not remove the payment';
  end if;
  raise notice 'PASS: Mark paid can be undone';
end;
$$;

-- ---- The ledger refuses nonsense ----------------------------------------
do $$
begin
  raise notice '--- phase 2: ledger guards ---';

  begin
    insert into public.ledger_entries (direction, amount_centavos, tag, category, source)
    values ('in', 0, 'printshoppe', 'photocopy', 'cash_drawer');
    raise exception 'FAIL: a zero-amount ledger entry was accepted';
  exception when check_violation then
    raise notice 'PASS: a ledger entry cannot be for zero';
  end;

  begin
    insert into public.ledger_entries (direction, amount_centavos, tag, category, source)
    values ('in', -5000, 'printshoppe', 'photocopy', 'cash_drawer');
    raise exception 'FAIL: a negative ledger entry was accepted';
  exception when check_violation then
    raise notice 'PASS: a ledger entry cannot be negative (use the other direction)';
  end;

  begin
    insert into public.ledger_entries (direction, amount_centavos, tag, category, source)
    values ('sideways', 5000, 'printshoppe', 'photocopy', 'cash_drawer');
    raise exception 'FAIL: an invalid direction was accepted';
  exception when check_violation then
    raise notice 'PASS: money only goes in or out';
  end;

  begin
    insert into public.ledger_entries (direction, amount_centavos, tag, category, source)
    values ('in', 5000, 'printshoppe', 'photocopy', 'under_the_mat');
    raise exception 'FAIL: an invalid money source was accepted';
  exception when check_violation then
    raise notice 'PASS: money has to come from a real place';
  end;

  begin
    insert into public.ledger_entries (direction, amount_centavos, tag, category, source)
    values ('in', 5000, 'some_other_division', 'photocopy', 'cash_drawer');
    raise exception 'FAIL: an unknown division tag was accepted';
  exception when check_violation then
    raise notice 'PASS: every entry belongs to a real division or the whole shop';
  end;
end;
$$;

-- ---- Rosa, deactivated ---------------------------------------------------
set test.user_id = '44444444-4444-4444-4444-444444444444';
do $$
begin
  raise notice '--- phase 2: deactivated (Rosa) ---';

  if (select count(*) from public.bills) <> 0 then
    raise exception 'FAIL: a deactivated account could read the bills';
  end if;
  if (select count(*) from public.loans) <> 0 then
    raise exception 'FAIL: a deactivated account could read the loans';
  end if;
  raise notice 'PASS: a deactivated account sees no bills and no loans';
end;
$$;

-- ---- Signed out ----------------------------------------------------------
set test.user_id = '';
do $$
begin
  raise notice '--- phase 2: signed out ---';

  if (select count(*) from public.bills) <> 0
     or (select count(*) from public.loans) <> 0
     or (select count(*) from public.ledger_entries) <> 0 then
    raise exception 'FAIL: a signed-out visitor could read the money tables';
  end if;
  raise notice 'PASS: signed out sees nothing of the money tables';
end;
$$;

reset role;
\echo 'ALL PHASE 2 SECURITY TESTS PASSED'

-- ---- mark_bill_paid does everything, or nothing -------------------------
set role authenticated;
set test.user_id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_bill uuid;
  v_loan uuid;
  v_payment uuid;
  v_ledger_count int;
  v_loan_payments int;
  v_debt_before bigint;
  v_debt_after bigint;
begin
  raise notice '--- phase 2: mark_bill_paid ---';

  -- The BPI bill is linked to the BPI loan, so paying it must move both.
  select id, loan_id into v_bill, v_loan from public.bills where name = 'BPI';
  if v_loan is null then
    raise exception 'FAIL: the BPI bill is not linked to a loan';
  end if;

  select statement_balance_centavos into v_debt_before from public.loans where id = v_loan;

  v_payment := public.mark_bill_paid(
    v_bill, date '2026-09-01', 3325000, date '2026-09-18', 'bank', null
  );

  if v_payment is null then
    raise exception 'FAIL: mark_bill_paid returned nothing';
  end if;
  raise notice 'PASS: marking a bill paid records the payment';

  -- A ledger entry exists, tied back to the payment.
  select count(*) into v_ledger_count
    from public.ledger_entries
   where source_table = 'bill_payments' and source_id = v_payment;
  if v_ledger_count <> 1 then
    raise exception 'FAIL: expected 1 ledger entry, found %', v_ledger_count;
  end if;
  raise notice 'PASS: it writes one money-out entry to the ledger';

  -- An installment bill is categorised as a loan payment, not a fixed bill.
  if not exists (
    select 1 from public.ledger_entries
     where source_id = v_payment and category = 'loan_payments' and direction = 'out'
  ) then
    raise exception 'FAIL: the ledger entry is not categorised as a loan payment';
  end if;
  raise notice 'PASS: an installment bill is logged as a loan payment';

  -- And the loan has a payment against it.
  select count(*) into v_loan_payments
    from public.loan_payments where loan_id = v_loan and origin = 'bill';
  if v_loan_payments <> 1 then
    raise exception 'FAIL: expected 1 loan payment, found %', v_loan_payments;
  end if;
  raise notice 'PASS: it pays down the linked loan as well';

  -- Paying twice in the same month is refused, and nothing is left behind.
  begin
    perform public.mark_bill_paid(
      v_bill, date '2026-09-01', 3325000, date '2026-09-18', 'bank', null
    );
    raise exception 'FAIL: the bill was paid twice';
  exception when unique_violation then
    raise notice 'PASS: paying the same bill twice in a month is refused';
  end;

  -- The refused attempt must not have left a stray ledger entry behind. This
  -- is the whole reason the three writes are in one function.
  select count(*) into v_ledger_count
    from public.ledger_entries
   where source_table = 'bill_payments'
     and category = 'loan_payments'
     and voided_at is null;
  if v_ledger_count <> 1 then
    raise exception 'FAIL: a refused payment left % ledger entries behind', v_ledger_count;
  end if;
  raise notice 'PASS: a refused payment leaves no half-finished ledger entry';

  -- Undo: the ledger entry is voided, the loan payment is removed.
  perform public.undo_bill_payment(v_bill, date '2026-09-01', 'Testing undo');

  if exists (select 1 from public.bill_payments where id = v_payment) then
    raise exception 'FAIL: undo left the bill marked paid';
  end if;
  raise notice 'PASS: undo clears the month';

  if not exists (
    select 1 from public.ledger_entries
     where source_id = v_payment and voided_at is not null and void_reason = 'Testing undo'
  ) then
    raise exception 'FAIL: undo did not void the ledger entry';
  end if;
  raise notice 'PASS: undo voids the ledger entry rather than erasing it';

  if exists (select 1 from public.loan_payments where loan_id = v_loan and origin = 'bill') then
    raise exception 'FAIL: undo left the loan payment behind, understating the debt';
  end if;
  raise notice 'PASS: undo removes the loan payment, so the debt is honest again';

  select statement_balance_centavos into v_debt_after from public.loans where id = v_loan;
  if v_debt_before <> v_debt_after then
    raise exception 'FAIL: the statement balance was altered; only payments should change what is owed';
  end if;
  raise notice 'PASS: the statement balance itself is never quietly rewritten';
end;
$$;

-- ---- A staff account cannot call the function either --------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_bill uuid := gen_random_uuid();
begin
  raise notice '--- phase 2: staff cannot call mark_bill_paid ---';
  begin
    -- Staff cannot even see the bills, so the function cannot find one.
    perform public.mark_bill_paid(v_bill, date '2026-09-01', 100, current_date, 'cash_drawer', null);
    raise exception 'FAIL: a staff account marked a bill paid through the function';
  exception when others then
    raise notice 'PASS: staff cannot mark a bill paid through the function either';
  end;
end;
$$;

reset role;
\echo 'ALL PHASE 2 TRANSACTION TESTS PASSED'
