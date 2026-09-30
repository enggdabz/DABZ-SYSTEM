-- Security and money tests for Phase 15: project sales.
--
-- The rules that matter most here:
--   * A project's payment is a real sale, written by complete_sale. Money
--     reaches the ledger by the same three routes as before - never a fourth.
--   * The balance is worked out from the live linked sales. Nothing that
--     could disagree with them is stored.
--   * No project table takes a direct write from anybody; every write is a
--     function that checks the caller itself.
--   * Only the CURRENT production step can be ticked, and the permission for
--     it belongs to the project's division.

\set ON_ERROR_STOP on

set role authenticated;

-- ---- Who can do what -----------------------------------------------------
-- Reset the two staff accounts, so this file says the same thing whatever
-- order the suite runs in. Juan: counter only. Rosa: nothing.
set test.user_id = '11111111-1111-1111-1111-111111111111';
delete from public.user_permissions
 where user_id in ('33333333-3333-3333-3333-333333333333',
                   '44444444-4444-4444-4444-444444444444');
insert into public.user_permissions (user_id, permission) values
  ('33333333-3333-3333-3333-333333333333', 'add_sales');

-- ---- Structure -----------------------------------------------------------
do $$
begin
  raise notice '--- phase 15: structure ---';

  if (select count(*) from public.projects) <> 0 then
    raise exception 'FAIL: a project was invented';
  end if;
  raise notice 'PASS: no project was invented';

  if exists (
    select 1 from pg_tables
    where schemaname = 'public'
      and tablename in ('projects', 'project_payments', 'project_steps')
      and not rowsecurity
  ) then
    raise exception 'FAIL: row level security is off on a project table';
  end if;
  raise notice 'PASS: row level security is on for all three tables';

  -- Every write is a function. A write policy is a way round its checks.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('projects', 'project_payments', 'project_steps')
      and cmd <> 'SELECT'
  ) then
    raise exception 'FAIL: a project table has a write policy';
  end if;
  raise notice 'PASS: no project table has a write policy';

  -- Balance, paid and production stage are worked out, never kept.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('projects', 'project_payments')
      and (column_name like '%balance%' or column_name like '%paid%'
           or column_name like '%stage%' or column_name = 'amount_centavos')
  ) then
    raise exception 'FAIL: a figure that is worked out is stored on a project';
  end if;
  raise notice 'PASS: balance, paid and stage are not stored';

  if public.project_steps_for('apparel') <> array[
      'design', 'pattern', 'print', 'heat_press', 'tabas', 'sewing',
      'quality_check', 'packaging', 'ready_to_ship'] then
    raise exception 'FAIL: the apparel steps are not the owner''s list';
  end if;
  raise notice 'PASS: the apparel steps are the owner''s nine';
end;
$$;

-- ---- Starting a project --------------------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  r record;
  v_ledger bigint;
begin
  raise notice '--- phase 15: starting a project ---';

  select * into r from public.create_project(
    date '2026-09-30', 'printshoppe', null, 'Tita Baby', 'Messenger: Tita Baby',
    'Tarpaulin 4x6 for the fiesta', 200000, date '2026-10-05', 'tarpaulin',
    'down', 50000, 'cash', null, 100000, 50000,
      '{"type":"tarpaulin","values":{"widthFeet":4,"heightFeet":6,"quantity":1}}'::jsonb);

  if r.project_number <> 'J-260930-001' then
    raise exception 'FAIL: unexpected project number %', r.project_number;
  end if;
  raise notice 'PASS: staff with add_sales start a project (%)', r.project_number;

  -- Only what was paid today is a sale.
  if (select total_centavos from public.sales where id = r.sale_id) <> 50000 then
    raise exception 'FAIL: the sale is not the amount paid today';
  end if;
  select coalesce(sum(amount_centavos), 0) into v_ledger
  from public.ledger_entries
  where source_table = 'sales' and source_id = r.sale_id and direction = 'in';
  -- Staff cannot read the ledger, so ask as the owner below instead.
  raise notice 'PASS: the sale is exactly the amount paid today';

  if public.project_paid_centavos(r.project_id) <> 50000 then
    raise exception 'FAIL: paid is not what the sale says';
  end if;
  raise notice 'PASS: paid is worked out from the linked sale';
end;
$$;

