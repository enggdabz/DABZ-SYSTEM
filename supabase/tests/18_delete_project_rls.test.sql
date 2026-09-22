-- Security tests for deleting a project (owner's request, 22 September 2026).
--
-- `0007` gave `apparel_orders` no delete policy at all. `0021` opens a gap in
-- that exactly the width of a MISTAKE, and this file is what holds the gap to
-- that width. What it proves:
--
--   * Owner and Admin may delete a project nothing has happened to.
--   * Nobody else may, not even a staff member with the apparel permission,
--     and not even on a project they just wrote themselves.
--   * A payment, a production mark, or being released each stop it - one at a
--     time, each proven on its own so a test cannot pass for the wrong reason.
--   * A cancelled project with nothing else behind it MAY still go, because
--     cancelling is a decision about the work rather than a record that money
--     moved.
--   * `apparel_order_has_history` answers NULL to anyone who is not
--     Owner/Admin, so it cannot be used to learn which jobs have money on them
--     one project at a time.
--   * The people and the items go with it, and nothing else does.

\set ON_ERROR_STOP on

set role authenticated;

-- ---- The policy exists and is shaped as expected -------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  raise notice '--- delete a project: structure ---';

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'apparel_orders' and cmd = 'DELETE'
  ) then
    raise exception 'FAIL: apparel_orders has no delete policy';
  end if;
  raise notice 'PASS: apparel_orders has a delete policy';

  -- The helper must be SECURITY DEFINER: the policy asks it about three other
  -- tables, and a policy sub-query is subject to RLS too.
  if not exists (
    select 1 from pg_proc where proname = 'apparel_order_has_history' and prosecdef
  ) then
    raise exception 'FAIL: apparel_order_has_history is not security definer';
  end if;
  raise notice 'PASS: the history helper is security definer';
end;
$$;

-- ---- A project nothing has happened to ------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_clean uuid;
  v_line uuid;
begin
  raise notice '--- delete a project: a mistake ---';

  insert into public.apparel_orders (order_number, team_name, created_by)
  values ('A-269022-801', 'Typed by mistake',
          '11111111-1111-1111-1111-111111111111')
  returning id into v_clean;

  insert into public.apparel_order_lines (order_id, name, uniform_type, created_by)
  values (v_clean, 'Jersey', 'jersey', '11111111-1111-1111-1111-111111111111')
  returning id into v_line;

  insert into public.apparel_order_names
    (line_id, uniform_type, player_name, size, price_centavos, created_by)
  values (v_line, 'jersey', 'Dela Cruz', 'M', 65000,
          '11111111-1111-1111-1111-111111111111');

  if public.apparel_order_has_history(v_clean) then
    raise exception 'FAIL: a project with only people on it was reported as having history';
  end if;
  raise notice 'PASS: people and items alone are not history';

  delete from public.apparel_orders where id = v_clean;
  if not found then
    raise exception 'FAIL: the owner could not delete a project nothing has happened to';
  end if;
  raise notice 'PASS: the owner deletes a project nothing has happened to';

  -- And its people and items went with it, rather than being orphaned.
  if exists (select 1 from public.apparel_order_lines where order_id = v_clean) then
    raise exception 'FAIL: an item outlived the project it was on';
  end if;
  if exists (select 1 from public.apparel_order_names where line_id = v_line) then
    raise exception 'FAIL: a person outlived the project they were on';
  end if;
  raise notice 'PASS: the items and the people go with it';
end;
$$;

-- ---- A payment stops it ---------------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_paid uuid;
  v_line uuid;
begin
  raise notice '--- delete a project: money stops it ---';

  insert into public.apparel_orders (order_number, team_name, created_by)
  values ('A-269022-802', 'Has paid a deposit',
          '11111111-1111-1111-1111-111111111111')
  returning id into v_paid;

  insert into public.apparel_order_lines
    (order_id, name, uniform_type, unit_price_centavos, quantity, created_by)
  values (v_paid, 'Jersey', 'jersey', 65000, 3,
          '11111111-1111-1111-1111-111111111111')
  returning id into v_line;

  perform public.record_apparel_payment(
    v_paid, 100000, current_date, 'cash_drawer', 'down_payment', null, null,
    jsonb_build_array(jsonb_build_object('category', 'sublimation_jerseys',
                                         'amount_centavos', 100000)));

  if not public.apparel_order_has_history(v_paid) then
    raise exception 'FAIL: a project with a payment was reported as clean';
  end if;
  raise notice 'PASS: a payment counts as history';

  delete from public.apparel_orders where id = v_paid;
  if found then
    raise exception 'FAIL: a project with money taken against it was deleted';
  end if;
  raise notice 'PASS: a project with money against it cannot be deleted';

  /*
    And a VOIDED payment still stops it. The money moved and came back; the
    ledger entries are still there pointing at it, and they cascade.
  */
  perform public.void_apparel_payment(
    (select id from public.apparel_payments where order_id = v_paid limit 1),
    'testing');

  if not public.apparel_order_has_history(v_paid) then
    raise exception 'FAIL: a voided payment stopped counting as history';
  end if;

  delete from public.apparel_orders where id = v_paid;
  if found then
    raise exception 'FAIL: a project whose only payment was voided got deleted';
  end if;
  raise notice 'PASS: a voided payment still counts as history';
end;
$$;

-- ---- A production mark stops it -------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_marked uuid;
  v_line uuid;
