-- Security tests for the Phase 1 tables.
--
-- These check the rules that protect real money and real people: that staff
-- cannot read each other's records, that an Admin cannot promote themselves or
-- edit the Owner, that the audit log cannot be rewritten, and that a
-- deactivated account loses access immediately.
--
-- Run with: supabase/tests/run.sh   (needs a local PostgreSQL; optional)

\set ON_ERROR_STOP on

-- Three people to test with.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'eddie@staff.dabz.local'),
  ('22222222-2222-2222-2222-222222222222', 'maria@staff.dabz.local'),
  ('33333333-3333-3333-3333-333333333333', 'juan@staff.dabz.local'),
  ('44444444-4444-4444-4444-444444444444', 'rosa@staff.dabz.local');

insert into public.profiles (id, username, full_name, role, must_change_password) values
  ('11111111-1111-1111-1111-111111111111', 'eddie', 'Eddie boy Garcia', 'owner', false),
  ('22222222-2222-2222-2222-222222222222', 'maria', 'Maria Admin', 'admin', false),
  ('33333333-3333-3333-3333-333333333333', 'juan', 'Juan Staff', 'staff', false),
  ('44444444-4444-4444-4444-444444444444', 'rosa', 'Rosa Staff', 'staff', false);

-- Juan may add sales; Rosa may not.
insert into public.user_permissions (user_id, permission) values
  ('33333333-3333-3333-3333-333333333333', 'add_sales');

do $$
begin
  raise notice '--- structure ---';

  -- There can only ever be one owner.
  begin
    insert into public.profiles (id, username, full_name, role)
    values ('55555555-5555-5555-5555-555555555555', 'fake', 'Fake Owner', 'owner');
    raise exception 'FAIL: a second owner was allowed';
  exception when unique_violation then
    raise notice 'PASS: a second owner is rejected';
  end;

  -- Usernames are lowercase and simple, since staff type them at the counter.
  begin
    insert into public.profiles (id, username, full_name)
    values ('55555555-5555-5555-5555-555555555555', 'Juan Dela Cruz', 'Bad Username');
    raise exception 'FAIL: a username with spaces and capitals was allowed';
  exception when check_violation then
    raise notice 'PASS: a malformed username is rejected';
  end;

  -- Settings must stay a single row.
  begin
    insert into public.app_settings (id) values (2);
    raise exception 'FAIL: a second settings row was allowed';
  exception when check_violation then
    raise notice 'PASS: a second settings row is rejected';
  end;

  -- Money limits are whole centavos and cannot be negative.
  begin
    update public.app_settings set staff_expense_approval_limit_centavos = -1 where id = 1;
    raise exception 'FAIL: a negative expense limit was allowed';
  exception when check_violation then
    raise notice 'PASS: a negative expense limit is rejected';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Now act as each person in turn, with RLS applied.
-- ---------------------------------------------------------------------------

set role authenticated;

-- ---- Signed out -----------------------------------------------------------
set test.user_id = '';
do $$
begin
  raise notice '--- signed out ---';
  if (select count(*) from public.profiles) <> 0 then
    raise exception 'FAIL: a signed-out visitor could read profiles';
  end if;
  raise notice 'PASS: signed out sees no profiles';

  if (select count(*) from public.app_settings) <> 0 then
    raise exception 'FAIL: a signed-out visitor could read settings';
  end if;
  raise notice 'PASS: signed out sees no settings';

  if public.has_permission('add_sales') then
    raise exception 'FAIL: a signed-out visitor was granted a permission';
  end if;
  raise notice 'PASS: signed out has no permissions';
end;
$$;

