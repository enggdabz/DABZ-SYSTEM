-- Tests for one-time bills (0029) and paying a bill in parts (0030).
--
-- The rules that matter:
--   * A one-time bill must say which month it is for.
--   * Any number of part payments, but only ONE settling payment a month.
--   * No part payment once the month is settled.
--   * Every part payment writes its own ledger entry and, for a linked
--     installment, its own loan payment - and undo takes back the latest one.
--   * Staff still cannot pay a bill at all.
--
-- Accounts (from 03): 1111 owner, 2222 Maria (admin), 3333 Juan (staff).

\set ON_ERROR_STOP on

set role authenticated;
set test.user_id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_loan uuid;
  v_bill uuid;
  v_one_time uuid;
  v_count int;
  v_sum bigint;
begin
  raise notice '--- bills: monthly and one-time ---';

  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'bills'
         and column_name = 'frequency') not like '%monthly%' then
    raise exception 'FAIL: a bill is not monthly by default';
  end if;
  raise notice 'PASS: a bill is monthly unless it says otherwise';

  begin
    insert into public.bills (name, amount_centavos, frequency, starts_month)
    values ('No month', 100, 'one_time', null);
    raise exception 'FAIL: a one-time bill with no month was accepted';
  exception when check_violation then
    raise notice 'PASS: a one-time bill must say which month it is for';
  end;

  begin
    insert into public.bills (name, amount_centavos, starts_month)
    values ('Mid month', 100, date '2027-03-15');
    raise exception 'FAIL: a mid-month starting month was accepted';
  exception when check_violation then
    raise notice 'PASS: a starting month is the first of a month';
  end;

  begin
    insert into public.bills (name, amount_centavos, frequency)
    values ('Yearly', 100, 'yearly');
    raise exception 'FAIL: an unknown frequency was accepted';
  exception when check_violation then
    raise notice 'PASS: a bill is monthly or one-time, nothing else';
  end;

  insert into public.bills (name, amount_centavos, frequency, starts_month)
  values ('Aircon repair', 450000, 'one_time', date '2027-03-01')
  returning id into v_one_time;
  raise notice 'PASS: an admin can add a one-time bill';

  raise notice '--- bills: part payments ---';

  select id into v_loan from public.loans where lender = 'BPI';
  insert into public.bills (name, amount_centavos, type, loan_id, starts_month)
  values ('Parts test', 1000000, 'loan_installment', v_loan, date '2027-03-01')
  returning id into v_bill;

  perform public.mark_bill_paid(v_bill, date '2027-03-01', 300000, date '2027-03-05', 'cash_drawer', null, true);
end;
$$;

-- The second part in a transaction of its own, as it is in the app: undo
-- tells "latest" by when a payment was written, and one transaction writes
-- everything at the same moment.
select public.mark_bill_paid(
  (select id from public.bills where name = 'Parts test'),
  date '2027-03-01', 200000, date '2027-03-10', 'gcash', null, true
) is not null as second_part_recorded \gset

do $$
declare
  v_loan uuid;
  v_bill uuid;
  v_count int;
  v_sum bigint;
begin
  select id, loan_id into v_bill, v_loan from public.bills where name = 'Parts test';

  select count(*), sum(amount_centavos) into v_count, v_sum
    from public.bill_payments where bill_id = v_bill and is_partial;
  if v_count <> 2 or v_sum <> 500000 then
    raise exception 'FAIL: expected two part payments of 5,000 in all, found % totalling %', v_count, v_sum;
  end if;
  raise notice 'PASS: a bill can be paid in more than one part';

  select count(*) into v_count from public.ledger_entries e
    join public.bill_payments p on p.ledger_entry_id = e.id
   where p.bill_id = v_bill and e.voided_at is null and e.note like 'Part payment of %';
  if v_count <> 2 then
    raise exception 'FAIL: expected a ledger entry per part payment, found %', v_count;
  end if;
  raise notice 'PASS: every part payment writes its own ledger entry';

  select count(*) into v_count from public.loan_payments lp
    join public.bill_payments p on p.loan_payment_id = lp.id
   where p.bill_id = v_bill;
  if v_count <> 2 then
    raise exception 'FAIL: expected a loan payment per part, found %', v_count;
  end if;
  raise notice 'PASS: a part payment pays the loan down by the part';

  begin
    perform public.mark_bill_paid(v_bill, date '2027-03-01', 0, date '2027-03-10', 'gcash', null, true);
    raise exception 'FAIL: a part payment of zero was accepted';
  exception when raise_exception then
    raise notice 'PASS: a part payment has to be more than zero';
  end;

  perform public.mark_bill_paid(v_bill, date '2027-03-01', 500000, date '2027-03-20', 'bank', null);
  raise notice 'PASS: the rest settles the month';

  begin
    perform public.mark_bill_paid(v_bill, date '2027-03-01', 1000, date '2027-03-21', 'bank', null);
    raise exception 'FAIL: a settled month was settled twice';
  exception when unique_violation then
    raise notice 'PASS: a month is settled only once';
  end;

  begin
    perform public.mark_bill_paid(v_bill, date '2027-03-01', 1000, date '2027-03-21', 'bank', null, true);
    raise exception 'FAIL: a part payment was taken on a settled month';
  exception when unique_violation then
    raise notice 'PASS: no part payment once the month is settled';
  end;

  -- Undo takes back the settling payment first, then the parts, latest first.
  perform public.undo_bill_payment(v_bill, date '2027-03-01', 'Testing');
  if exists (select 1 from public.bill_payments where bill_id = v_bill and not is_partial) then
    raise exception 'FAIL: undo did not take back the settling payment first';
  end if;
  raise notice 'PASS: undo takes back the settling payment first';
end;
$$;

do $$
declare
  v_loan uuid;
  v_bill uuid;
  v_count int;
  v_sum bigint;
begin
  select id, loan_id into v_bill, v_loan from public.bills where name = 'Parts test';
  perform public.undo_bill_payment(v_bill, date '2027-03-01', 'Testing');
  select count(*), sum(amount_centavos) into v_count, v_sum
    from public.bill_payments where bill_id = v_bill;
  if v_count <> 1 or v_sum <> 300000 then
    raise exception 'FAIL: undo should have left the first part of 3,000, found % totalling %', v_count, v_sum;
  end if;
  raise notice 'PASS: undo then takes back the latest part payment';

  if (select count(*) from public.loan_payments lp
       where lp.loan_id = v_loan and lp.note like '%"Parts test"%') <> 1 then
    raise exception 'FAIL: undo left a loan payment behind';
  end if;
  raise notice 'PASS: undo removes that part''s loan payment';
end;
$$;

-- ---- Staff cannot pay a bill, in part or whole ---------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_rows int;
begin
  raise notice '--- bills: staff ---';
  begin
    perform public.mark_bill_paid(gen_random_uuid(), date '2027-03-01', 1000, date '2027-03-05', 'cash_drawer', null, true);
    raise exception 'FAIL: staff paid a bill';
  exception when raise_exception then
    -- The bill is invisible to staff, so it "no longer exists".
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: staff cannot make a part payment';
  end;

  select count(*) into v_rows from public.bill_payments;
  if v_rows <> 0 then
    raise exception 'FAIL: staff can see % bill payments', v_rows;
  end if;
  raise notice 'PASS: staff still see no bill payments';
end;
$$;

reset role;