begin
  raise notice '--- delete a project: the shop floor stops it ---';

  insert into public.apparel_orders (order_number, team_name, created_by)
  values ('A-269022-803', 'On the bench',
          '11111111-1111-1111-1111-111111111111')
  returning id into v_marked;

  insert into public.apparel_order_lines (order_id, name, uniform_type, created_by)
  values (v_marked, 'Jersey', 'jersey', '11111111-1111-1111-1111-111111111111')
  returning id into v_line;

  insert into public.apparel_production_steps (line_id, stage, created_by)
  values (v_line, 'design', '11111111-1111-1111-1111-111111111111');

  if not public.apparel_order_has_history(v_marked) then
    raise exception 'FAIL: a project with a bench marked was reported as clean';
  end if;

  delete from public.apparel_orders where id = v_marked;
  if found then
    raise exception 'FAIL: a project with a bench marked was deleted';
  end if;
  raise notice 'PASS: a marked bench stops a project being deleted';

  -- Clear the mark and it may go: the rule is about what HAS happened, and
  -- somebody who un-ticks a bench is saying it did not.
  delete from public.apparel_production_steps where line_id = v_line;

  delete from public.apparel_orders where id = v_marked;
  if not found then
    raise exception 'FAIL: with its marks cleared the project still could not be deleted';
  end if;
  raise notice 'PASS: with the mark cleared, the project may go';
end;
$$;

-- ---- Released stops it, cancelled does not --------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_released uuid;
  v_cancelled uuid;
begin
  raise notice '--- delete a project: released and cancelled ---';

  insert into public.apparel_orders (order_number, team_name, status, created_by)
  values ('A-269022-804', 'Already collected', 'released',
          '11111111-1111-1111-1111-111111111111')
  returning id into v_released;

  if not public.apparel_order_has_history(v_released) then
    raise exception 'FAIL: a released project was reported as clean';
  end if;

  delete from public.apparel_orders where id = v_released;
  if found then
    raise exception 'FAIL: a released project was deleted - the customer has the jerseys';
  end if;
  raise notice 'PASS: a released project cannot be deleted';

  /*
    Cancelled is NOT history. Cancelling records a decision about the work, not
    that money moved - and a project cancelled by mistake is exactly one of the
    cases this whole change exists for.
  */
  insert into public.apparel_orders
    (order_number, team_name, status, cancel_reason, created_by)
  values ('A-269022-805', 'Cancelled by mistake', 'cancelled', 'testing',
          '11111111-1111-1111-1111-111111111111')
  returning id into v_cancelled;

  delete from public.apparel_orders where id = v_cancelled;
  if not found then
    raise exception 'FAIL: a cancelled project with nothing behind it could not be deleted';
  end if;
  raise notice 'PASS: a cancelled project with nothing behind it may go';
end;
$$;

-- ---- An admin may; a staff member with the apparel permission may not -----
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_admin_made uuid;
begin
  raise notice '--- delete a project: the admin ---';

  insert into public.apparel_orders (order_number, team_name, created_by)
  values ('A-269022-806', 'Admin typo',
          '22222222-2222-2222-2222-222222222222')
  returning id into v_admin_made;

  delete from public.apparel_orders where id = v_admin_made;
  if not found then
    raise exception 'FAIL: an admin could not delete a project nothing has happened to';
  end if;
  raise notice 'PASS: an admin deletes a project nothing has happened to';
end;
$$;

-- Juan has apparel_job_orders from 08. He writes projects all day; he does not
-- delete them.
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_own uuid;
begin
  raise notice '--- delete a project: the apparel permission ---';

  insert into public.apparel_orders (order_number, team_name, created_by)
  values ('A-269022-807', 'Staff typo',
          '33333333-3333-3333-3333-333333333333')
  returning id into v_own;

  -- Even a project they wrote themselves, seconds ago, with nothing on it.
  delete from public.apparel_orders where id = v_own;
  if found then
    raise exception 'FAIL: the apparel permission deleted a project';
  end if;
  raise notice 'PASS: the apparel permission cannot delete a project, even its own';

  /*
    And the helper tells them nothing. Published by PostgREST as a URL, one
    that answered everybody would be a way to learn which jobs have money
    against them, one project at a time - which staff may not see at all.
  */
  if public.apparel_order_has_history(v_own) is not null then
    raise exception 'FAIL: the history helper answered somebody who is not Owner/Admin';
  end if;
  raise notice 'PASS: the history helper answers null to anyone who is not Owner/Admin';

  -- Cancelling is still theirs to do, which is the alternative the screen
  -- offers them.
  update public.apparel_orders
  set status = 'cancelled', cancel_reason = 'typed by mistake'
  where id = v_own;
  if not found then
    raise exception 'FAIL: the apparel permission could not cancel its own project';
  end if;
  raise notice 'PASS: the apparel permission cancels instead';
end;
$$;

-- ---- And somebody with no apparel permission at all ----------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
delete from public.user_permissions
where user_id = '44444444-4444-4444-4444-444444444444'
  and permission = 'apparel_job_orders';

do $$
declare
  v_id uuid;
begin
  raise notice '--- delete a project: without the apparel permission ---';

  set local test.user_id = '11111111-1111-1111-1111-111111111111';
  select id into v_id from public.apparel_orders
  where order_number = 'A-269022-807';

  set local test.user_id = '44444444-4444-4444-4444-444444444444';

  delete from public.apparel_orders where id = v_id;
  if found then
    raise exception 'FAIL: somebody without the apparel permission deleted a project';
  end if;
  raise notice 'PASS: without the apparel permission, no project can be deleted';

  if public.apparel_order_has_history(v_id) is not null then
    raise exception 'FAIL: the history helper answered somebody without the permission';
  end if;
  raise notice 'PASS: the history helper stays silent for them too';
end;
$$;

do $$
begin
  raise notice 'ALL DELETE-A-PROJECT TESTS PASSED';
end;
$$;