-- The ledger, as the owner: the balance never reached it.
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  if (select coalesce(sum(le.amount_centavos), 0)
      from public.ledger_entries le
      join public.project_payments pp on pp.sale_id = le.source_id
      where le.source_table = 'sales' and le.direction = 'in'
        and le.voided_at is null) <> 50000 then
    raise exception 'FAIL: the ledger holds more than was paid today';
  end if;
  if not exists (
    select 1 from public.ledger_entries le
    join public.project_payments pp on pp.sale_id = le.source_id
    where le.tag = 'printshoppe' and le.category = 'tarpaulin'
  ) then
    raise exception 'FAIL: the money is not filed under the project''s division and category';
  end if;
  raise notice 'PASS: the ledger holds only what was paid, under the right division and category';
end;
$$;

-- ---- Refusals on the way in ---------------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  n int := 0;
begin
  raise notice '--- phase 15: refusals ---';

  -- A helper would hide the differences, so each case is spelled out.
  begin
    perform public.create_project(date '2026-09-30', 'apparel', null, 'X', null, 'Jerseys',
      100000, null, 'jackets', 'down', 30000, 'cash', null, 30000, 0,
      '{"type":"apparel","values":{"uniformKind":"jacket","pieces":10},"sizes":{"M":10}}'::jsonb);
    raise exception 'FAIL: a down payment with no due date was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a down payment needs a due date';
  end;

  begin
    perform public.create_project(date '2026-09-30', 'apparel', null, 'X', null, 'Jerseys',
      100000, date '2026-10-10', 'jackets', 'full', 30000, 'cash', null, 30000, 0,
      '{"type":"apparel","values":{"uniformKind":"jacket","pieces":10},"sizes":{"M":10}}'::jsonb);
    raise exception 'FAIL: a part payment was accepted as full';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a full payment has to be the whole price';
  end;

  begin
    perform public.create_project(date '2026-09-30', 'apparel', null, 'X', null, 'Jerseys',
      100000, date '2026-10-10', 'jackets', 'down', 100000, 'cash', null, 100000, 0,
      '{"type":"apparel","values":{"uniformKind":"jacket","pieces":10},"sizes":{"M":10}}'::jsonb);
    raise exception 'FAIL: the whole price was accepted as a down payment';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: paying everything is not a down payment';
  end;

  begin
    perform public.create_project(date '2026-09-30', 'apparel', null, 'X', null, 'Jerseys',
      100000, date '2026-10-10', 'jackets', 'down', 0, 'cash', null, 0, 0,
      '{"type":"apparel","values":{"uniformKind":"jacket","pieces":10},"sizes":{"M":10}}'::jsonb);
    raise exception 'FAIL: a project with nothing paid was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a payment needs an amount';
  end;

  begin
    perform public.create_project(date '2026-09-30', 'dabztech', null, 'X', null, 'Laptop',
      100000, date '2026-10-10', 'tarpaulin', 'down', 30000, 'cash', null, 30000, 0,
      '{"type":"repair","values":{"deviceType":"laptop","brandModel":"Lenovo","problem":"No power"}}'::jsonb);
    raise exception 'FAIL: a repair was filed under a printing category';
  exception when check_violation then
    raise notice 'PASS: the category has to fit the division';
  end;

  begin
    perform public.create_project(date '2026-09-30', 'apparel', null, '  ', null, 'Jerseys',
      100000, date '2026-10-10', 'jackets', 'down', 30000, 'cash', null, 30000, 0,
      '{"type":"apparel","values":{"uniformKind":"jacket","pieces":10},"sizes":{"M":10}}'::jsonb);
    raise exception 'FAIL: a project with no customer was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a project needs a customer';
  end;

  -- None of those left anything behind, not even a half-made project.
  select count(*) into n from public.projects;
  if n <> 1 then
    raise exception 'FAIL: a refused project left a row behind (%)', n;
  end if;
  raise notice 'PASS: a refusal leaves nothing behind';
end;
$$;

-- ---- Paying the balance --------------------------------------------------
do $$
declare
  v_id uuid;
  r record;
