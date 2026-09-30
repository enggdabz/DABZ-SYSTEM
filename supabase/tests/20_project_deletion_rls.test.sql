-- Security and money tests for deleting a project with the owner's approval.
--
-- The rules that matter most here:
--   * An admin who calls delete_project gets a REQUEST and no deletion. The
--     owner deletes at once. Anybody else is refused - by the database, not by
--     a button.
--   * Only the owner can approve or reject; an admin, the admin who asked and
--     staff cannot.
--   * A rejected or withdrawn request leaves the project exactly as it was.
--   * Approving is a SOFT delete: the project row, its payments, the sale and
--     the ledger entries all stay, and the money still counts.
--   * A project with a request waiting cannot be edited or have its stage
--     changed; a deleted one takes no more payments.
--   * Nobody can write a request or a notification by hand.
--
-- Accounts (from 03): 1111 owner, 2222 Maria (admin), 3333 Juan (staff,
-- add_sales), 4444 Rosa (staff, nothing).

\set ON_ERROR_STOP on

set role authenticated;

set test.user_id = '11111111-1111-1111-1111-111111111111';
delete from public.user_permissions
 where user_id in ('33333333-3333-3333-3333-333333333333',
                   '44444444-4444-4444-4444-444444444444');
insert into public.user_permissions (user_id, permission) values
  ('33333333-3333-3333-3333-333333333333', 'add_sales');

-- Fixtures for this file, made by the counter person, as the shop would.
set test.user_id = '33333333-3333-3333-3333-333333333333';
create temp table t_ids (name text primary key, id uuid, sale_id uuid);
grant all on t_ids to authenticated;
do $$
declare
  r record;
begin
  select * into r from public.create_project(
    date '2026-10-01', 'apparel', null, 'Coach Ramon', null, 'Team jerseys',
    500000, date '2026-10-20', 'sublimation_jerseys',
    'down', 200000, 'cash', null, 200000, 0,
    '{"type":"apparel","values":{"uniformKind":"sublimation_jersey","pieces":10},"sizes":{"M":10}}'::jsonb);
  insert into t_ids values ('p1', r.project_id, r.sale_id);

  select * into r from public.create_project(
    date '2026-10-01', 'printshoppe', null, 'Tita Baby', null, 'Tarpaulin',
    100000, date '2026-10-10', 'tarpaulin',
    'down', 40000, 'cash', null, 40000, 0,
    '{"type":"tarpaulin","values":{"widthFeet":3,"heightFeet":5,"quantity":1}}'::jsonb);
  insert into t_ids values ('p2', r.project_id, r.sale_id);

  select * into r from public.create_project(
    date '2026-10-01', 'printshoppe', null, 'Mang Jose', null, 'Stickers',
    60000, date '2026-10-12', 'stickers',
    'down', 20000, 'cash', null, 20000, 0,
    '{"type":"printing","values":{"item":"stickers","quantity":50,"specs":"Round"}}'::jsonb);
  insert into t_ids values ('p3', r.project_id, r.sale_id);
end;
$$;

-- ---- Structure -----------------------------------------------------------
do $$
begin
  raise notice '--- project deletion: structure ---';

  if exists (
    select 1 from pg_tables
    where schemaname = 'public'
      and tablename in ('project_deletion_requests', 'app_notifications')
      and not rowsecurity
  ) then
    raise exception 'FAIL: row level security is off on a new table';
  end if;
  raise notice 'PASS: row level security is on for both new tables';

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('project_deletion_requests', 'app_notifications')
      and cmd <> 'SELECT'
  ) then
    raise exception 'FAIL: a new table has a write policy';
  end if;
  raise notice 'PASS: neither table has a write policy - every write is a function';

  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'projects'
        and column_name in ('deleted_at', 'deleted_by')) <> 2 then
    raise exception 'FAIL: projects has no soft delete columns';
  end if;
  raise notice 'PASS: projects carries deleted_at and deleted_by';

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'project_deletion_one_pending'
      and indexdef ilike '%unique%' and indexdef ilike '%pending%'
  ) then
    raise exception 'FAIL: nothing limits a project to one pending request';
  end if;
  raise notice 'PASS: one pending request per project is a unique index';

  if not exists (
    select 1 from pg_constraint
    where conname = 'audit_log_action_check'
      and pg_get_constraintdef(oid) like '%approve%'
      and pg_get_constraintdef(oid) like '%reject%'
      and pg_get_constraintdef(oid) like '%request%'
      and pg_get_constraintdef(oid) like '%cancel%'
  ) then
    raise exception 'FAIL: the audit log cannot record request/approve/reject/cancel';
  end if;
  raise notice 'PASS: the audit log accepts request, approve, reject and cancel';
