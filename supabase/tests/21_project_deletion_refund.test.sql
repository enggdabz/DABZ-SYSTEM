-- Money tests for the refund choice when a project is deleted.
--
-- The rules that matter most here:
--   * A refund is a VOID: the sale stays, marked, and its ledger entries are
--     voided with it. No new kind of money row, no fourth way into the ledger.
--   * It is a choice, only meaningful when something is paid. Refunding
--     nothing is refused.
--   * An admin's request moves no money; only the owner's approval (or the
--     owner's own delete) does, and it refunds what is live at that moment.
--   * Keeping the money leaves Sales exactly as it was.
--   * Nobody signed in can call the refund function directly.
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

-- Six projects, made at the counter. All printing, so one details shape.
set test.user_id = '33333333-3333-3333-3333-333333333333';
create temp table t_ids (name text primary key, id uuid, sale_id uuid);
grant all on t_ids to authenticated;
do $$
declare
  r record;
  n text;
  amounts bigint[] := array[200000, 40000, 30000, 100000, 70000, 50000];
  i int := 0;
begin
  foreach n in array array['refund_now', 'keep', 'nothing', 'asked', 'rejected', 'voided_first'] loop
    i := i + 1;
    select * into r from public.create_project(
      date '2026-10-02', 'printshoppe', null, 'Customer ' || n, null, 'Tarpaulin ' || n,
      600000, date '2026-10-20', 'tarpaulin',
      'down', amounts[i], 'cash', null, amounts[i], 0,
      '{"type":"tarpaulin","values":{"widthFeet":3,"heightFeet":5,"quantity":1}}'::jsonb);
    insert into t_ids values (n, r.project_id, r.sale_id);
  end loop;
end;
$$;

-- What the ledger says a project's live money is (as the owner - staff cannot
-- read the ledger).
create or replace function pg_temp.live_ledger(p_project uuid) returns bigint
language sql stable as $$
  select coalesce(sum(le.amount_centavos), 0)::bigint
  from public.ledger_entries le
  join public.project_payments pp on pp.sale_id = le.source_id
  where pp.project_id = p_project
    and le.source_table = 'sales' and le.direction = 'in' and le.voided_at is null;
$$;
grant execute on function pg_temp.live_ledger(uuid) to authenticated;

-- ---- Structure -----------------------------------------------------------
do $$
begin
  raise notice '--- project deletion refund: structure ---';

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_deletion_requests'
      and column_name = 'refund_requested'
  ) then
    raise exception 'FAIL: a request cannot remember the refund choice';
  end if;
  raise notice 'PASS: a request remembers the refund choice';

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'delete_project') <> 1 then
    raise exception 'FAIL: there is more than one delete_project to choose between';
  end if;
  raise notice 'PASS: exactly one delete_project';
end;
$$;

-- ---- The owner refunds and deletes ---------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_id uuid := (select id from t_ids where name = 'refund_now');
  v_sale uuid := (select sale_id from t_ids where name = 'refund_now');
  r record;
begin
  raise notice '--- project deletion refund: the owner refunds ---';

  select * into r from public.delete_project(v_id, 'Customer changed their mind', true);
  if r.outcome <> 'deleted' or r.refunded_centavos <> 200000 then
    raise exception 'FAIL: expected deleted and 200000 refunded, got % and %',
      r.outcome, r.refunded_centavos;
  end if;
  raise notice 'PASS: the owner deletes and the refund is what was paid';

  if (select deleted_at from public.projects where id = v_id) is null then
    raise exception 'FAIL: the project was not deleted';
  end if;

  if (select voided_at from public.sales where id = v_sale) is null
     or (select void_reason from public.sales where id = v_sale) not like 'Refunded:%' then
    raise exception 'FAIL: the sale was not voided as a refund';
  end if;
  raise notice 'PASS: the payment is voided, with a reason that says it was a refund';

  if pg_temp.live_ledger(v_id) <> 0 then
    raise exception 'FAIL: the ledger still counts the refunded money';
  end if;
  if (select count(*) from public.project_payments where project_id = v_id) <> 1
     or (select count(*) from public.sales where id = v_sale) <> 1 then
    raise exception 'FAIL: a refund removed the payment record instead of voiding it';
  end if;
  raise notice 'PASS: the ledger stops counting it, and the records stay';
end;
$$;

-- ---- The owner keeps the money -------------------------------------------
do $$
declare
  v_id uuid := (select id from t_ids where name = 'keep');
  v_sale uuid := (select sale_id from t_ids where name = 'keep');
  r record;