begin
  raise notice '--- phase 15: the balance ---';
  select id into v_id from public.projects where project_number = 'J-260930-001';

  begin
    perform public.record_project_balance(v_id, date '2026-10-04', 150001, 'cash', null, 150001, 0);
    raise exception 'FAIL: more than the balance was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: more than the balance is refused';
  end;

  -- A part payment is allowed and leaves the rest owing.
  select * into r from public.record_project_balance(v_id, date '2026-10-04', 50000, 'gcash', 'GC123', null, null);
  if r.balance_centavos <> 100000 then
    raise exception 'FAIL: balance after a part payment is %', r.balance_centavos;
  end if;
  raise notice 'PASS: a part payment leaves the rest owing';

  select * into r from public.record_project_balance(v_id, date '2026-10-04', 100000, 'cash', null, 100000, 0);
  if r.balance_centavos <> 0 then
    raise exception 'FAIL: the balance is not cleared';
  end if;
  if public.project_paid_centavos(v_id) <> 200000 then
    raise exception 'FAIL: paid does not equal the total';
  end if;
  raise notice 'PASS: paying the balance clears it';

  -- It is a NEW sale for that day, in the Counter's own list.
  if (select sale_date from public.sales where id = r.sale_id) <> date '2026-10-04' then
    raise exception 'FAIL: the balance sale is not dated the day it was paid';
  end if;
  if not exists (select 1 from public.sale_lines
                 where sale_id = r.sale_id and name = 'Project J-260930-001 - Balance') then
    raise exception 'FAIL: the balance sale does not name its project';
  end if;
  raise notice 'PASS: the balance is a new sale for the day it was paid';

  begin
    perform public.record_project_balance(v_id, date '2026-10-04', 100, 'cash', null, 100, 0);
    raise exception 'FAIL: a fully paid project took another payment';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a fully paid project takes no more';
  end;
end;
$$;

-- Voiding a payment puts the balance back, without anybody touching the project.
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_id uuid;
  v_sale uuid;
begin
  raise notice '--- phase 15: voiding ---';
  select id into v_id from public.projects where project_number = 'J-260930-001';
  -- The 1,000.00 balance payment (both balance sales share a transaction, so
  -- created_at cannot tell them apart).
  select pp.sale_id into v_sale
  from public.project_payments pp join public.sales s on s.id = pp.sale_id
  where pp.project_id = v_id and pp.kind = 'balance' and s.total_centavos = 100000;

  perform public.void_sale(v_sale, 'Customer took the money back');

  if public.project_paid_centavos(v_id) <> 100000 then
    raise exception 'FAIL: a voided payment still counts as paid';
  end if;
  raise notice 'PASS: voiding a payment raises the balance again';

  -- Feed and ledger agree: the ledger holds what the live sales say.
  if (select coalesce(sum(le.amount_centavos), 0)
      from public.ledger_entries le
      join public.project_payments pp on pp.sale_id = le.source_id
      where le.source_table = 'sales' and le.direction = 'in'
        and le.voided_at is null) <> 100000 then
    raise exception 'FAIL: the ledger and the project disagree about what was paid';
  end if;
  raise notice 'PASS: the ledger and the project agree about what was paid';
end;
$$;

-- ---- Nobody writes a project table directly -----------------------------
do $$
declare
  n int;
begin
  raise notice '--- phase 15: direct writes ---';
  begin
    insert into public.projects (project_number, project_date, division, customer_name,
      description, total_centavos, income_category)
    values ('J-HAND-001', date '2026-09-30', 'apparel', 'X', 'Y', 100, 'jackets');
    raise exception 'FAIL: the owner inserted a project by hand';
  exception when insufficient_privilege then
    raise notice 'PASS: even the owner cannot insert a project by hand';
  end;

  update public.projects set total_centavos = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a project was edited directly'; end if;
  delete from public.project_payments;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a payment link was deleted directly'; end if;
  delete from public.projects;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a project was deleted directly'; end if;
  raise notice 'PASS: no project or payment can be edited or deleted directly';
end;
$$;

-- ---- Who can see and start projects -------------------------------------
set test.user_id = '44444444-4444-4444-4444-444444444444';
do $$
begin
  raise notice '--- phase 15: without add_sales ---';
  if (select count(*) from public.projects) <> 0
     or (select count(*) from public.project_payments) <> 0
     or (select count(*) from public.project_steps) <> 0 then
    raise exception 'FAIL: somebody without add_sales can read a project';
  end if;
  raise notice 'PASS: without add_sales, no project is visible';

  begin
    perform public.create_project(date '2026-09-30', 'apparel', null, 'X', null, 'Jerseys',
      100000, date '2026-10-10', 'jackets', 'down', 30000, 'cash', null, 30000, 0,
      '{"type":"apparel","values":{"uniformKind":"jacket","pieces":10},"sizes":{"M":10}}'::jsonb);
    raise exception 'FAIL: somebody without add_sales started a project';
  exception when insufficient_privilege then
    raise notice 'PASS: without add_sales, no project can be started';
  end;
