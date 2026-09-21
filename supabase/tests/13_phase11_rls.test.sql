-- Security tests for Phase 11: notifications on a phone.
--
-- A push subscription is a small row with an outsized consequence: whoever
-- holds an endpoint plus its two keys can send a notification to that phone.
-- So there are two things to prove, and neither is about money.
--
--   1. A PERSON SEES ONLY THEIR OWN. Not "Owner/Admin see everything" - an
--      endpoint is a device, and one admin reading another's device list is a
--      privacy question with no upside.
--
--   2. STAFF CANNOT SUBSCRIBE AT ALL. Every figure a digest can carry - money
--      owed, stock, an unclaimed unit, a stranger's message - is Owner/Admin
--      material under spec 4.3. A notification is just a screen that arrives
--      on its own, so it obeys the same rule as the screen.
--
-- The people here come from the earlier files: eddie is the owner, maria an
-- admin, juan and nena staff.

\set ON_ERROR_STOP on

set role authenticated;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  raise notice '--- phase 11: structure ---';

  if to_regclass('public.push_subscriptions') is null then
    raise exception 'FAIL: push_subscriptions does not exist';
  end if;

  if not (
    select relrowsecurity from pg_class where relname = 'push_subscriptions'
  ) then
    raise exception 'FAIL: push_subscriptions has Row Level Security switched off';
  end if;
  raise notice 'PASS: push_subscriptions exists, with RLS on';

  -- Four policies, one per verb. A missing delete policy would mean a person
  -- could not withdraw a permission they had granted.
  if (
    select count(*) from pg_policies where tablename = 'push_subscriptions'
  ) <> 4 then
    raise exception 'FAIL: expected a policy for each of select, insert, update and delete';
  end if;
  raise notice 'PASS: there is a policy for each verb, delete included';
end;
$$;

-- ---------------------------------------------------------------------------
-- The owner turns a phone on
-- ---------------------------------------------------------------------------

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_id uuid;
begin
  raise notice '--- phase 11: the owner ---';

  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth, user_agent, created_by
  )
  values (
    '11111111-1111-1111-1111-111111111111',
    'https://fcm.googleapis.com/fcm/send/eddie-phone',
    'eddie-p256dh', 'eddie-auth', 'Android phone · Chrome',
    '11111111-1111-1111-1111-111111111111'
  )
  returning id into v_id;

  if (select count(*) from public.push_subscriptions) <> 1 then
    raise exception 'FAIL: the owner cannot read the phone they just added';
  end if;
  raise notice 'PASS: the owner can turn a phone on and see it';

  -- Nothing is sent until a digest goes out, so a new row must start with no
  -- date on it. A default of today would silently skip the first morning.
  if (select last_digest_on from public.push_subscriptions where id = v_id) is not null then
    raise exception 'FAIL: a new subscription was born already marked as sent to';
  end if;
  raise notice 'PASS: a new phone has never been sent to';

  -- Re-subscribing the same browser must update rather than duplicate, or the
  -- owner gets every notification twice.
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (
      '11111111-1111-1111-1111-111111111111',
      'https://fcm.googleapis.com/fcm/send/eddie-phone',
      'other', 'other'
    );
    raise exception 'FAIL: the same endpoint was stored twice';
  exception when unique_violation then
    raise notice 'PASS: one endpoint cannot be stored twice';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Nobody registers a phone against somebody else's account
-- ---------------------------------------------------------------------------

set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  raise notice '--- phase 11: an admin ---';

  /*
    The one that matters most. Without `user_id = auth.uid()` in the WITH
    CHECK, an admin could point a row at the owner's account and start
    receiving the owner's notifications on their own phone.
  */
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (
      '11111111-1111-1111-1111-111111111111',
      'https://fcm.googleapis.com/fcm/send/maria-stealing',
      'k', 'a'
    );
    raise exception 'FAIL: an admin registered a phone against the owner''s account';
  exception when insufficient_privilege then
    raise notice 'PASS: a phone cannot be registered against somebody else';
  end;

  -- Their own is fine.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, created_by)
  values (
    '22222222-2222-2222-2222-222222222222',
    'https://fcm.googleapis.com/fcm/send/maria-phone',
    'maria-p256dh', 'maria-auth', '22222222-2222-2222-2222-222222222222'
  );
  raise notice 'PASS: an admin can turn on their own phone';

  -- And sees ONLY their own, not the owner's.
  if (select count(*) from public.push_subscriptions) <> 1 then
    raise exception 'FAIL: an admin sees % rows, expected only their own',
      (select count(*) from public.push_subscriptions);
  end if;
  if (select endpoint from public.push_subscriptions)
     <> 'https://fcm.googleapis.com/fcm/send/maria-phone' then
    raise exception 'FAIL: an admin is reading somebody else''s endpoint';
  end if;
  raise notice 'PASS: an admin sees their own phone and not the owner''s';

  -- Nor can they switch the owner's off.
  perform 1;
  if (
    select count(*) from public.push_subscriptions
    where endpoint = 'https://fcm.googleapis.com/fcm/send/eddie-phone'
  ) <> 0 then
    raise exception 'FAIL: an admin can see the owner''s phone';
  end if;
  raise notice 'PASS: the owner''s phone is invisible to an admin';
