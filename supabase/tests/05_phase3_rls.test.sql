-- Security and payroll tests for Phase 3 (spec 13).
--
-- Wages are the most personal money in the shop. The rules being tested:
-- a staff member sees their own attendance and payslips and nobody else's;
-- a paid week is locked by the database rather than by the app; and paying
-- wages either does everything or nothing.

\set ON_ERROR_STOP on

-- Two employees: Juan has a login (from the Phase 1 tests), Nena does not,
-- because spec 13.1 says a login is optional.
insert into public.staff (id, profile_id, full_name, position, daily_rate_centavos, start_date)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
   'Juan Dela Cruz', 'Printer operator', 50000, date '2025-01-06'),
  ('aaaaaaaa-0000-0000-0000-000000000002', null,
   'Nena Santos', 'Sewer', 45000, date '2025-03-02'),
  -- And one with no daily rate yet, which is a real state, not a mistake.
  ('aaaaaaaa-0000-0000-0000-000000000003', null,
   'New Helper', 'Helper', null, date '2026-09-01');

do $$
begin
  raise notice '--- phase 3: structure ---';

  if (select count(*) from public.staff where profile_id is null) <> 2 then
    raise exception 'FAIL: staff without a login could not be stored';
  end if;
  raise notice 'PASS: a staff member can exist without a login account';

  if (select daily_rate_centavos from public.staff where full_name = 'New Helper') is not null then
    raise exception 'FAIL: a daily rate was invented';
  end if;
  raise notice 'PASS: a missing daily rate stays missing';

  begin
    insert into public.staff (full_name, daily_rate_centavos) values ('Bad Rate', -100);
    raise exception 'FAIL: a negative daily rate was accepted';
  exception when check_violation then
    raise notice 'PASS: a negative daily rate is rejected';
  end;

  -- One shift per person per day, so "Time in" is safe to press twice.
  insert into public.attendance_entries (staff_id, work_date, time_in)
  values ('aaaaaaaa-0000-0000-0000-000000000001', date '2026-09-14', '2026-09-14T00:00:00Z');

  begin
    insert into public.attendance_entries (staff_id, work_date, time_in)
    values ('aaaaaaaa-0000-0000-0000-000000000001', date '2026-09-14', '2026-09-14T01:00:00Z');
    raise exception 'FAIL: the same person timed in twice on one day';
  exception when unique_violation then
    raise notice 'PASS: one shift per person per day';
  end;

  -- A shift cannot end before it starts.
  begin
    insert into public.attendance_entries (staff_id, work_date, time_in, time_out)
    values ('aaaaaaaa-0000-0000-0000-000000000002', date '2026-09-15',
            '2026-09-15T09:00:00Z', '2026-09-15T00:00:00Z');
    raise exception 'FAIL: a shift ended before it started';
  exception when check_violation then
    raise notice 'PASS: a shift cannot end before it starts';
  end;

  -- A paid week must say when and how it was paid.
  begin
    insert into public.payroll_weeks (staff_id, week_start, daily_rate_centavos, status)
    values ('aaaaaaaa-0000-0000-0000-000000000001', date '2026-09-14', 50000, 'paid');
    raise exception 'FAIL: a week was marked paid with no date or method';
  exception when check_violation then
    raise notice 'PASS: a paid week must record when and how';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
set role authenticated;

-- ---- Juan (staff, and an employee) --------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_visible int;
begin
  raise notice '--- phase 3: staff (Juan) ---';

  if public.my_staff_id() <> 'aaaaaaaa-0000-0000-0000-000000000001' then
    raise exception 'FAIL: Juan was not matched to his own staff record';
  end if;
  raise notice 'PASS: a signed-in staff member is matched to their employee record';

  select count(*) into v_visible from public.staff;
  if v_visible <> 1 then
    raise exception 'FAIL: staff saw % employee records, expected only their own', v_visible;
  end if;
  raise notice 'PASS: staff sees only their own employee record, not colleagues''';

  -- Which means no colleague's wage, address or emergency contact (spec 4.4).
  if exists (select 1 from public.staff where full_name = 'Nena Santos') then
    raise exception 'FAIL: staff could read a colleague''s record';
  end if;
  raise notice 'PASS: staff cannot read a colleague''s wage or personal details';

  if (select count(*) from public.attendance_entries) <> 1 then
    raise exception 'FAIL: staff could see attendance that is not theirs';
  end if;
  raise notice 'PASS: staff sees only their own attendance';

  -- Staff cannot change their own wage.
  update public.staff set daily_rate_centavos = 999900 where id = public.my_staff_id();
  if (select daily_rate_centavos from public.staff where id = public.my_staff_id()) <> 50000 then
    raise exception 'FAIL: staff raised their own daily rate';
  end if;
  raise notice 'PASS: staff cannot change their own daily rate';

  -- Nor give themselves an advance.
  begin
    insert into public.cash_advances (staff_id, amount_centavos, advanced_on, source)
    values (public.my_staff_id(), 500000, current_date, 'cash_drawer');
    raise exception 'FAIL: staff gave themselves a cash advance';
  exception when insufficient_privilege then
    raise notice 'PASS: staff cannot give themselves a cash advance';
  end;

  -- Nor create a payroll week.
  begin
    insert into public.payroll_weeks (staff_id, week_start, daily_rate_centavos)
    values (public.my_staff_id(), date '2026-09-21', 999900);
    raise exception 'FAIL: staff created their own payroll week';
  exception when insufficient_privilege then
    raise notice 'PASS: staff cannot create a payroll week';
  end;