begin
  raise notice '--- project deletion refund: keeping the money ---';
  select * into r from public.delete_project(v_id, 'Test entry', false);
  if r.outcome <> 'deleted' or r.refunded_centavos <> 0 then
    raise exception 'FAIL: keeping the money refunded something';
  end if;
  if (select voided_at from public.sales where id = v_sale) is not null
     or pg_temp.live_ledger(v_id) <> 40000 then
    raise exception 'FAIL: keeping the money changed Sales or the ledger';
  end if;
  raise notice 'PASS: without a refund the payment stays live in Sales and the ledger';

end;
$$;

-- Leaving the choice out means keep the money: a caller that never heard of
-- refunds must not void anybody's payment by accident.
do $$
declare
  v_id uuid := (select id from t_ids where name = 'asked');
begin
  perform public.delete_project(v_id, 'Duplicate entry');
  if (select deleted_at from public.projects where id = v_id) is null then
    raise exception 'FAIL: the two-argument call did not delete';
  end if;
  if (select voided_at from public.sales where id = (select sale_id from t_ids where name = 'asked')) is not null then
    raise exception 'FAIL: leaving the choice out refunded the payment';
  end if;
  raise notice 'PASS: leaving the choice out means keep the money';
end;
$$;

-- ---- Refunding nothing is refused ----------------------------------------
do $$
declare
  v_id uuid := (select id from t_ids where name = 'nothing');
begin
  raise notice '--- project deletion refund: nothing to refund ---';
  -- The one payment is voided first (a refund by hand), so nothing is live.
  perform public.void_sale((select sale_id from t_ids where name = 'nothing'), 'Handed back by hand');

  begin
    perform public.delete_project(v_id, 'Mistake', true);
    raise exception 'FAIL: a refund of nothing was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: there is nothing to refund, so a refund is refused';
  end;

  perform public.delete_project(v_id, 'Mistake', false);
  if (select deleted_at from public.projects where id = v_id) is null then
    raise exception 'FAIL: a project with nothing paid could not simply be deleted';
  end if;
  raise notice 'PASS: with nothing paid the project just deletes';
end;
$$;

-- ---- An admin asks; nothing moves ----------------------------------------
-- 'asked' is gone; use 'rejected' and 'voided_first' for the admin's path, and
-- make one more project for the approve case.
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  r record;
begin
  select * into r from public.create_project(
    date '2026-10-02', 'printshoppe', null, 'Customer approve', null, 'Tarpaulin approve',
    600000, date '2026-10-20', 'tarpaulin',
    'down', 100000, 'cash', null, 100000, 0,
    '{"type":"tarpaulin","values":{"widthFeet":3,"heightFeet":5,"quantity":1}}'::jsonb);
  insert into t_ids values ('approve', r.project_id, r.sale_id);
end;
$$;

set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_id uuid := (select id from t_ids where name = 'approve');
  v_sale uuid := (select sale_id from t_ids where name = 'approve');
  r record;
begin
  raise notice '--- project deletion refund: an admin asks ---';

  select * into r from public.delete_project(v_id, 'Wrong customer, refund them', true);
  if r.outcome <> 'requested' or r.refunded_centavos <> 0 then
    raise exception 'FAIL: an admin got % with % refunded', r.outcome, r.refunded_centavos;
  end if;
  raise notice 'PASS: an admin asking for a refund gets a request and no refund';

  if (select voided_at from public.sales where id = v_sale) is not null
     or (select deleted_at from public.projects where id = v_id) is not null then
    raise exception 'FAIL: a request voided the sale or deleted the project';
  end if;
  if not (select refund_requested from public.project_deletion_requests where id = r.request_id) then
    raise exception 'FAIL: the request did not remember the refund';
  end if;
  raise notice 'PASS: nothing moves, and the request remembers the choice';

  begin
    perform public.refund_project_payments(v_id, 'by hand');
    raise exception 'FAIL: an admin called the refund function directly';
  exception when insufficient_privilege then
    raise notice 'PASS: the refund function cannot be called by a signed-in person';
  end;

  -- The customer comes back and pays more while the request waits.
  perform public.record_project_balance(v_id, date '2026-10-03', 30000, 'cash', null, 30000, 0);