end;
$$;

-- The owner, in turn, sees only their own - so the privacy runs both ways.
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  if (select count(*) from public.push_subscriptions) <> 1 then
    raise exception 'FAIL: the owner can see the admin''s phone';
  end if;
  raise notice 'PASS: it runs both ways - the owner cannot see the admin''s phone';
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff get nothing, whatever they have been ticked for
-- ---------------------------------------------------------------------------

/*
  Juan has add_sales, record_expenses, stock_in_out, apparel_job_orders and
  dabztech_tickets by this point - nearly every checkbox there is. None of them
  is Owner or Admin, and a digest carries figures spec 4.3 keeps from staff, so
  he still cannot subscribe.
*/
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  raise notice '--- phase 11: a staff member with most permissions ---';

  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (
      '33333333-3333-3333-3333-333333333333',
      'https://fcm.googleapis.com/fcm/send/juan-phone',
      'k', 'a'
    );
    raise exception 'FAIL: a staff member subscribed to notifications';
  exception when insufficient_privilege then
    raise notice 'PASS: a staff member cannot subscribe, whatever their checkboxes';
  end;

  if (select count(*) from public.push_subscriptions) <> 0 then
    raise exception 'FAIL: a staff member can see somebody''s phone';
  end if;
  raise notice 'PASS: a staff member sees no phones at all';
end;
$$;

-- Nena has view_daily_sales_report, which is the widest a staff account gets.
set test.user_id = '66666666-6666-6666-6666-666666666666';
do $$
begin
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (
      '66666666-6666-6666-6666-666666666666',
      'https://fcm.googleapis.com/fcm/send/nena-phone',
      'k', 'a'
    );
    raise exception 'FAIL: the daily sales report permission bought a subscription';
  exception when insufficient_privilege then
    raise notice 'PASS: the daily sales report permission is not a way in either';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Turning one off
-- ---------------------------------------------------------------------------

set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_owner_id uuid;
begin
  raise notice '--- phase 11: turning a phone off ---';

  -- An admin cannot delete the owner's, even naming its id directly. The row
  -- is invisible to them, so the delete matches nothing rather than erroring -
  -- which is the right shape: RLS refuses rows, it does not explain itself.
  select id into v_owner_id from public.push_subscriptions
  where endpoint = 'https://fcm.googleapis.com/fcm/send/eddie-phone';

  if v_owner_id is not null then
    raise exception 'FAIL: an admin could see the owner''s subscription id';
  end if;

  delete from public.push_subscriptions
  where endpoint = 'https://fcm.googleapis.com/fcm/send/eddie-phone';
  raise notice 'PASS: an admin deleting the owner''s phone removes nothing';

  -- Their own comes off cleanly, leaving nothing behind that could be sent to.
  delete from public.push_subscriptions
  where endpoint = 'https://fcm.googleapis.com/fcm/send/maria-phone';

  if (select count(*) from public.push_subscriptions) <> 0 then
    raise exception 'FAIL: an admin could not turn their own phone off';
  end if;
  raise notice 'PASS: a person can turn their own phone off, and it is gone';
end;
$$;

-- The owner's survived all of that.
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  if (select count(*) from public.push_subscriptions) <> 1 then
    raise exception 'FAIL: the owner''s phone did not survive the admin''s delete';
  end if;
  raise notice 'PASS: the owner''s phone is untouched';
end;
$$;

-- ---------------------------------------------------------------------------
-- Deactivated, and not signed in
-- ---------------------------------------------------------------------------

set test.user_id = '11111111-1111-1111-1111-111111111111';
update public.profiles set status = 'inactive' where username = 'maria';

set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  raise notice '--- phase 11: a deactivated account ---';

  -- Spec 13.1, and the hole 0015 closed on sales: a switched-off account
  -- stops reading immediately, not at the next sign-in.
  if (select count(*) from public.push_subscriptions) <> 0 then
    raise exception 'FAIL: a deactivated admin still reads subscriptions';
  end if;

  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (
      '22222222-2222-2222-2222-222222222222',
      'https://fcm.googleapis.com/fcm/send/maria-again',
      'k', 'a'
    );
    raise exception 'FAIL: a deactivated admin subscribed a phone';
  exception when insufficient_privilege then
    raise notice 'PASS: a deactivated account can neither read nor subscribe';
  end;
end;
$$;

set test.user_id = '11111111-1111-1111-1111-111111111111';
update public.profiles set status = 'active' where username = 'maria';

set test.user_id = '';
do $$
begin
  if (select count(*) from public.push_subscriptions) <> 0 then
    raise exception 'FAIL: somebody not signed in read the subscriptions';
  end if;
  raise notice 'PASS: nobody signed in sees no phones';
end;
$$;

do $$
begin
  raise notice 'ALL PHASE 11 TESTS PASSED';
end;
$$;

reset role;
