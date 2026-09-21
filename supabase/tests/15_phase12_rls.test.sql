-- Security tests for Phase 12: the production report.
--
-- The rules that matter most here:
--   * The benches follow the job orders: whoever may open a job order may say
--     where its work has got to, and nobody else may see or touch it.
--   * A bench is marked once. Marking it twice is refused by the database
--     rather than left to pile up as rows a report would have to de-duplicate.
--   * There are exactly ten benches and the database knows which.
--   * The project's status is NOT STORED anywhere - it is worked out from
--     these rows, so there is no column that could disagree with them.

\set ON_ERROR_STOP on

set role authenticated;

-- ---- Structure -----------------------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  raise notice '--- phase 12: structure ---';

  -- Nothing is seeded. A shop's benches are marked by the people at them.
  if (select count(*) from public.apparel_production_steps) <> 0 then
    raise exception 'FAIL: a production mark was invented';
  end if;
  raise notice 'PASS: no production mark was invented';

  if not exists (
    select 1 from pg_tables
    where schemaname = 'public'
      and tablename = 'apparel_production_steps'
      and rowsecurity
  ) then
    raise exception 'FAIL: row level security is not on apparel_production_steps';
  end if;
  raise notice 'PASS: row level security is on the production marks';

  /*
    The status of a project is a SUM of its items, worked out every time the
    screen is opened. A column holding it would be a second answer to the same
    question, and the two would drift - the same reason there is no stored
    order total and no stored stock level. This fails if one ever appears.
  */
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('apparel_orders', 'apparel_order_lines')
      and (
        column_name like '%production_stage%'
        or column_name like '%production_status%'
        or column_name like '%bench%'
      )
  ) then
    raise exception 'FAIL: a production status was stored on the order - it is worked out, not kept';
  end if;
  raise notice 'PASS: no production status is stored on an order or an item';
end;
$$;

-- ---- A project to work on ------------------------------------------------
-- Its own order rather than one an earlier file left behind, so this test says
-- the same thing whatever order the suite is run in.
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_order_id uuid;
begin
  insert into public.apparel_orders (order_number, team_name, created_by)
  values ('A-269012-901', 'Phase 12 test team',
          '11111111-1111-1111-1111-111111111111')
  returning id into v_order_id;

  insert into public.apparel_order_lines (order_id, name, unit_price_centavos, quantity, created_by)
  values (v_order_id, 'Test jersey', 65000, 3,
          '11111111-1111-1111-1111-111111111111');

  raise notice 'PASS: a project with one item exists to mark';
end;
$$;