end;
$$;

-- ---- Staff cannot delete or request -------------------------------------
do $$
declare
  v_id uuid;
begin
  raise notice '--- project deletion: who may ask ---';
  select id into v_id from t_ids where name = 'p1';

  begin
    perform public.delete_project(v_id, 'I want it gone');
    raise exception 'FAIL: counter staff deleted (or requested deleting) a project';
  exception when insufficient_privilege then
    raise notice 'PASS: counter staff cannot delete or request a deletion';
  end;

  if (select deleted_at from public.projects where id = v_id) is not null
     or (select count(*) from public.project_deletion_requests) <> 0 then
    raise exception 'FAIL: a refused staff call left something behind';
  end if;
end;
$$;

set test.user_id = '44444444-4444-4444-4444-444444444444';
do $$
begin
  begin
    perform public.delete_project((select id from t_ids where name = 'p1'), 'x');
    raise exception 'FAIL: a person with no permissions got past delete_project';
  exception when insufficient_privilege then
    raise notice 'PASS: a person with no permissions is refused';
  end;
end;
$$;

-- ---- An admin asks; nothing is deleted ----------------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_id uuid;
  r record;
begin
  raise notice '--- project deletion: an admin only creates a request ---';
  select id into v_id from t_ids where name = 'p1';

  begin
    perform public.delete_project(v_id, '   ');
    raise exception 'FAIL: a request with no reason was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a reason is required';
  end;

  select * into r from public.delete_project(v_id, 'Wrong team name, redo it');
  if r.outcome <> 'requested' or r.request_id is null then
    raise exception 'FAIL: an admin did not get a request (got %)', r.outcome;
  end if;
  raise notice 'PASS: an admin calling delete_project gets outcome "requested"';

  if (select deleted_at from public.projects where id = v_id) is not null then
    raise exception 'FAIL: the admin''s call deleted the project';
  end if;
  raise notice 'PASS: the project is untouched';

  if (select status from public.project_deletion_requests where id = r.request_id) <> 'pending'
     or (select requested_by from public.project_deletion_requests where id = r.request_id)
        <> '22222222-2222-2222-2222-222222222222' then
    raise exception 'FAIL: the request does not name the admin and pending';
  end if;
  raise notice 'PASS: the request is pending and names the admin';

  begin
    perform public.delete_project(v_id, 'Again');
    raise exception 'FAIL: a second pending request was created';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: only one pending request per project';
  end;

  if public.project_deletion_pending(v_id) is not true then
    raise exception 'FAIL: the project does not say a deletion is pending';
  end if;
  raise notice 'PASS: the project reports a pending deletion';
end;
$$;

-- The owner was told; the admin was not (they asked).
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  if (select count(*) from public.app_notifications
      where user_id = '11111111-1111-1111-1111-111111111111'
        and message like '%deletion request is waiting%') <> 1 then
    raise exception 'FAIL: the owner was not notified of the request';
  end if;
  raise notice 'PASS: the owner is notified once';
end;
$$;