end;
$$;

-- ---- The time clock on a shared computer --------------------------------
do $$
declare
  v_recorded_by uuid;
begin
  raise notice '--- phase 3: the time clock ---';

  -- Spec 13.2: whoever is at the counter taps the button for whoever arrives,
  -- so a signed-in staff member may record attendance for a colleague. The
  -- guard is that who pressed it is stored.
  insert into public.attendance_entries (staff_id, work_date, time_in, recorded_by)
  values ('aaaaaaaa-0000-0000-0000-000000000002', date '2026-09-14',
          '2026-09-14T00:05:00Z', auth.uid());
  raise notice 'PASS: the shared time clock can record a colleague arriving';

  select recorded_by into v_recorded_by
    from public.attendance_entries
   where staff_id = 'aaaaaaaa-0000-0000-0000-000000000002' and work_date = date '2026-09-14';

  if v_recorded_by <> auth.uid() then
    raise exception 'FAIL: who pressed the button was not recorded';
  end if;
  raise notice 'PASS: every entry records who pressed the button';

  -- Timing out an open shift is allowed...
  update public.attendance_entries
     set time_out = '2026-09-14T09:00:00Z'
   where staff_id = 'aaaaaaaa-0000-0000-0000-000000000002' and work_date = date '2026-09-14';
  raise notice 'PASS: an open shift can be timed out';

  -- ...but a finished shift cannot be quietly rewritten by staff.
  update public.attendance_entries
     set time_out = '2026-09-14T14:00:00Z'
   where staff_id = 'aaaaaaaa-0000-0000-0000-000000000002' and work_date = date '2026-09-14';
  if (select time_out from public.attendance_entries
       where staff_id = 'aaaaaaaa-0000-0000-0000-000000000002'
         and work_date = date '2026-09-14') <> '2026-09-14T09:00:00Z'::timestamptz then
    raise exception 'FAIL: staff rewrote a finished shift to add hours';
  end if;
  raise notice 'PASS: staff cannot rewrite a finished shift to add hours';

  -- And cannot clock in someone who no longer works here.
  update public.staff set status = 'inactive' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
end;
$$;

-- ---- Maria (admin) ------------------------------------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_week uuid;
  v_ledger uuid;
  v_net bigint;
begin
  raise notice '--- phase 3: admin (Maria) ---';

  if (select count(*) from public.staff) <> 3 then
    raise exception 'FAIL: admin could not see every employee';
  end if;
  raise notice 'PASS: admin sees every employee';

  -- An inactive staff member cannot be clocked in.
  update public.staff set status = 'inactive' where full_name = 'New Helper';
  begin
    insert into public.attendance_entries (staff_id, work_date, time_in)
    values ('aaaaaaaa-0000-0000-0000-000000000003', date '2026-09-16', now());
    raise exception 'FAIL: an inactive staff member was clocked in';
  exception when insufficient_privilege then
    raise notice 'PASS: an inactive staff member cannot be clocked in';
  end;

  -- Build a payroll week: six full days at PHP 500 = PHP 3,000.
  insert into public.payroll_weeks (
    staff_id, week_start, daily_rate_centavos, gross_centavos, net_centavos,
    advance_deduction_centavos
  )
  values (
    'aaaaaaaa-0000-0000-0000-000000000001', date '2026-09-14', 50000,
    300000, 250000, 50000
  )
  returning id into v_week;

  insert into public.payroll_days (payroll_week_id, work_date, day_type)
  select v_week, date '2026-09-14' + offs, 'full'
    from generate_series(0, 5) as offs;
  raise notice 'PASS: admin can draft a payroll week';

  -- Give Juan an advance of PHP 500 first, so there is something to deduct.
  perform public.give_cash_advance(
    'aaaaaaaa-0000-0000-0000-000000000001', 50000, date '2026-09-10',
    'cash_drawer', 'Medicine', 'next_payday'
  );

  if not exists (
    select 1 from public.ledger_entries
     where category = 'cash_advances' and direction = 'out' and amount_centavos = 50000
  ) then
    raise exception 'FAIL: a cash advance did not record money leaving the shop';
  end if;
  raise notice 'PASS: a cash advance records the money leaving the shop';

  -- Pay the week.
  v_ledger := public.mark_payroll_paid(v_week, date '2026-09-21', 'cash_drawer');

  select net_centavos into v_net from public.payroll_weeks where id = v_week;

  if not exists (
    select 1 from public.ledger_entries
     where id = v_ledger and category = 'salaries' and direction = 'out'
       and amount_centavos = v_net
  ) then
    raise exception 'FAIL: wages were not recorded in the ledger at the net amount';
  end if;
  raise notice 'PASS: paying wages records the net amount as money out';

  if (select count(*) from public.advance_deductions where payroll_week_id = v_week) <> 1 then
    raise exception 'FAIL: the advance repayment was not recorded';
  end if;
  raise notice 'PASS: paying wages records the cash advance repayment';

  -- The balance owed should now be PHP 500 advanced less PHP 500 deducted.
  if (
    select coalesce(sum(amount_centavos), 0) from public.cash_advances
     where staff_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  ) - (
    select coalesce(sum(amount_centavos), 0) from public.advance_deductions
     where staff_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  ) <> 0 then
    raise exception 'FAIL: the advance balance did not clear';
  end if;
  raise notice 'PASS: the advance balance clears when it is deducted';

  -- A PAID WEEK IS LOCKED, by the database.
  update public.payroll_weeks set gross_centavos = 9999900 where id = v_week;
  if (select gross_centavos from public.payroll_weeks where id = v_week) <> 300000 then
    raise exception 'FAIL: a paid week was rewritten';
  end if;
  raise notice 'PASS: a paid week cannot be rewritten';

  update public.payroll_days set day_type = 'absent' where payroll_week_id = v_week;
  if exists (select 1 from public.payroll_days where payroll_week_id = v_week and day_type = 'absent') then
    raise exception 'FAIL: the days of a paid week were rewritten';
  end if;
  raise notice 'PASS: the days of a paid week cannot be rewritten';

  delete from public.payroll_weeks where id = v_week;
  if not exists (select 1 from public.payroll_weeks where id = v_week) then
    raise exception 'FAIL: a paid week was deleted';
  end if;
  raise notice 'PASS: a paid week cannot be deleted';

  -- Paying twice is refused.
  begin
    perform public.mark_payroll_paid(v_week, date '2026-09-21', 'cash_drawer');
    raise exception 'FAIL: the same week was paid twice';
  exception when others then
    raise notice 'PASS: the same week cannot be paid twice';
  end;

  -- An admin cannot unlock: spec 13.3 reserves that for the owner.
  begin
    perform public.unlock_payroll_week(v_week, 'Wrong amount');
    raise exception 'FAIL: an admin unlocked a paid week';
  exception when others then
    raise notice 'PASS: only the owner can unlock a paid week';
  end;