end;
$$;

-- ---- Production ----------------------------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_apparel uuid;
  v_print uuid;
  r record;
begin
  raise notice '--- phase 15: production ---';

  select project_id into v_apparel from public.create_project(
    date '2026-09-30', 'apparel', null, 'Team Falcons', null, '15 jerseys',
    900000, date '2026-10-12', 'sublimation_jerseys', 'down', 300000, 'cash', null, 300000, 0,
      '{"type":"apparel","values":{"uniformKind":"jacket","pieces":10},"sizes":{"M":10}}'::jsonb);
  select project_id into v_print from public.create_project(
    date '2026-09-30', 'printshoppe', null, 'Mug Lady', null, '20 mugs',
    100000, null, 'mugs_souvenirs', 'full', 100000, 'cash', null, 100000, 0,
      '{"type":"printing","values":{"item":"mugs_souvenirs","quantity":20,"specs":"Full colour"}}'::jsonb);

  -- Juan has the counter but not the apparel permission.
  begin
    perform public.mark_project_step(v_apparel, 'design');
    raise exception 'FAIL: an apparel step was ticked without the apparel permission';
  exception when insufficient_privilege then
    raise notice 'PASS: an apparel step needs the apparel permission';
  end;

  -- Printing needs only the counter.
  perform public.mark_project_step(v_print, 'design');
  raise notice 'PASS: a printing step needs only the counter';

  begin
    perform public.mark_project_step(v_print, 'finishing');
    raise exception 'FAIL: a step was skipped';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: only the current step can be ticked';
  end;

  begin
    perform public.mark_project_step(v_print, 'sewing');
    raise exception 'FAIL: another division''s step was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a step from another division is refused';
  end;

  -- Not finished, so not released.
  begin
    perform public.release_project(v_print);
    raise exception 'FAIL: an unfinished project was released';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a project cannot be released before its last step';
  end;

  perform public.mark_project_step(v_print, 'print');
  perform public.undo_project_step(v_print);
  if (select count(*) from public.project_steps where project_id = v_print) <> 1 then
    raise exception 'FAIL: undo did not remove exactly the latest step';
  end if;
  raise notice 'PASS: undo removes only the latest step';

  perform public.mark_project_step(v_print, 'print');
  perform public.mark_project_step(v_print, 'finishing');
  perform public.mark_project_step(v_print, 'ready_for_pickup');
  perform public.release_project(v_print);
  if (select status from public.projects where id = v_print) <> 'released' then
    raise exception 'FAIL: release did not stick';
  end if;
  raise notice 'PASS: a finished project is released';

  begin
    perform public.mark_project_step(v_print, 'design');
    raise exception 'FAIL: a released project took a step';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: a released project takes no more steps';
  end;

  -- Cancelling needs a reason.
  begin
    perform public.cancel_project(v_apparel, '  ');
    raise exception 'FAIL: a project was cancelled with no reason';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: cancelling needs a reason';
  end;
  perform public.cancel_project(v_apparel, 'Team folded');
  if (select status from public.projects where id = v_apparel) <> 'cancelled' then
    raise exception 'FAIL: cancel did not stick';
  end if;
  raise notice 'PASS: a project is cancelled with a reason, not deleted';
end;
$$;

-- With the apparel permission, the step goes through.
set test.user_id = '11111111-1111-1111-1111-111111111111';
insert into public.user_permissions (user_id, permission) values
  ('33333333-3333-3333-3333-333333333333', 'apparel_job_orders');
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_id uuid;
begin
  select project_id into v_id from public.create_project(
    date '2026-09-30', 'apparel', null, 'Team Eagles', null, '10 shirts',
    500000, date '2026-10-15', 'shirts', 'down', 100000, 'cash', null, 100000, 0,
      '{"type":"apparel","values":{"uniformKind":"jacket","pieces":10},"sizes":{"M":10}}'::jsonb);
  perform public.mark_project_step(v_id, 'design');
  perform public.mark_project_step(v_id, 'pattern');
  if (select count(*) from public.project_steps where project_id = v_id) <> 2 then
    raise exception 'FAIL: the steps did not land';
  end if;
  raise notice 'PASS: with the apparel permission, apparel steps are ticked in order';