-- ---- While pending: no edits, no stage changes --------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_id uuid := (select id from t_ids where name = 'p1');
begin
  raise notice '--- project deletion: a pending project is frozen ---';

  begin
    perform public.mark_project_step(v_id, 'design');
    raise exception 'FAIL: a stage changed while a deletion was pending';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a step cannot be ticked while a deletion is pending';
  end;

  begin
    perform public.cancel_project(v_id, 'Trying to sidestep');
    raise exception 'FAIL: a pending project was cancelled';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: it cannot be cancelled while a deletion is pending';
  end;

  begin
    perform public.release_project(v_id);
    raise exception 'FAIL: a pending project was released';
  exception when raise_exception then
    -- Refused either because the work is unfinished or because of the freeze;
    -- both are refusals, and the trigger is checked directly below.
    raise notice 'PASS: it cannot be released while a deletion is pending';
  end;

  -- The trigger itself, for any writer, present or future. An admin has no
  -- UPDATE policy on projects, so this is tried as the table's owner - the
  -- role every SECURITY DEFINER function runs as.
  reset role;
  begin
    update public.projects set description = 'Edited while pending' where id = v_id;
    raise exception 'FAIL: a pending project was edited';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: no column of a pending project can be edited';
  end;
  set role authenticated;

  -- A customer's money is still taken.
  perform public.record_project_balance(v_id, date '2026-10-02', 50000, 'cash', null, 50000, 0);
  raise notice 'PASS: a balance payment is still accepted while a deletion is pending';
end;
$$;

-- ---- Only the owner decides ---------------------------------------------
do $$
declare
  v_request uuid;
begin
  raise notice '--- project deletion: only the owner decides ---';
  select id into v_request from public.project_deletion_requests where status = 'pending';

  begin
    perform public.decide_project_deletion(v_request, true, 'approving my own');
    raise exception 'FAIL: an admin approved a deletion';
  exception when insufficient_privilege then
    raise notice 'PASS: an admin cannot approve';
  end;

  begin
    perform public.decide_project_deletion(v_request, false, null);
    raise exception 'FAIL: an admin rejected a deletion';
  exception when insufficient_privilege then
    raise notice 'PASS: an admin cannot reject';
  end;

  if (select status from public.project_deletion_requests where id = v_request) <> 'pending' then
    raise exception 'FAIL: a refused decision changed the request';
  end if;
end;
$$;

set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_request uuid;
begin
  begin
    -- Juan cannot even read the request, so he is refused before that.
    perform public.decide_project_deletion(gen_random_uuid(), true, null);
    raise exception 'FAIL: staff approved a deletion';
  exception when insufficient_privilege then
    raise notice 'PASS: staff cannot approve';
  end;

  begin
    perform public.cancel_project_deletion(gen_random_uuid());
    raise exception 'FAIL: staff withdrew a request';
  exception when insufficient_privilege then
    raise notice 'PASS: staff cannot withdraw a request';
  end;

  if (select count(*) from public.project_deletion_requests) <> 0 then
    raise exception 'FAIL: staff can read deletion requests';
  end if;
  raise notice 'PASS: staff cannot read deletion requests';
end;
$$;

-- ---- Withdrawn: the project is exactly as it was ------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_id uuid := (select id from t_ids where name = 'p1');
  v_request uuid;
begin
  raise notice '--- project deletion: a withdrawn request ---';
  select id into v_request from public.project_deletion_requests where status = 'pending';
  perform public.cancel_project_deletion(v_request);

  if (select status from public.project_deletion_requests where id = v_request) <> 'cancelled' then
    raise exception 'FAIL: the request was not cancelled';
  end if;
  if (select deleted_at from public.projects where id = v_id) is not null then
    raise exception 'FAIL: withdrawing a request deleted the project';
  end if;
  perform public.mark_project_step(v_id, 'design');
  raise notice 'PASS: withdrawn - the project is untouched and can be worked on again';
end;
$$;

