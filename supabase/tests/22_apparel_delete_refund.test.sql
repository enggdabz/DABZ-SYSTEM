-- Money and security tests for deleting an APPAREL project that has had money
-- taken, with the refund choice (0026).
--
-- The rules that matter most here:
--   * 0021 is untouched: the hard delete is still refused once a payment,
--     voided or not, exists. This is a second way out, not a loosening.
--   * The new way is a SOFT delete, OWNER ONLY - an admin and staff are refused.
--   * A refund is the ordinary void: the payment stays, marked, and its ledger
--     entries are voided with it. Keep leaves the payment live.
--   * Refunding nothing is refused. A released project and a project with a
--     bench marked are still "cancel it instead".
--   * Nothing is removed: the order, its payments and its ledger entries stay.
--
-- Accounts (from 03): 1111 owner, 2222 Maria (admin), 3333 Juan (staff),
-- 4444 Rosa (staff).

\set ON_ERROR_STOP on

set role authenticated;

set test.user_id = '11111111-1111-1111-1111-111111111111';
create temp table t_orders (name text primary key, id uuid);
grant all on t_orders to authenticated;

-- One helper to make a project with a payment, so each case reads on its own.
create or replace function pg_temp.make_project(p_name text, p_number text, p_amount bigint)
returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.apparel_orders (order_number, team_name, created_by)
  values (p_number, p_name, '11111111-1111-1111-1111-111111111111')
  returning id into v_id;

  insert into public.apparel_order_lines
    (order_id, name, uniform_type, unit_price_centavos, quantity, created_by)
  values (v_id, 'Jersey', 'jersey', 65000, 4, '11111111-1111-1111-1111-111111111111');

  if p_amount > 0 then
    perform public.record_apparel_payment(
      v_id, p_amount, current_date, 'cash_drawer', 'down_payment', null, null,
      jsonb_build_array(jsonb_build_object('category', 'sublimation_jerseys',
                                           'amount_centavos', p_amount)));
  end if;
  insert into t_orders values (p_name, v_id);
  return v_id;
end;
$$;
grant execute on function pg_temp.make_project(text, text, bigint) to authenticated;

create or replace function pg_temp.live_ledger(p_order uuid) returns bigint
language sql stable as $$
  select coalesce(sum(le.amount_centavos), 0)::bigint
  from public.ledger_entries le
  join public.apparel_payments ap on ap.id = le.source_id
  where ap.order_id = p_order and le.source_table = 'apparel_payments'
    and le.direction = 'in' and le.voided_at is null;
$$;
grant execute on function pg_temp.live_ledger(uuid) to authenticated;

do $$
begin
  perform pg_temp.make_project('refund me', 'A-269026-901', 100000);
  perform pg_temp.make_project('keep it', 'A-269026-902', 60000);
  perform pg_temp.make_project('admin tries', 'A-269026-903', 40000);
  perform pg_temp.make_project('nothing live', 'A-269026-904', 30000);
  perform pg_temp.make_project('released', 'A-269026-905', 20000);
  perform pg_temp.make_project('on the bench', 'A-269026-906', 10000);
  perform pg_temp.make_project('two payments', 'A-269026-907', 50000);
end;
$$;

-- ---- Structure -----------------------------------------------------------
do $$
begin
  raise notice '--- apparel delete refund: structure ---';

  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'apparel_orders'
        and column_name in ('deleted_at', 'deleted_by')) <> 2 then
    raise exception 'FAIL: apparel_orders has no soft delete columns';
  end if;
  raise notice 'PASS: apparel_orders carries deleted_at and deleted_by';

  -- 0021 is untouched: the policy that refuses a hard delete once money has
  -- moved is still there.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'apparel_orders' and cmd = 'DELETE'
  ) then
    raise exception 'FAIL: the 0021 delete policy has gone';
  end if;
  raise notice 'PASS: the 0021 delete policy is still there';

  -- The read policy is not narrowed: the collections feed joins this table.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'apparel_orders' and cmd = 'SELECT'
      and qual ilike '%deleted_at%'
  ) then
    raise exception 'FAIL: a deleted order is hidden from a read policy, which would drop payments from the feed';
  end if;
  raise notice 'PASS: deleted projects are not hidden from the feed''s join';