-- ---- Juan (staff) ---------------------------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  visible int;
begin
  raise notice '--- staff (Juan) ---';

  select count(*) into visible from public.profiles;
  if visible <> 1 then
    raise exception 'FAIL: staff saw % profiles, expected only their own', visible;
  end if;
  raise notice 'PASS: staff sees only their own profile';

  -- Staff need the discount limit at the counter, so settings are readable.
  if (select count(*) from public.app_settings) <> 1 then
    raise exception 'FAIL: staff could not read settings';
  end if;
  raise notice 'PASS: staff can read settings';

  -- ...but not change them.
  update public.app_settings set working_days_per_month = 20 where id = 1;
  if (select working_days_per_month from public.app_settings where id = 1) <> 26 then
    raise exception 'FAIL: staff changed the shop settings';
  end if;
  raise notice 'PASS: staff cannot change settings';

  -- Including the switch that decides whether THEY get signed out (0014).
  -- It is the owner's call, not the counter's.
  update public.app_settings set staff_stay_signed_in = false where id = 1;
  if (select staff_stay_signed_in from public.app_settings where id = 1) <> true then
    raise exception 'FAIL: staff changed their own sign-out rule';
  end if;
  raise notice 'PASS: staff cannot change their own sign-out rule';

  -- Permission checkboxes are respected.
  if not public.has_permission('add_sales') then
    raise exception 'FAIL: Juan has add_sales but was refused';
  end if;
  if public.has_permission('record_expenses') then
    raise exception 'FAIL: Juan does not have record_expenses but was allowed';
  end if;
  raise notice 'PASS: permission checkboxes are respected';

  -- Staff cannot hand themselves a new permission.
  begin
    insert into public.user_permissions (user_id, permission)
    values ('33333333-3333-3333-3333-333333333333', 'give_discounts');
    raise exception 'FAIL: staff granted themselves a permission';
  exception when insufficient_privilege then
    raise notice 'PASS: staff cannot grant themselves a permission';
  end;

  -- Staff cannot promote themselves.
  update public.profiles set role = 'owner' where id = auth.uid();
  if (select role from public.profiles where id = auth.uid()) <> 'staff' then
    raise exception 'FAIL: staff promoted themselves to owner';
  end if;
  raise notice 'PASS: staff cannot promote themselves';

  -- Staff cannot read the audit log or login history.
  if (select count(*) from public.login_events) <> 0 then
    raise exception 'FAIL: staff could read the login history';
  end if;
  raise notice 'PASS: staff cannot read the login history';
end;
$$;

-- ---- Maria (admin) --------------------------------------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  raise notice '--- admin (Maria) ---';

  if (select count(*) from public.profiles) <> 4 then
    raise exception 'FAIL: admin could not see every profile';
  end if;
  raise notice 'PASS: admin sees every profile';

  -- Admin may manage staff.
  update public.profiles set full_name = 'Juan Dela Cruz'
   where username = 'juan';
  if (select full_name from public.profiles where username = 'juan') <> 'Juan Dela Cruz' then
    raise exception 'FAIL: admin could not edit a staff profile';
  end if;
  raise notice 'PASS: admin can edit a staff profile';

  -- Admin may NOT touch the owner (spec 4.2).
  update public.profiles set full_name = 'Hacked' where username = 'eddie';
  if (select full_name from public.profiles where username = 'eddie') <> 'Eddie boy Garcia' then
    raise exception 'FAIL: admin edited the owner profile';
  end if;
  raise notice 'PASS: admin cannot edit the owner';

  -- Admin may NOT promote a staff member to admin: only the owner creates
  -- admins. This is the `with check` half of the policy doing its job, and it
  -- refuses out loud rather than quietly changing nothing.
  begin
    update public.profiles set role = 'admin' where username = 'rosa';
    raise exception 'FAIL: admin promoted a staff member to admin';
  exception when insufficient_privilege then
    raise notice 'PASS: admin cannot promote staff to admin';
  end;
  if (select role from public.profiles where username = 'rosa') <> 'staff' then
    raise exception 'FAIL: rosa is no longer staff';
  end if;

  -- Admin may not promote themselves to owner either.
  update public.profiles set role = 'owner' where id = auth.uid();
  if (select role from public.profiles where id = auth.uid()) <> 'admin' then
    raise exception 'FAIL: admin promoted themselves to owner';
  end if;
  raise notice 'PASS: admin cannot promote themselves';

  -- Admin may grant and revoke staff permissions.
  insert into public.user_permissions (user_id, permission)
  values ('44444444-4444-4444-4444-444444444444', 'record_expenses');
  if not exists (
    select 1 from public.user_permissions
    where user_id = '44444444-4444-4444-4444-444444444444'
      and permission = 'record_expenses'
  ) then
    raise exception 'FAIL: admin could not grant a permission';
  end if;
  raise notice 'PASS: admin can grant a permission';

  -- Admin may change shop settings.
  update public.app_settings set working_days_per_month = 25 where id = 1;
  if (select working_days_per_month from public.app_settings where id = 1) <> 25 then
    raise exception 'FAIL: admin could not change settings';
  end if;
  raise notice 'PASS: admin can change settings';

  -- Admin has every permission without any checkbox rows.
  if not public.has_permission('give_discounts') then
    raise exception 'FAIL: admin was refused a permission';
  end if;
  raise notice 'PASS: admin bypasses the permission checkboxes';