-- ---- Rejected: the project is untouched ---------------------------------
do $$
declare
  v_id uuid := (select id from t_ids where name = 'p1');
  r record;
begin
  select * into r from public.delete_project(v_id, 'Ask again after checking');
  if r.outcome <> 'requested' then
    raise exception 'FAIL: could not ask again after a withdrawal';
  end if;
  raise notice 'PASS: a new request can follow a withdrawn one';
  create temp table if not exists t_req (id uuid);
  grant all on t_req to authenticated;
  delete from t_req;
  insert into t_req values (r.request_id);
end;
$$;

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_id uuid := (select id from t_ids where name = 'p1');
  v_request uuid := (select id from t_req);
  v_steps int;
begin
  raise notice '--- project deletion: the owner rejects ---';
  select count(*) into v_steps from public.project_steps where project_id = v_id;

  perform public.decide_project_deletion(v_request, false, 'Keep it - the team is coming back');

  if (select status from public.project_deletion_requests where id = v_request) <> 'rejected'
     or (select reviewed_by from public.project_deletion_requests where id = v_request)
        <> '11111111-1111-1111-1111-111111111111'
     or (select review_note from public.project_deletion_requests where id = v_request) is null then
    raise exception 'FAIL: the rejection is not recorded with the owner and the note';
  end if;
  if (select deleted_at from public.projects where id = v_id) is not null then
    raise exception 'FAIL: a rejected request deleted the project';
  end if;
  if (select count(*) from public.project_steps where project_id = v_id) <> v_steps then
    raise exception 'FAIL: a rejection changed the project''s steps';
  end if;
  raise notice 'PASS: a rejected request leaves the project untouched';

  begin
    perform public.decide_project_deletion(v_request, true, null);
    raise exception 'FAIL: a decided request was decided again';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a request is decided once';
  end;
end;
$$;

-- The admin was told.
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  if not exists (
    select 1 from public.app_notifications
    where message like '%rejected: Keep it - the team is coming back%'
  ) then
    raise exception 'FAIL: the admin was not told about the rejection';
  end if;
  if exists (
    select 1 from public.app_notifications
    where user_id <> '22222222-2222-2222-2222-222222222222'
  ) then
    raise exception 'FAIL: the admin can read somebody else''s notifications';
  end if;
  raise notice 'PASS: the admin is told, and sees only their own notifications';
end;
$$;

-- ---- Approved: a soft delete, and the money stays ----------------------
do $$
declare
  v_id uuid := (select id from t_ids where name = 'p1');
  r record;
begin
  select * into r from public.delete_project(v_id, 'Duplicate of another job');
  delete from t_req;
  insert into t_req values (r.request_id);
end;
$$;

set test.user_id = '11111111-1111-1111-1111-111111111111';
create temp table t_money (before_in bigint, before_sales bigint);
grant all on t_money to authenticated;
insert into t_money
select
  (select coalesce(sum(le.amount_centavos), 0) from public.ledger_entries le
    where le.source_table = 'sales' and le.direction = 'in' and le.voided_at is null),
  (select count(*) from public.sales);

do $$
declare
  v_id uuid := (select id from t_ids where name = 'p1');
  v_request uuid := (select id from t_req);