end;
$$;

-- ---- 0021 still refuses the hard delete ----------------------------------
do $$
declare
  v_id uuid := (select id from t_orders where name = 'refund me');
begin
  raise notice '--- apparel delete refund: the hard delete is still refused ---';
  delete from public.apparel_orders where id = v_id;
  if found then
    raise exception 'FAIL: a project with money on it was hard-deleted';
  end if;
  raise notice 'PASS: a project with a payment cannot be hard-deleted (0021)';
end;
$$;

-- ---- Only the owner ------------------------------------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_id uuid := (select id from t_orders where name = 'admin tries');
begin
  raise notice '--- apparel delete refund: who may ---';
  begin
    perform public.delete_apparel_project(v_id, 'Wrong team', true);
    raise exception 'FAIL: an admin deleted a project that has had money taken';
  exception when insufficient_privilege then
    raise notice 'PASS: an admin cannot delete a project that has had money taken';
  end;
  if (select deleted_at from public.apparel_orders where id = v_id) is not null
     or pg_temp.live_ledger(v_id) <> 40000 then
    raise exception 'FAIL: a refused call changed the project or the ledger';
  end if;
  raise notice 'PASS: the refusal leaves the project and its money alone';
end;
$$;

set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  begin
    perform public.delete_apparel_project((select id from t_orders where name = 'admin tries'), 'x', false);
    raise exception 'FAIL: staff deleted a project';
  exception when insufficient_privilege then
    raise notice 'PASS: staff cannot delete a project that has had money taken';
  end;
end;
$$;

-- ---- The owner refunds and deletes ---------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_id uuid := (select id from t_orders where name = 'refund me');
  r record;
begin
  raise notice '--- apparel delete refund: the owner refunds ---';

  begin
    perform public.delete_apparel_project(v_id, '   ', true);
    raise exception 'FAIL: a delete with no reason was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a reason is required';
  end;

  select * into r from public.delete_apparel_project(v_id, 'Customer cancelled', true);
  if r.refunded_centavos <> 100000 then
    raise exception 'FAIL: expected 100000 refunded, got %', r.refunded_centavos;
  end if;
  raise notice 'PASS: the refund is what was paid';

  if (select deleted_at from public.apparel_orders where id = v_id) is null then
    raise exception 'FAIL: the project was not deleted';
  end if;

  if exists (select 1 from public.apparel_payments where order_id = v_id and voided_at is null)
     or (select count(*) from public.apparel_payments where order_id = v_id) <> 1 then
    raise exception 'FAIL: the payment was not voided, or was removed';
  end if;
  if (select void_reason from public.apparel_payments where order_id = v_id) not like 'Refunded:%' then
    raise exception 'FAIL: the void does not say it was a refund';
  end if;
  if pg_temp.live_ledger(v_id) <> 0 then
    raise exception 'FAIL: the ledger still counts refunded money';
  end if;
  raise notice 'PASS: the payment is voided as a refund, the ledger stops counting it, the records stay';
end;
$$;

-- ---- The owner keeps the money -------------------------------------------
do $$
declare
  v_id uuid := (select id from t_orders where name = 'keep it');
  r record;
begin
  raise notice '--- apparel delete refund: keeping the money ---';
  select * into r from public.delete_apparel_project(v_id, 'Entered twice', false);
  if r.refunded_centavos <> 0
     or (select deleted_at from public.apparel_orders where id = v_id) is null
     or exists (select 1 from public.apparel_payments where order_id = v_id and voided_at is not null)
     or pg_temp.live_ledger(v_id) <> 60000 then
    raise exception 'FAIL: keeping the money changed the payment or the ledger';
  end if;
  raise notice 'PASS: without a refund the payment stays live and the ledger keeps it';

  -- Leaving the choice out means keep.
  perform public.delete_apparel_project((select id from t_orders where name = 'two payments'), 'Duplicate');
  if (select count(*) from public.apparel_payments
      where order_id = (select id from t_orders where name = 'two payments') and voided_at is not null) <> 0 then
    raise exception 'FAIL: leaving the choice out refunded the payment';
  end if;
  raise notice 'PASS: leaving the choice out means keep the money';