-- ---- Marking a bench -----------------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_line_id uuid;
begin
  raise notice '--- phase 12: marking a bench ---';

  select l.id into v_line_id
  from public.apparel_order_lines l
  join public.apparel_orders o on o.id = l.order_id
  where o.order_number = 'A-269012-901';

  insert into public.apparel_production_steps (line_id, stage, created_by)
  values (v_line_id, 'design', '11111111-1111-1111-1111-111111111111');

  if (select count(*) from public.apparel_production_steps where line_id = v_line_id) <> 1 then
    raise exception 'FAIL: the mark did not land';
  end if;
  raise notice 'PASS: an owner marks a bench';

  -- Twice is refused. Two rows for one bench is two answers to "is the design
  -- done?", and a report would have to guess which to believe.
  begin
    insert into public.apparel_production_steps (line_id, stage, created_by)
    values (v_line_id, 'design', '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: the same bench was marked twice';
  exception when unique_violation then
    raise notice 'PASS: a bench can only be marked once per item';
  end;

  -- Ten benches, and the database knows which. An eleventh, however it was
  -- spelled, would put an item in a stage no screen can show.
  begin
    insert into public.apparel_production_steps (line_id, stage, created_by)
    values (v_line_id, 'embroidery', '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: a bench that does not exist was accepted';
  exception when check_violation then
    raise notice 'PASS: only the ten benches are accepted';
  end;

  /*
    Every one of the ten is accepted, spelled exactly as the app spells them.
    A bench the app knows and the database refuses would fail at the counter,
    on a Saturday, with the work already done.
  */
  insert into public.apparel_production_steps (line_id, stage, created_by)
  select v_line_id, stage, '11111111-1111-1111-1111-111111111111'
  from unnest(array[
    'colour_test', 'pattern', 'print', 'heat_press', 'fabric_cutting',
    'sewing', 'quality_check', 'packaging', 'ready'
  ]) as stage;

  if (select count(*) from public.apparel_production_steps where line_id = v_line_id) <> 10 then
    raise exception 'FAIL: the database does not accept all ten benches';
  end if;
  raise notice 'PASS: all ten benches are accepted, spelled as the app spells them';

  -- Back to one, so what follows starts from a known place.
  delete from public.apparel_production_steps
  where line_id = v_line_id and stage <> 'design';
end;
$$;

-- ---- Whoever may open a job order may mark it ----------------------------
-- Juan was given apparel_job_orders by 08.
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_line_id uuid;
begin
  raise notice '--- phase 12: the apparel permission ---';

  select l.id into v_line_id
  from public.apparel_order_lines l
  join public.apparel_orders o on o.id = l.order_id
  where o.order_number = 'A-269012-901';

  if (select count(*) from public.apparel_production_steps where line_id = v_line_id) <> 1 then
    raise exception 'FAIL: a staff member with the apparel permission cannot read the benches';
  end if;
  raise notice 'PASS: the apparel permission reads the benches';

  insert into public.apparel_production_steps (line_id, stage, created_by)
  values (v_line_id, 'colour_test', '33333333-3333-3333-3333-333333333333');
  raise notice 'PASS: the apparel permission marks a bench';

  -- Un-marking is a delete, and it is the person at the bench who does it: a
  -- tick made by mistake is a claim that has to stop being made. The history
  -- is kept in the audit log, which nobody can edit.
  delete from public.apparel_production_steps
  where line_id = v_line_id and stage = 'colour_test';

  if (select count(*) from public.apparel_production_steps where line_id = v_line_id) <> 1 then
    raise exception 'FAIL: clearing a mark did not work';
  end if;
  raise notice 'PASS: the apparel permission clears a mark it made';
end;
$$;

-- ---- Everybody else sees nothing -----------------------------------------
-- Rosa has record_expenses and not apparel_job_orders. Stated rather than
-- assumed: a later phase granting it would make this test pass for the wrong
-- reason and quietly stop proving anything.
set test.user_id = '11111111-1111-1111-1111-111111111111';
delete from public.user_permissions
where user_id = '44444444-4444-4444-4444-444444444444'
  and permission = 'apparel_job_orders';

do $$
declare
  v_line_id uuid;
begin
  raise notice '--- phase 12: without the apparel permission ---';

  /*
    The item's id is picked up as the owner and then kept, because Rosa cannot
    read the job order either. Handing her the real id is the point: a refusal
    that only happens because she could not find the row would prove nothing
    about the policy.
  */
  set local test.user_id = '11111111-1111-1111-1111-111111111111';
  select l.id into v_line_id
  from public.apparel_order_lines l
  join public.apparel_orders o on o.id = l.order_id
  where o.order_number = 'A-269012-901';

  set local test.user_id = '44444444-4444-4444-4444-444444444444';

  if (select count(*) from public.apparel_production_steps) <> 0 then
    raise exception 'FAIL: a staff member without the apparel permission read the benches';
  end if;
  raise notice 'PASS: without the apparel permission, no bench is readable';

  begin
    insert into public.apparel_production_steps (line_id, stage, created_by)
    values (v_line_id, 'sewing', '44444444-4444-4444-4444-444444444444');
    raise exception 'FAIL: a staff member without the apparel permission marked a bench';
  exception when insufficient_privilege then
    raise notice 'PASS: without the apparel permission, no bench can be marked';
  end;

  -- And a mark somebody else made cannot be cleared either, which is the same
  -- policy read from the other side.
  delete from public.apparel_production_steps where line_id = v_line_id;
  if found then
    raise exception 'FAIL: a staff member without the apparel permission cleared a mark';
  end if;
  raise notice 'PASS: without the apparel permission, no mark can be cleared';
end;
$$;

-- ---- The marks belong to the item ----------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_line_id uuid;
  v_order_id uuid;
begin
  raise notice '--- phase 12: the marks belong to the item ---';

  select l.id, l.order_id into v_line_id, v_order_id
  from public.apparel_order_lines l
  join public.apparel_orders o on o.id = l.order_id
  where o.order_number = 'A-269012-901';

  delete from public.apparel_order_lines where id = v_line_id;

  if (select count(*) from public.apparel_production_steps where line_id = v_line_id) <> 0 then
    raise exception 'FAIL: the benches outlived the item they belonged to';
  end if;
  raise notice 'PASS: removing an item takes its benches with it';

  /*
    The order itself stays. There is no delete policy on apparel_orders - an
    order is cancelled with a reason, never erased, because the customer may
    be holding the job order sheet - so tidying up after this test would mean
    loosening the very rule the suite exists to hold.
  */
  delete from public.apparel_orders where id = v_order_id;
  if found then
    raise exception 'FAIL: a job order was deleted - it should only ever be cancelled';
  end if;
  raise notice 'PASS: the test job order cannot be deleted, only cancelled';
end;
$$;

do $$
begin
  raise notice 'ALL PHASE 12 TESTS PASSED';
end;
$$;