end;
$$;

-- ---- The job's details, and the link from a sale to its project --------
-- (0024: the Counter's Project tab asks what the job IS, and a project
-- payment is marked as one on the sale itself.)
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  r record;
  n_before int;
  n_sales_before int;
  v_details jsonb := '{"type":"apparel","values":{"uniformKind":"sublimation_jersey","pieces":15},"sizes":{"S":5,"M":7,"L":3}}';
begin
  raise notice '--- phase 15: job details ---';

  -- The size breakdown has to add up to the pieces, checked by the database
  -- as well as the app.
  if public.project_details_problem(v_details, 'apparel', 'sublimation_jerseys') is not null then
    raise exception 'FAIL: a breakdown that adds up was refused';
  end if;
  raise notice 'PASS: sizes that add up to the pieces are accepted';

  if public.project_details_problem(
       '{"type":"apparel","values":{"pieces":15},"sizes":{"S":5,"M":7}}',
       'apparel', 'sublimation_jerseys') is null then
    raise exception 'FAIL: 12 sizes for 15 pieces was accepted';
  end if;
  if public.project_details_problem(
       '{"type":"apparel","values":{"pieces":15},"sizes":{"S":9,"M":7}}',
       'apparel', 'sublimation_jerseys') is null then
    raise exception 'FAIL: 16 sizes for 15 pieces was accepted';
  end if;
  if public.project_details_problem(
       '{"type":"apparel","values":{"pieces":15}}',
       'apparel', 'sublimation_jerseys') is null then
    raise exception 'FAIL: apparel with no size breakdown was accepted';
  end if;
  if public.project_details_problem(
       '{"type":"apparel","values":{"pieces":2},"sizes":{"S":-1,"M":3}}',
       'apparel', 'sublimation_jerseys') is null then
    raise exception 'FAIL: a negative size cancelled out a real one';
  end if;
  if public.project_details_problem(
       '{"type":"apparel","values":{"pieces":2},"sizes":{"S":"two"}}',
       'apparel', 'sublimation_jerseys') is null then
    raise exception 'FAIL: a size that is not a number was accepted';
  end if;
  raise notice 'PASS: too few, too many, missing, negative and non-numeric sizes are all refused';

  -- The type decides the division.
  if public.project_details_problem(v_details, 'printshoppe', 'stickers') is null then
    raise exception 'FAIL: apparel details were accepted on a printing project';
  end if;
  if public.project_details_problem(
       '{"type":"tarpaulin","values":{"widthFeet":3,"heightFeet":5,"quantity":1}}',
       'printshoppe', 'stickers') is null then
    raise exception 'FAIL: a tarpaulin was filed as stickers';
  end if;
  if public.project_details_problem('{"type":"repair","values":{}}', 'printshoppe', 'stickers') is null then
    raise exception 'FAIL: a repair was accepted on a printing project';
  end if;
  if public.project_details_problem(null, 'apparel', 'jackets') is null
     or public.project_details_problem('{"type":"ufo"}', 'apparel', 'jackets') is null then
    raise exception 'FAIL: missing or unknown details were accepted';
  end if;
  raise notice 'PASS: the type has to fit the division, and unknown details are refused';

  -- Through create_project: refused, and nothing is left behind.
  select count(*) into n_before from public.projects;
  select count(*) into n_sales_before from public.sales;
  begin
    perform public.create_project(date '2026-09-30', 'apparel', null, 'Coach Ben', null,
      '15 jerseys', 900000, date '2026-10-20', 'sublimation_jerseys', 'down', 300000,
      'cash', null, 300000, 0,
      '{"type":"apparel","values":{"uniformKind":"sublimation_jersey","pieces":15},"sizes":{"S":5,"M":7,"L":2}}');
    raise exception 'FAIL: a project whose sizes do not add up was created';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like 'The sizes add up to 14, but 15 pieces were ordered.' then
      raise exception 'FAIL: unexpected refusal: %', sqlerrm;
    end if;
  end;
  if (select count(*) from public.projects) <> n_before then
    raise exception 'FAIL: the refused project left a row behind';
  end if;
  if (select count(*) from public.sales) <> n_sales_before then
    raise exception 'FAIL: the refused project left a sale behind';
  end if;
  raise notice 'PASS: a project whose sizes do not add up is refused, with nothing left behind';

  begin
    perform public.create_project(date '2026-09-30', 'apparel', null, 'Coach Ben', null,
      '15 jerseys', 900000, date '2026-10-20', 'sublimation_jerseys', 'down', 300000,
      'cash', null, 300000, 0, null);
    raise exception 'FAIL: a project with no details was created';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS: a project cannot be created without its details';

  -- The happy path: stored as given, sale marked as a down payment.
  select * into r from public.create_project(date '2026-09-30', 'apparel', null, 'Coach Ben', null,
    'Sublimation jersey, 15 pcs, S:5 M:7 L:3', 900000, date '2026-10-20',
    'sublimation_jerseys', 'down', 300000, 'cash', null, 300000, 0, v_details);

  if (select details from public.projects where id = r.project_id) is distinct from v_details then
    raise exception 'FAIL: the details were not stored as sent';
  end if;
  raise notice 'PASS: the job details are stored with the project';

  if (select project_id from public.sales where id = r.sale_id) is distinct from r.project_id
     or (select payment_kind from public.sales where id = r.sale_id) <> 'downpayment' then
    raise exception 'FAIL: the sale is not marked as the down payment';
  end if;
  raise notice 'PASS: the sale is marked with its project and as a downpayment';

  -- A second payment: its own sale, marked as a balance, and the balance moves.
  perform public.record_project_balance(r.project_id, date '2026-10-01', 200000, 'gcash', 'GC9', null, null);
  if public.project_paid_centavos(r.project_id) <> 500000 then
    raise exception 'FAIL: paid is not 5,000.00 after a second payment';
  end if;
  if (select array_agg(s.payment_kind order by s.created_at, s.sale_number)
        from public.sales s where s.project_id = r.project_id)
     is distinct from array['downpayment', 'balance'] then
    raise exception 'FAIL: the payments are not marked downpayment then balance';
  end if;
  raise notice 'PASS: a second payment is its own sale, marked as a balance';

  begin
    perform public.record_project_balance(r.project_id, date '2026-10-01', 400001, 'cash', null, 500000, 0);
    raise exception 'FAIL: an overpayment was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS: an overpayment is refused';