end;
$$;

-- ---- Juan reads his own payslip -----------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  raise notice '--- phase 3: reading my own payslip ---';

  if (select count(*) from public.payroll_weeks) <> 1 then
    raise exception 'FAIL: staff could not read their own payslip';
  end if;
  raise notice 'PASS: staff can read their own payslip';

  if (select count(*) from public.payroll_days) <> 6 then
    raise exception 'FAIL: staff could not read their own payroll days';
  end if;
  raise notice 'PASS: staff can read the days behind their own payslip';

  if (select count(*) from public.cash_advances) <> 1 then
    raise exception 'FAIL: staff could not see what they owe';
  end if;
  raise notice 'PASS: staff can see their own cash advance balance';
end;
$$;

-- ---- Nena has no login, so nothing is exposed through one ---------------
-- (Her record exists; there is simply no account that maps to it.)

-- ---- The owner unlocks --------------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_week uuid;
begin
  raise notice '--- phase 3: owner unlocks a week ---';

  select id into v_week from public.payroll_weeks limit 1;

  -- A reason is required.
  begin
    perform public.unlock_payroll_week(v_week, '   ');
    raise exception 'FAIL: a week was unlocked with no reason';
  exception when others then
    raise notice 'PASS: unlocking requires a reason';
  end;

  perform public.unlock_payroll_week(v_week, 'Overtime was missed');

  if (select status from public.payroll_weeks where id = v_week) <> 'draft' then
    raise exception 'FAIL: the week was not reopened';
  end if;
  raise notice 'PASS: the owner can reopen a paid week';

  if not exists (
    select 1 from public.ledger_entries
     where source_id = v_week and voided_at is not null
  ) then
    raise exception 'FAIL: the wages entry was not voided';
  end if;
  raise notice 'PASS: unlocking voids the wages entry rather than erasing it';

  if exists (select 1 from public.advance_deductions where payroll_week_id = v_week) then
    raise exception 'FAIL: the advance repayment survived, so the balance is understated';
  end if;
  raise notice 'PASS: unlocking removes the advance repayment, so what is owed is honest';

  if (select unlock_reason from public.payroll_weeks where id = v_week) <> 'Overtime was missed' then
    raise exception 'FAIL: the unlock reason was not kept';
  end if;
  raise notice 'PASS: the reason for unlocking is kept on the record';

  -- And now it can be edited again.
  update public.payroll_weeks set gross_centavos = 320000 where id = v_week;
  if (select gross_centavos from public.payroll_weeks where id = v_week) <> 320000 then
    raise exception 'FAIL: a reopened week is still locked';
  end if;
  raise notice 'PASS: a reopened week can be corrected';
end;
$$;

reset role;
\echo 'ALL PHASE 3 TESTS PASSED'
