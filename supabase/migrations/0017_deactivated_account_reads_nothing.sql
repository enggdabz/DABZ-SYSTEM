-- Close the last ways a DEACTIVATED ACCOUNT still reads its own records.
--
-- WHAT WAS WRONG
-- Deactivating an account is supposed to remove all access immediately
-- (spec 4.2). `current_role_name()` returns null for a deactivated person, so
-- every policy written in terms of a role or a permission already refuses
-- them. The own-row policies did not: they matched on `auth.uid()` alone, and
-- a token stays valid until it expires. So somebody dismissed this morning
-- could still read, this afternoon:
--
--   * their own `staff` row - DAILY RATE, address, emergency contact;
--   * their own permission list;
--   * their own payslips, attendance, cash advances and deductions.
--
-- The third one is the widest and the least obvious. Those five tables do not
-- mention `auth.uid()` at all - they go through `my_staff_id()`, which is
-- SECURITY DEFINER, so it bypasses Row Level Security on `staff` and answered
-- for anybody whose profile id matched, active or not. Guarding the policies
-- one by one would have left it open; guarding the helper closes all five at
-- once, which is why the fix is there rather than in five more policies.
--
-- Migration `0015` fixed this same defect on `sales`, `sale_lines` and
-- `void_requests`. These are the rest of them, found by listing every policy
-- whose predicate reaches `auth.uid()` and every SECURITY DEFINER helper that
-- resolves the caller, rather than by looking where a test happened to fail.
--
-- WHAT IS DELIBERATELY LEFT ALONE
-- `profiles_read_self` still matches on `id = auth.uid()` with no check, and
-- that is on purpose. It is the row the app reads to discover that the account
-- is inactive - `getSignedInUser()` reads `status` from it and sends the person
-- to "your account is no longer active". Guarding it would make a dismissed
-- person's own name unreadable to the screen trying to explain the situation,
-- and they would get a blank "signed out" instead. It carries their own
-- username and full name and nothing about anybody else, which is a fair price
-- for being able to say what happened.
--
-- `stock_movements_insert` looks unguarded too and is not: its check goes
-- through `has_permission()`, which is already false for a deactivated
-- account.

-- ---------------------------------------------------------------------------
-- The helper five tables depend on
-- ---------------------------------------------------------------------------

/*
  Which staff record belongs to the person asking - and null when nobody is
  asking, or when the account has been deactivated.

  SECURITY DEFINER because it reads `staff`, which is row-protected: a staff
  member cannot see the staff list, so a plain sub-query here would return
  nothing for exactly the people it is meant to serve (the same trap
  `is_active_staff` was written to escape). Being SECURITY DEFINER is what
  makes checking the caller here MANDATORY rather than optional: nothing above
  it will do the check on its way past.
*/
create or replace function public.my_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.staff s
  where s.profile_id = auth.uid()
    -- Signed in AND still active. Null for a deactivated account, which makes
    -- payroll_weeks, payroll_days, attendance_entries, cash_advances and
    -- advance_deductions all refuse it, since every own-row policy on those
    -- five compares against this.
    and public.current_role_name() is not null
  limit 1;
$$;

comment on function public.my_staff_id() is
  'The caller''s own staff row id, or null when they are not signed in or their account has been deactivated.';

-- ---------------------------------------------------------------------------
-- The two own-row policies that still matched on auth.uid() alone
-- ---------------------------------------------------------------------------

-- A staff row carries the daily rate, the home address and the emergency
-- contact. It is the most personal record in the system after the payslips.
drop policy if exists staff_read_own on public.staff;
create policy staff_read_own on public.staff
  for select using (
    profile_id = auth.uid() and public.current_role_name() is not null
  );

drop policy if exists user_permissions_read_self on public.user_permissions;
create policy user_permissions_read_self on public.user_permissions
  for select using (
    user_id = auth.uid() and public.current_role_name() is not null
  );