end;
$$;

-- ---- Eddie (owner) -------------------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  raise notice '--- owner (Eddie) ---';

  if (select count(*) from public.profiles) <> 4 then
    raise exception 'FAIL: owner could not see every profile';
  end if;
  raise notice 'PASS: owner sees every profile';

  -- Only the owner may create an admin.
  update public.profiles set role = 'admin' where username = 'rosa';
  if (select role from public.profiles where username = 'rosa') <> 'admin' then
    raise exception 'FAIL: owner could not promote staff to admin';
  end if;
  raise notice 'PASS: owner can promote staff to admin';

  -- Put Rosa back, and prove deactivation works.
  update public.profiles set role = 'staff', status = 'inactive' where username = 'rosa';
  raise notice 'PASS: owner can deactivate an account';

  if not public.is_owner() then
    raise exception 'FAIL: owner was not recognised as owner';
  end if;
  raise notice 'PASS: owner is recognised as owner';
end;
$$;

-- ---- Rosa, now deactivated ----------------------------------------------
set test.user_id = '44444444-4444-4444-4444-444444444444';
do $$
begin
  raise notice '--- deactivated (Rosa) ---';

  -- current_role_name() ignores inactive accounts, so every policy that
  -- depends on it closes at once.
  if public.current_role_name() is not null then
    raise exception 'FAIL: a deactivated account still has a role';
  end if;
  raise notice 'PASS: a deactivated account has no role';

  if public.has_permission('record_expenses') then
    raise exception 'FAIL: a deactivated account kept its permissions';
  end if;
  raise notice 'PASS: a deactivated account loses its permissions';

  if (select count(*) from public.app_settings) <> 0 then
    raise exception 'FAIL: a deactivated account could still read settings';
  end if;
  raise notice 'PASS: a deactivated account cannot read settings';
end;
$$;

-- ---- Not even the owner may write to the audit log from a browser -------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  raise notice '--- audit log writes ---';

  -- No insert policy exists, so every browser-side insert is refused - the
  -- server writes entries with the service-role key instead.
  begin
    insert into public.audit_log (actor_id, actor_username, action, entity, summary)
    values (auth.uid(), 'eddie', 'update', 'app_settings', 'Invented entry');
    raise exception 'FAIL: the owner could forge an audit entry from the app';
  exception when insufficient_privilege then
    raise notice 'PASS: nobody can forge an audit entry, not even the owner';
  end;
end;
$$;

-- The server's own write, which bypasses RLS exactly as the service-role key
-- does on Supabase.
reset role;
insert into public.audit_log (actor_id, actor_username, action, entity, entity_id, summary)
values ('11111111-1111-1111-1111-111111111111', 'eddie', 'update', 'app_settings', '1',
        'Changed working days per month from 26 to 25');
set role authenticated;
set test.user_id = '11111111-1111-1111-1111-111111111111';

