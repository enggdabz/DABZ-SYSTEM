-- A DEACTIVATED ACCOUNT READS NOTHING OF ITS OWN (spec 4.2, migration 0017).
--
-- Deactivating an account removes all access immediately. A token stays valid
-- until it expires, though, so "immediately" has to be enforced by the
-- policies rather than by the sign-in screen - somebody dismissed this morning
-- must not be able to read their own wage this afternoon.
--
-- Every check below is run TWICE against the same rows: once while Juan is
-- active, to prove the policy still serves the people it is meant to, and once
-- after he is deactivated, to prove it stops. A test that only checks the
-- second half would pass just as well on a policy that refuses everybody.

\set ON_ERROR_STOP on

-- Juan (33333333) is the staff account from 03; his staff row and a payroll
-- week, attendance, an advance and a deduction come from 05.

set role authenticated;
set test.user_id = '33333333-3333-3333-3333-333333333333';

do $$
declare
  v_staff int;
  v_perms int;
  v_weeks int;
  v_days int;
  v_attendance int;
  v_advances int;
  v_deductions int;
begin
  raise notice '--- deactivated accounts: while still active ---';

  select count(*) into v_staff from public.staff;
  if v_staff <> 1 then
    raise exception 'FAIL: an active staff member cannot read their own staff row (got %)', v_staff;
  end if;
  raise notice 'PASS: an active staff member reads their own staff row';

  if (select daily_rate_centavos from public.staff) is null then
    raise exception 'FAIL: an active staff member cannot read their own daily rate';
  end if;
  raise notice 'PASS: and their own daily rate';

  select count(*) into v_perms from public.user_permissions;
  if v_perms < 1 then
    raise exception 'FAIL: an active staff member cannot read their own permissions';
  end if;
  raise notice 'PASS: an active staff member reads their own permissions';

  if public.my_staff_id() is null then
    raise exception 'FAIL: my_staff_id() is null for an active staff member';
  end if;
  raise notice 'PASS: my_staff_id() answers for an active staff member';

  select count(*) into v_weeks from public.payroll_weeks;
  select count(*) into v_days from public.payroll_days;
  select count(*) into v_attendance from public.attendance_entries;
  select count(*) into v_advances from public.cash_advances;
  select count(*) into v_deductions from public.advance_deductions;

  if v_weeks < 1 or v_attendance < 1 then
    raise exception 'FAIL: an active staff member cannot read their own payslip or attendance';
  end if;
  raise notice 'PASS: an active staff member reads their own payslips and attendance';
end;
$$;

-- Dismissed. Only the owner may do this, and the token in hand does not change.
reset role;
update public.profiles
   set status = 'inactive'
 where id = '33333333-3333-3333-3333-333333333333';

set role authenticated;
set test.user_id = '33333333-3333-3333-3333-333333333333';

do $$
begin
  raise notice '--- deactivated accounts: with the same live token ---';

  if public.current_role_name() is not null then
    raise exception 'FAIL: a deactivated account still has a role';
  end if;
  raise notice 'PASS: a deactivated account has no role';

  -- The finding this file was written for: the wage record.
  if (select count(*) from public.staff) <> 0 then
    raise exception 'FAIL: a deactivated account still reads its own staff row, daily rate and all';
  end if;
  raise notice 'PASS: a deactivated account cannot read its own staff row';

  if (select count(*) from public.user_permissions) <> 0 then
    raise exception 'FAIL: a deactivated account still reads its own permissions';
  end if;
  raise notice 'PASS: a deactivated account cannot read its own permissions';

  /*
    The wider half. These five tables never mention auth.uid(): they compare
    against my_staff_id(), which is SECURITY DEFINER and so bypasses RLS on
    `staff`. Guarding the two policies above would have left every one of them
    open, which is why 0017 guards the helper.
  */
  if public.my_staff_id() is not null then
    raise exception 'FAIL: my_staff_id() still answers for a deactivated account';
  end if;
  raise notice 'PASS: my_staff_id() is null for a deactivated account';

  if (select count(*) from public.payroll_weeks) <> 0 then
    raise exception 'FAIL: a deactivated account still reads its own payslips';
  end if;
  if (select count(*) from public.payroll_days) <> 0 then
    raise exception 'FAIL: a deactivated account still reads its own payroll days';
  end if;
  raise notice 'PASS: a deactivated account cannot read its own payslips';

  if (select count(*) from public.attendance_entries) <> 0 then
    raise exception 'FAIL: a deactivated account still reads its own attendance';
  end if;
  raise notice 'PASS: a deactivated account cannot read its own attendance';

  if (select count(*) from public.cash_advances) <> 0 then
    raise exception 'FAIL: a deactivated account still reads its own cash advances';
  end if;
  if (select count(*) from public.advance_deductions) <> 0 then
    raise exception 'FAIL: a deactivated account still reads its own advance deductions';
  end if;
  raise notice 'PASS: a deactivated account cannot read its own cash advances';

  /*
    The one thing it CAN still read, on purpose: its own profile row. That is
    what the app reads to discover the account is inactive and to say so. It
    carries their own username and name and nothing about anybody else.
  */
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'FAIL: a deactivated account cannot read its own profile, so nothing can tell them why';
  end if;
  raise notice 'PASS: it still reads its own profile, which is how it is told it is inactive';
end;
$$;

-- Put Juan back, so a later test file finds the fixtures as it expects them.
reset role;
update public.profiles
   set status = 'active'
 where id = '33333333-3333-3333-3333-333333333333';

do $$
begin
  if public.current_role_name() is null then
    -- Acting as the table owner here, so auth.uid() is unset; just prove the
    -- row went back.
    if (select status from public.profiles
         where id = '33333333-3333-3333-3333-333333333333') <> 'active' then
      raise exception 'FAIL: the fixture was left deactivated';
    end if;
  end if;
  raise notice 'PASS: the fixture is active again for the tests that follow';
end;
$$;

\echo 'ALL DEACTIVATED ACCOUNT TESTS PASSED'