end;
$$;

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  if not exists (
    select 1 from public.app_notifications
    where user_id = '11111111-1111-1111-1111-111111111111'
      and message like '%refund of PHP 1,000.00 asked for%'
  ) then
    raise exception 'FAIL: the owner was not told a refund was asked for';
  end if;
  raise notice 'PASS: the owner is told a refund was asked for, and how much';
end;
$$;

-- ---- The owner approves: everything live is refunded ---------------------
do $$
declare
  v_id uuid := (select id from t_ids where name = 'approve');
  v_request uuid;
  v_live_before bigint := pg_temp.live_ledger((select id from t_ids where name = 'approve'));
begin
  raise notice '--- project deletion refund: approval carries it out ---';
  if v_live_before <> 130000 then
    raise exception 'FAIL: expected 130000 live before approval, got %', v_live_before;
  end if;

  select id into v_request from public.project_deletion_requests
   where project_id = v_id and status = 'pending';
  perform public.decide_project_deletion(v_request, true, 'Refund them at the counter');

  if (select deleted_at from public.projects where id = v_id) is null then
    raise exception 'FAIL: approving did not delete';
  end if;
  if exists (
    select 1 from public.sales s join public.project_payments pp on pp.sale_id = s.id
    where pp.project_id = v_id and s.voided_at is null
  ) then
    raise exception 'FAIL: a payment was left live after an approved refund';
  end if;
  if pg_temp.live_ledger(v_id) <> 0 then
    raise exception 'FAIL: the ledger still counts money that was refunded';
  end if;
  raise notice 'PASS: approving refunds the down payment AND the balance paid since';
end;
$$;

set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  if not exists (
    select 1 from public.app_notifications
    where message like '%approved and PHP 1,300.00 was refunded%'
  ) then
    raise exception 'FAIL: the admin was not told how much was refunded';
  end if;
  raise notice 'PASS: the admin is told what was refunded';
end;
$$;

-- ---- Rejected: no refund, project untouched ------------------------------
do $$
declare
  r record;
begin
  select * into r from public.delete_project(
    (select id from t_ids where name = 'rejected'), 'Ask for a refund', true);
end;
$$;
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_id uuid := (select id from t_ids where name = 'rejected');
  v_sale uuid := (select sale_id from t_ids where name = 'rejected');
begin
  raise notice '--- project deletion refund: rejection ---';
  perform public.decide_project_deletion(
    (select id from public.project_deletion_requests where project_id = v_id and status = 'pending'),
    false, 'No refund - keep the job');

  if (select voided_at from public.sales where id = v_sale) is not null
     or (select deleted_at from public.projects where id = v_id) is not null
     or pg_temp.live_ledger(v_id) <> 70000 then
    raise exception 'FAIL: a rejected request voided money or deleted the project';
  end if;
  raise notice 'PASS: a rejected request refunds nothing and leaves the project alone';
end;
$$;

-- ---- A payment voided before the owner decides is not refunded twice -----
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  perform public.delete_project(
    (select id from t_ids where name = 'voided_first'), 'Refund please', true);
end;
$$;
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_id uuid := (select id from t_ids where name = 'voided_first');
begin
  raise notice '--- project deletion refund: voided in between ---';
  perform public.void_sale((select sale_id from t_ids where name = 'voided_first'), 'Handed back already');
  perform public.decide_project_deletion(
    (select id from public.project_deletion_requests where project_id = v_id and status = 'pending'),
    true, null);

  if (select deleted_at from public.projects where id = v_id) is null then
    raise exception 'FAIL: the approval failed because the payment was already voided';
  end if;
  if (select count(*) from public.sales s join public.project_payments pp on pp.sale_id = s.id
      where pp.project_id = v_id and s.void_reason like 'Refunded:%') <> 0 then
    raise exception 'FAIL: an already-voided payment was voided again';
  end if;
  raise notice 'PASS: a payment already handed back is not refunded a second time';
end;
$$;

-- ---- The books still agree ------------------------------------------------
do $$
begin
  raise notice '--- project deletion refund: the books ---';
  -- The invariant that matters: money is only ever counted once it is live. A
  -- refund voids the sale and its ledger entries together, so no live ledger
  -- entry may belong to a voided sale.
  if exists (
    select 1 from public.ledger_entries le
    join public.sales s on s.id = le.source_id and le.source_table = 'sales'
    where s.voided_at is not null and le.voided_at is null and le.direction = 'in'
  ) then
    raise exception 'FAIL: a live ledger entry belongs to a voided sale';
  end if;
  raise notice 'PASS: no live ledger entry belongs to a voided sale';
end;
$$;