do $$
begin
  raise notice '--- audit log reads ---';

  if (select count(*) from public.audit_log) <> 1 then
    raise exception 'FAIL: owner could not read the audit log';
  end if;
  raise notice 'PASS: owner can read the audit log';

  -- No update policy exists, so an edit silently affects no rows.
  update public.audit_log set summary = 'Nothing to see here';
  if (select summary from public.audit_log limit 1) = 'Nothing to see here' then
    raise exception 'FAIL: the audit log was rewritten';
  end if;
  raise notice 'PASS: the audit log cannot be rewritten';

  -- Same for deletion: even the owner cannot erase history.
  delete from public.audit_log;
  if (select count(*) from public.audit_log) <> 1 then
    raise exception 'FAIL: the audit log was deleted';
  end if;
  raise notice 'PASS: the audit log cannot be deleted';
end;
$$;

-- ---------------------------------------------------------------------------
-- The forced password change (spec 4.1) - the sign-in loop
-- ---------------------------------------------------------------------------
-- A staff member and a NEW ADMIN are both created with must_change_password
-- true, and neither is matched by any update policy on their own profile row:
-- the owner policy needs is_owner(), and the admin policy needs the row being
-- edited to be a STAFF row, which an admin's own row is not. An update that
-- matches no policy changes nothing WITHOUT raising, so the flag survived the
-- password change and the person was sent back to /change-password forever.
--
-- These tests pin both halves: the table stays shut to self-updates, and
-- finish_password_change() is the one way to clear the flag.

reset role;
update public.profiles set must_change_password = true
 where username in ('eddie', 'maria', 'juan');
set role authenticated;

-- ---- Juan (staff) ---------------------------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  raise notice '--- forced password change ---';

  -- The table itself must stay shut, or the fix would be a way to self-promote.
  update public.profiles set must_change_password = false where id = auth.uid();
  if not (select must_change_password from public.profiles where id = auth.uid()) then
    raise exception 'FAIL: staff cleared the flag by updating profiles directly';
  end if;
  raise notice 'PASS: staff still cannot update their own profile row';

  perform public.finish_password_change();
  if (select must_change_password from public.profiles where id = auth.uid()) then
    raise exception 'FAIL: staff could not finish their forced password change';
  end if;
  raise notice 'PASS: staff can finish their forced password change';

  -- It clears the flag and nothing else.
  if (select role from public.profiles where id = auth.uid()) <> 'staff'
     or (select status from public.profiles where id = auth.uid()) <> 'active' then
    raise exception 'FAIL: finish_password_change changed more than the flag';
  end if;
  raise notice 'PASS: finish_password_change touches nothing but the flag';
end;
$$;

-- ---- Maria (admin) - the half that was never covered ----------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  update public.profiles set must_change_password = false where id = auth.uid();
  if not (select must_change_password from public.profiles where id = auth.uid()) then
    raise exception 'FAIL: an admin cleared their own flag by updating profiles';
  end if;
  raise notice 'PASS: an admin still cannot update their own profile row';

  perform public.finish_password_change();
  if (select must_change_password from public.profiles where id = auth.uid()) then
    raise exception 'FAIL: a new admin could not finish their forced password change';
  end if;
  raise notice 'PASS: a new admin can finish their forced password change';
end;
$$;

-- ---- Eddie (owner) - one caller, one row ----------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_reached boolean := false;
begin
  -- Juan and Maria cleared their own flags above; the owner's is untouched,
  -- because the function can only ever name the caller.
  if not (select must_change_password from public.profiles where username = 'eddie') then
    raise exception 'FAIL: somebody else''s call cleared the owner''s flag';
  end if;
  raise notice 'PASS: the flag is only ever cleared for the caller';

  perform public.finish_password_change();
  if (select must_change_password from public.profiles where id = auth.uid()) then
    raise exception 'FAIL: the owner could not finish a forced password change';
  end if;
  raise notice 'PASS: the owner can finish a forced password change';

  -- Nobody is signed in: the function refuses rather than picking a row.
  set local test.user_id = '';
  begin
    perform public.finish_password_change();
    v_reached := true;
  exception when others then
    null;
  end;
  if v_reached then
    raise exception 'FAIL: a signed-out visitor could finish a password change';
  end if;
  raise notice 'PASS: a signed-out visitor cannot finish a password change';
end;
$$;

reset role;
\echo 'ALL SECURITY TESTS PASSED'