begin
  raise notice '--- project deletion: the owner approves ---';
  perform public.decide_project_deletion(v_request, true, null);

  if (select status from public.project_deletion_requests where id = v_request) <> 'approved' then
    raise exception 'FAIL: the request is not approved';
  end if;
  if (select deleted_at from public.projects where id = v_id) is null
     or (select deleted_by from public.projects where id = v_id)
        <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'FAIL: approving did not soft-delete the project';
  end if;
  raise notice 'PASS: approving soft-deletes the project and records the owner';

  if (select count(*) from public.projects where id = v_id) <> 1 then
    raise exception 'FAIL: the project row was removed';
  end if;
  if (select count(*) from public.project_payments where project_id = v_id) <> 2
     or (select count(*) from public.project_steps where project_id = v_id) < 1 then
    raise exception 'FAIL: the project''s payments or steps went with it';
  end if;
  raise notice 'PASS: the row, its payments and its steps are all still there';

  if (select count(*) from public.sales) <> (select before_sales from t_money)
     or (select coalesce(sum(le.amount_centavos), 0) from public.ledger_entries le
          where le.source_table = 'sales' and le.direction = 'in' and le.voided_at is null)
        <> (select before_in from t_money) then
    raise exception 'FAIL: deleting a project moved money';
  end if;
  if exists (
    select 1 from public.sales s
    join public.project_payments pp on pp.sale_id = s.id
    where pp.project_id = v_id and s.voided_at is not null
  ) then
    raise exception 'FAIL: deleting a project voided its sales';
  end if;
  raise notice 'PASS: the sales and the ledger are exactly as they were';

  if public.project_paid_centavos(v_id) <> 250000 then
    raise exception 'FAIL: what the project was paid changed (%)', public.project_paid_centavos(v_id);
  end if;
end;
$$;

-- A deleted project is out of the way for the counter, but its money is
-- still labelled for whoever reads Sales.
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_id uuid := (select id from t_ids where name = 'p1');
  v_sale uuid := (select sale_id from t_ids where name = 'p1');
begin
  if (select count(*) from public.projects where id = v_id) <> 0 then
    raise exception 'FAIL: staff can still read a deleted project';
  end if;
  raise notice 'PASS: staff no longer see the deleted project';

  if not exists (select 1 from public.deleted_project_sale_ids(array[v_sale]) x where x = v_sale) then
    raise exception 'FAIL: the sale is not marked as belonging to a deleted project';
  end if;
  if exists (
    select 1 from public.deleted_project_sale_ids(
      array[(select sale_id from t_ids where name = 'p2')])
  ) then
    raise exception 'FAIL: a live project''s sale was marked deleted';
  end if;
  raise notice 'PASS: only a deleted project''s sales are marked "project deleted"';

  if (select count(*) from public.sales where id = v_sale) <> 1 then
    raise exception 'FAIL: the sale disappeared for the person who took it';
  end if;
  raise notice 'PASS: the sale is still visible to the counter';

  begin
    perform public.record_project_balance(v_id, date '2026-10-03', 1000, 'cash', null, 1000, 0);
    raise exception 'FAIL: a deleted project took a payment';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a deleted project takes no more payments';
  end;
end;
$$;

set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_id uuid := (select id from t_ids where name = 'p1');
begin
  if (select count(*) from public.projects where id = v_id) <> 1 then
    raise exception 'FAIL: an admin cannot read a deleted project';
  end if;
  begin
    perform public.mark_project_step(v_id, 'pattern');
    raise exception 'FAIL: a deleted project changed stage';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a deleted project cannot change stage';
  end;
  begin
    perform public.delete_project(v_id, 'again');
    raise exception 'FAIL: a deleted project was deleted again';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a deleted project cannot be deleted again';
  end;
end;
$$;

-- ---- The owner deletes at once ------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_id uuid := (select id from t_ids where name = 'p2');
  r record;
begin
  raise notice '--- project deletion: the owner needs no approval ---';
  select * into r from public.delete_project(v_id, 'Test entry');
  if r.outcome <> 'deleted' then
    raise exception 'FAIL: the owner''s delete did not delete (got %)', r.outcome;
  end if;
  if (select deleted_at from public.projects where id = v_id) is null then
    raise exception 'FAIL: the owner''s delete left the project standing';
  end if;
  if exists (select 1 from public.project_deletion_requests where project_id = v_id) then
    raise exception 'FAIL: an owner delete created a request';
  end if;
  raise notice 'PASS: the owner deletes immediately, with no request';

  begin
    perform public.delete_project(gen_random_uuid(), 'nothing');
    raise exception 'FAIL: deleting a project that is not there succeeded';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: deleting something that does not exist is refused';
  end;

  begin
    perform public.delete_project((select id from t_ids where name = 'p3'), '');
    raise exception 'FAIL: the owner deleted with no reason';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: the owner has to give a reason too';
  end;