end;
$$;

-- A regular sale carries no link, and the link agrees with project_payments.
do $$
declare
  v_sale uuid;
begin
  raise notice '--- phase 15: the sale link ---';

  select sale_id into v_sale from public.complete_sale(
    date '2026-10-02', null, 2500, 0, 'none', null, 2500, 'cash', null, 2500, 0,
    jsonb_build_array(jsonb_build_object('name', 'Photocopy', 'division', 'printshoppe',
      'quantity', 1, 'unit_price_centavos', 2500, 'line_total_centavos', 2500,
      'income_category', 'photocopy')),
    jsonb_build_array(jsonb_build_object('division', 'printshoppe', 'category', 'photocopy',
      'amount_centavos', 2500)));

  if (select project_id from public.sales where id = v_sale) is not null
     or (select payment_kind from public.sales where id = v_sale) is not null then
    raise exception 'FAIL: a regular sale was marked as a project payment';
  end if;
  raise notice 'PASS: a regular sale carries no project link';

  -- The two records of one fact must never disagree.
  if exists (
    select 1
    from public.project_payments pp
    join public.sales s on s.id = pp.sale_id
    where s.project_id is distinct from pp.project_id
       or s.payment_kind is distinct from case pp.kind when 'down' then 'downpayment' else pp.kind end
  ) then
    raise exception 'FAIL: a sale''s project link disagrees with project_payments';
  end if;
  if exists (
    select 1 from public.sales s
    where s.project_id is not null
      and not exists (select 1 from public.project_payments pp where pp.sale_id = s.id)
  ) then
    raise exception 'FAIL: a sale claims a project that has no payment row for it';
  end if;
  raise notice 'PASS: sales.project_id and project_payments agree, in both directions';

  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_project_link_pairs' and conrelid = 'public.sales'::regclass
  ) then
    raise exception 'FAIL: a sale can be half linked to a project';
  end if;
  raise notice 'PASS: a sale is linked to a project fully or not at all';
end;
$$;

-- Tidy the permissions this file added, so a later file starts from what it expects.
set test.user_id = '11111111-1111-1111-1111-111111111111';
delete from public.user_permissions
 where user_id = '33333333-3333-3333-3333-333333333333' and permission = 'apparel_job_orders';

do $$ begin raise notice 'ALL PROJECT TESTS PASSED'; end; $$;