end;
$$;

-- ---- Refunding nothing ----------------------------------------------------
do $$
declare
  v_id uuid := (select id from t_orders where name = 'nothing live');
begin
  raise notice '--- apparel delete refund: nothing to refund ---';
  perform public.void_apparel_payment(
    (select id from public.apparel_payments where order_id = v_id), 'Handed back by hand');
  begin
    perform public.delete_apparel_project(v_id, 'Mistake', true);
    raise exception 'FAIL: a refund of nothing was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: nothing live to refund, so a refund is refused';
  end;
  perform public.delete_apparel_project(v_id, 'Mistake', false);
  if (select deleted_at from public.apparel_orders where id = v_id) is null then
    raise exception 'FAIL: a project whose payment was already handed back could not be deleted';
  end if;
  raise notice 'PASS: with nothing live, the project just deletes';
end;
$$;

-- ---- Still "cancel it instead" -------------------------------------------
do $$
declare
  v_released uuid := (select id from t_orders where name = 'released');
  v_bench uuid := (select id from t_orders where name = 'on the bench');
begin
  raise notice '--- apparel delete refund: released and marked projects ---';

  update public.apparel_orders set status = 'released' where id = v_released;
  begin
    perform public.delete_apparel_project(v_released, 'x', false);
    raise exception 'FAIL: a released project was deleted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a released project cannot be deleted';
  end;

  insert into public.apparel_production_steps (line_id, stage, created_by)
  values ((select id from public.apparel_order_lines where order_id = v_bench limit 1),
          'design', '11111111-1111-1111-1111-111111111111');
  begin
    perform public.delete_apparel_project(v_bench, 'x', false);
    raise exception 'FAIL: a project with a bench marked was deleted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a project with a bench marked cannot be deleted';
  end;
end;
$$;

-- ---- A deleted project is frozen -----------------------------------------
do $$
declare
  v_id uuid := (select id from t_orders where name = 'keep it');
  v_payment uuid;
begin
  raise notice '--- apparel delete refund: after the delete ---';

  begin
    perform public.record_apparel_payment(
      v_id, 1000, current_date, 'cash_drawer', 'balance', null, null,
      jsonb_build_array(jsonb_build_object('category', 'sublimation_jerseys', 'amount_centavos', 1000)));
    raise exception 'FAIL: a deleted project took a payment';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a deleted project takes no more payments';
  end;

  begin
    perform public.delete_apparel_project(v_id, 'again', false);
    raise exception 'FAIL: a deleted project was deleted again';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a deleted project cannot be deleted again';
  end;

  -- Tagging: only a deleted project's payments are marked.
  select id into v_payment from public.apparel_payments where order_id = v_id;
  if not exists (select 1 from public.deleted_apparel_payment_ids(array[v_payment]) x where x = v_payment) then
    raise exception 'FAIL: a deleted project''s payment is not marked';
  end if;
  if exists (
    select 1 from public.deleted_apparel_payment_ids(
      array[(select id from public.apparel_payments
              where order_id = (select id from t_orders where name = 'on the bench') limit 1)])
  ) then
    raise exception 'FAIL: a live project''s payment was marked deleted';
  end if;
  raise notice 'PASS: only a deleted project''s payments are marked';

  -- The books.
  if exists (
    select 1 from public.ledger_entries le
    join public.apparel_payments ap on ap.id = le.source_id and le.source_table = 'apparel_payments'
    where ap.voided_at is not null and le.voided_at is null and le.direction = 'in'
  ) then
    raise exception 'FAIL: a live ledger entry belongs to a voided apparel payment';
  end if;
  raise notice 'PASS: no live ledger entry belongs to a voided apparel payment';
end;
$$;