end;
$$;

-- The owner acting on a pending request settles it.
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  perform public.delete_project((select id from t_ids where name = 'p3'), 'Not needed');
end;
$$;
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_id uuid := (select id from t_ids where name = 'p3');
  r record;
begin
  select * into r from public.delete_project(v_id, 'Owner acts first');
  if (select status from public.project_deletion_requests where project_id = v_id) <> 'approved' then
    raise exception 'FAIL: the owner''s direct delete left the request pending';
  end if;
  raise notice 'PASS: an owner delete settles the request that was waiting';
end;
$$;

-- ---- Nobody writes these tables by hand ---------------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  raise notice '--- project deletion: no way round the functions ---';

  begin
    insert into public.project_deletion_requests (project_id, requested_by, reason)
    values ((select id from t_ids where name = 'p1'),
            '22222222-2222-2222-2222-222222222222', 'by hand');
    raise exception 'FAIL: an admin wrote a request directly';
  exception when insufficient_privilege then
    raise notice 'PASS: a request cannot be written directly';
  end;

  begin
    update public.project_deletion_requests set status = 'approved';
    -- Zero rows updated is also a refusal: RLS filtered them all away.
    if found then raise exception 'FAIL: an admin approved a request by UPDATE'; end if;
    raise notice 'PASS: a request cannot be approved by UPDATE';
  exception when insufficient_privilege then
    raise notice 'PASS: a request cannot be approved by UPDATE';
  end;

  begin
    update public.projects set deleted_at = now(), deleted_by = auth.uid();
    if found then raise exception 'FAIL: an admin soft-deleted by UPDATE'; end if;
    raise notice 'PASS: a project cannot be soft-deleted by UPDATE';
  exception when insufficient_privilege then
    raise notice 'PASS: a project cannot be soft-deleted by UPDATE';
  end;

  begin
    insert into public.app_notifications (user_id, message)
    values ('11111111-1111-1111-1111-111111111111', 'forged');
    raise exception 'FAIL: an admin posted a notification directly';
  exception when insufficient_privilege then
    raise notice 'PASS: a notification cannot be written directly';
  end;

  begin
    perform public.notify_user('11111111-1111-1111-1111-111111111111', 'forged', null);
    raise exception 'FAIL: an admin called notify_user';
  exception when insufficient_privilege then
    raise notice 'PASS: notify_user is not callable by a signed-in person';
  end;
end;
$$;

-- Marking read only touches your own.
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  perform public.mark_notifications_read();
  if exists (select 1 from public.app_notifications
             where user_id = '11111111-1111-1111-1111-111111111111' and read_at is null) then
    raise exception 'FAIL: the owner''s notifications were not marked read';
  end if;
end;
$$;
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  if not exists (select 1 from public.app_notifications where read_at is null) then
    raise exception 'FAIL: the owner marking theirs read cleared the admin''s';
  end if;
  raise notice 'PASS: marking read touches only the caller''s own notifications';
end;
$$;

-- A person who was deactivated reads no notifications and no requests.
reset role;
update public.profiles set status = 'inactive'
 where id = '22222222-2222-2222-2222-222222222222';
set role authenticated;
do $$
begin
  if (select count(*) from public.app_notifications) <> 0
     or (select count(*) from public.project_deletion_requests) <> 0 then
    raise exception 'FAIL: a deactivated account still reads notifications or requests';
  end if;
  raise notice 'PASS: a deactivated account reads neither';
end;
$$;
reset role;
update public.profiles set status = 'active'
 where id = '22222222-2222-2222-2222-222222222222';
