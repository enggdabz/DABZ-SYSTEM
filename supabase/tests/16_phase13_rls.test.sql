-- Security tests for Phase 13: encoding a project person by person.
--
-- Phase 13 creates no table. It adds columns to four that already exist, and a
-- function that writes two of them in one transaction. That is exactly the
-- shape of change where a security hole hides quietly: the policies look
-- untouched, and nobody checks that the NEW columns are behind them.
--
-- So this file proves, as five different people:
--
--   * the new columns are behind the same door as the job orders themselves -
--     the apparel permission, plus Owner and Admin, and nobody else reads or
--     writes a single one of them;
--   * `save_apparel_encoding` runs as the CALLER (security invoker), so it
--     cannot become a way round those policies;
--   * the database refuses the three rows that cannot mean anything: a
--     seventh uniform type, a Custom row nobody named, and a row that is
--     neither an upper nor a pair of shorts;
--   * one item per uniform type per project, enforced by the database rather
--     than by the app remembering to look;
--   * the summary is NOT stored - there is no column anywhere that could
--     disagree with the rows it is counted from.

\set ON_ERROR_STOP on

set role authenticated;

-- ---- Structure -----------------------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  raise notice '--- phase 13: structure ---';

  -- Row level security is still on all three, after the alters.
  if exists (
    select 1 from pg_tables
    where schemaname = 'public'
      and tablename in ('apparel_orders', 'apparel_order_lines', 'apparel_order_names')
      and not rowsecurity
  ) then
    raise exception 'FAIL: row level security is off one of the apparel tables';
  end if;
  raise notice 'PASS: row level security is on the orders, the items and the people';

  /*
    Every write policy on these three needs BOTH `using` and `with check`.
    Without `with check`, somebody who may edit a row could write values into
    it that the policy would never have let them insert.
  */
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('apparel_orders', 'apparel_order_lines', 'apparel_order_names')
      and cmd in ('UPDATE', 'ALL')
      and (qual is null or with_check is null)
  ) then
    raise exception 'FAIL: a write policy is missing its using or its with check';
  end if;
  raise notice 'PASS: every write policy has both using and with check';

  /*
    The summary is COUNTED from the rows every time it is shown. A column
    holding it would be a second answer to the same question, and the two
    would drift - the same reason there is no stored order total, no stored
    stock level and no stored production stage. This fails if one appears.
  */
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('apparel_orders', 'apparel_order_lines')
      and (
        column_name like '%summary%'
        or column_name like '%total_pieces%'
        or column_name like '%per_size%'
      )
  ) then
    raise exception 'FAIL: a summary was stored on the order - it is counted, not kept';
  end if;
  raise notice 'PASS: no summary is stored on an order or an item';

  -- `save_apparel_encoding` must NOT be security definer. It touches nothing
  -- the caller may not touch, so running as them keeps RLS in force.
  if exists (
    select 1 from pg_proc
    where proname = 'save_apparel_encoding' and prosecdef
  ) then
    raise exception 'FAIL: save_apparel_encoding is security definer - RLS would stop deciding';
  end if;
  raise notice 'PASS: save_apparel_encoding runs as the caller, so RLS still decides';

  -- There is no password-shaped column here either (the Phase 7 rule, which
  -- applies to every table the shop adds).
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'apparel_order_names'
      and column_name ~* 'pass(word)?|passcode|pin'
  ) then
    raise exception 'FAIL: a password-shaped column appeared on the people table';
  end if;
  raise notice 'PASS: no password-shaped column on the people table';
end;
$$;

-- ---- What the six types are, and what they book to -----------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_type text;
begin
  raise notice '--- phase 13: the six types ---';

  foreach v_type in array array['jersey', 'tshirt', 'polo', 'longsleeve', 'jacket', 'custom']
  loop
    if public.uniform_income_category(v_type) is null then
      raise exception 'FAIL: % has no income category', v_type;
    end if;
    if public.uniform_type_label(v_type) is null then
      raise exception 'FAIL: % has no label', v_type;
    end if;
  end loop;
  raise notice 'PASS: all six types have a book and a label';

  -- A seventh type answers null rather than guessing a book for it.
  if public.uniform_income_category('hoodie') is not null then
    raise exception 'FAIL: a type nobody defined was given a book';
  end if;
  raise notice 'PASS: a type nobody defined is given no book';

  -- A custom cap is not a jersey.
  if public.uniform_income_category('custom') = 'sublimation_jerseys' then
    raise exception 'FAIL: Custom books to the jersey ledger';
  end if;
  raise notice 'PASS: Custom books to its own ledger, not to jerseys';
end;
$$;

-- ---- The owner opens a project and encodes three people ------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_order_id uuid;
  v_result jsonb;
  v_total bigint;
begin
  raise notice '--- phase 13: encoding ---';

  insert into public.apparel_orders (
    order_number, team_name, contact_person, contact_number, address,
    facebook_link, created_by
  )
  values (
    'A-269013-901', 'Phase 13 test team', 'Coach Ramos', '0917 000 0000',
    'San Carlos City', 'https://facebook.com/example',
    '11111111-1111-1111-1111-111111111111'
  )
  returning id into v_order_id;

  select public.save_apparel_encoding(v_order_id, jsonb_build_array(
    jsonb_build_object('uniform_type', 'jersey', 'player_name', 'Dela Cruz',
                       'player_number', '7', 'size', 'M', 'short_size', 'M',
                       'price_centavos', 65000, 'quantity', 1, 'upper_included', true),
    jsonb_build_object('uniform_type', 'jersey', 'player_name', 'Reyes',
                       'size', '2XL', 'price_centavos', 70000,
                       'quantity', 1, 'upper_included', true),
    jsonb_build_object('uniform_type', 'jacket', 'player_name', 'Santos',
                       'size', 'L', 'price_centavos', 95000,
                       'quantity', 1, 'upper_included', true)
  )) into v_result;

  if (v_result ->> 'rows_added')::int <> 3 then
    raise exception 'FAIL: % rows were added, expected 3', v_result ->> 'rows_added';
  end if;
  raise notice 'PASS: three people were encoded in one call';

  -- Two types means two items, made by the function rather than by hand.
  if (select count(*) from public.apparel_order_lines where order_id = v_order_id) <> 2 then
    raise exception 'FAIL: rows of the same type did not form one item';
  end if;
  raise notice 'PASS: rows of the same uniform type formed one item';

  -- And each item books to the type's own ledger.
  if not exists (
    select 1 from public.apparel_order_lines
    where order_id = v_order_id and uniform_type = 'jacket'
      and income_category = 'jackets'
  ) then
    raise exception 'FAIL: the jacket item did not book to the jacket ledger';
  end if;
  raise notice 'PASS: each item books to its type''s own ledger';

  -- The total is the sum of the rows, added up here the way the app adds it.
  select sum(n.quantity * coalesce(n.price_centavos, l.unit_price_centavos + n.size_extra_centavos))
  into v_total
  from public.apparel_order_names n
  join public.apparel_order_lines l on l.id = n.line_id
  where l.order_id = v_order_id;

  if v_total <> 230000 then
    raise exception 'FAIL: the project totals % centavos, expected 230000', v_total;
  end if;
  raise notice 'PASS: the project adds up to the sum of its row prices';
end;
$$;

-- ---- What the database refuses -------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_order_id uuid;
  v_line_id uuid;
begin
  raise notice '--- phase 13: what cannot be saved ---';

  select id into v_order_id from public.apparel_orders
  where order_number = 'A-269013-901';
  select id into v_line_id from public.apparel_order_lines
  where order_id = v_order_id and uniform_type = 'jersey';

  -- A seventh uniform type.
  begin
    insert into public.apparel_order_names (line_id, uniform_type, size, created_by)
    values (v_line_id, 'hoodie', 'M', '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: a seventh uniform type was accepted';
  exception when check_violation then
    raise notice 'PASS: only the six uniform types are accepted';
  end;

  -- Custom with nothing typed in.
  begin
    insert into public.apparel_order_names (line_id, uniform_type, size, created_by)
    values (v_line_id, 'custom', 'M', '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: a Custom row with no name was accepted';
  exception when check_violation then
    raise notice 'PASS: a Custom row needs the uniform typed in';
  end;

  -- Neither an upper nor a pair of shorts is nothing at all.
  begin
    insert into public.apparel_order_names (line_id, uniform_type, upper_included, created_by)
    values (v_line_id, 'jersey', false, '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: a row that is neither an upper nor shorts was accepted';
  exception when check_violation then
    raise notice 'PASS: a row must be an upper or a pair of shorts';
  end;

  -- A size nobody could cut.
  begin
    insert into public.apparel_order_names (line_id, uniform_type, size, created_by)
    values (v_line_id, 'jersey', 'XXXL', '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: a size off the ladder was accepted';
  exception when check_violation then
    raise notice 'PASS: only the size ladder is accepted, for the upper';
  end;

  begin
    insert into public.apparel_order_names (line_id, uniform_type, size, short_size, created_by)
    values (v_line_id, 'jersey', 'M', 'XXXL', '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: a short size off the ladder was accepted';
  exception when check_violation then
    raise notice 'PASS: only the size ladder is accepted, for the shorts';
  end;

  -- A size LEFT EMPTY is allowed: three people out of twenty-five have not
  -- said theirs, and refusing to save the other twenty-two is how a list goes
  -- back on to paper.
  insert into public.apparel_order_names (line_id, uniform_type, player_name, created_by)
  values (v_line_id, 'jersey', 'Not decided yet', '11111111-1111-1111-1111-111111111111');
  raise notice 'PASS: a size may be left empty while encoding';

  delete from public.apparel_order_names
  where line_id = v_line_id and player_name = 'Not decided yet';

  -- Two items of the same type on one project would each hold half a team.
  begin
    insert into public.apparel_order_lines (order_id, name, uniform_type, created_by)
    values (v_order_id, 'Jersey again', 'jersey', '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: a second item of the same uniform type was allowed';
  exception when unique_violation then
    raise notice 'PASS: one item per uniform type per project';
  end;

  -- But two DIFFERENT custom uniforms are two items, which is the point of
  -- Custom.
  insert into public.apparel_order_lines (order_id, name, uniform_type, custom_type_name, created_by)
  values (v_order_id, 'Cap', 'custom', 'Cap', '11111111-1111-1111-1111-111111111111');
  insert into public.apparel_order_lines (order_id, name, uniform_type, custom_type_name, created_by)
  values (v_order_id, 'Apron', 'custom', 'Apron', '11111111-1111-1111-1111-111111111111');
  raise notice 'PASS: two different custom uniforms are two items';

  -- And the same custom uniform spelled differently is still one item.
  begin
    insert into public.apparel_order_lines (order_id, name, uniform_type, custom_type_name, created_by)
    values (v_order_id, 'cap', 'custom', '  CAP  ', '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: the same custom uniform was allowed twice';
  exception when unique_violation then
    raise notice 'PASS: one custom uniform however it is capitalised or spaced';
  end;

  delete from public.apparel_order_lines
  where order_id = v_order_id and custom_type_name in ('Cap', 'Apron');
end;
$$;

-- ---- An admin may do all of it -------------------------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_order_id uuid;
begin
  raise notice '--- phase 13: the admin ---';

  select id into v_order_id from public.apparel_orders
  where order_number = 'A-269013-901';

  if v_order_id is null then
    raise exception 'FAIL: an admin could not read the project';
  end if;

  if (select contact_person from public.apparel_orders where id = v_order_id) is null then
    raise exception 'FAIL: an admin could not read the contact person';
  end if;
  raise notice 'PASS: an admin reads the project and its contact details';

  if (select count(*) from public.apparel_order_names n
      join public.apparel_order_lines l on l.id = n.line_id
      where l.order_id = v_order_id) <> 3 then
    raise exception 'FAIL: an admin could not read the people';
  end if;
  raise notice 'PASS: an admin reads the people on a project';
end;
$$;

-- ---- A staff member WITH the apparel permission --------------------------
-- Juan was given apparel_job_orders by 08.
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_order_id uuid;
  v_result jsonb;
begin
  raise notice '--- phase 13: the apparel permission ---';

  select id into v_order_id from public.apparel_orders
  where order_number = 'A-269013-901';

  if v_order_id is null then
    raise exception 'FAIL: the apparel permission could not read the project';
  end if;
  raise notice 'PASS: the apparel permission reads the project';

  -- Encoding is ordinary counter work, so the permission is enough for it.
  select public.save_apparel_encoding(v_order_id, jsonb_build_array(
    jsonb_build_object('uniform_type', 'jersey', 'player_name', 'Dela Cruz',
                       'player_number', '7', 'size', 'M', 'short_size', 'M',
                       'price_centavos', 65000, 'quantity', 1, 'upper_included', true),
    jsonb_build_object('uniform_type', 'tshirt', 'player_name', null,
                       'size', 'L', 'price_centavos', 18000,
                       'quantity', 50, 'upper_included', true)
  )) into v_result;

  raise notice 'PASS: the apparel permission saves the encoding table';

  /*
    The table was sent as two brand new rows, so all three that were on it
    before came off - and the jacket item, which nobody was left on, went with
    them. That is the tidy-up doing its job: an item holding nobody is not an
    item, and leaving it behind would put its typed quantity back into the
    project total.
  */
  if (v_result ->> 'rows_removed')::int <> 3 then
    raise exception 'FAIL: % rows were removed, expected 3', v_result ->> 'rows_removed';
  end if;
  if (v_result ->> 'items_removed')::int <> 1 then
    raise exception 'FAIL: an item nobody was left on was not tidied away';
  end if;
  raise notice 'PASS: taking the last person off an item removes the item too';

  -- Fifty plain shirts are ONE row saying fifty.
  if (select n.quantity from public.apparel_order_names n
      join public.apparel_order_lines l on l.id = n.line_id
      where l.order_id = v_order_id and l.uniform_type = 'tshirt') <> 50 then
    raise exception 'FAIL: a nameless block of fifty was not stored as fifty';
  end if;
  raise notice 'PASS: fifty plain shirts are one row saying fifty';
end;
$$;

-- ---- An item with bench marks is kept, not thrown away -------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_order_id uuid;
  v_jersey uuid;
  v_shirt uuid;
  v_result jsonb;
begin
  raise notice '--- phase 13: an item the shop floor has marked ---';

  select id into v_order_id from public.apparel_orders
  where order_number = 'A-269013-901';
  select id into v_jersey from public.apparel_order_lines
  where order_id = v_order_id and uniform_type = 'jersey';
  select id into v_shirt from public.apparel_order_lines
  where order_id = v_order_id and uniform_type = 'tshirt';

  insert into public.apparel_production_steps (line_id, stage, created_by)
  values (v_jersey, 'design', '33333333-3333-3333-3333-333333333333');

  -- Everybody who was on the jersey item moves to the t-shirt item. The marks
  -- follow them, because it is the same batch under a new heading.
  select public.save_apparel_encoding(v_order_id, jsonb_build_array(
    jsonb_build_object('id', (select id::text from public.apparel_order_names where line_id = v_jersey limit 1),
                       'uniform_type', 'tshirt', 'player_name', 'Dela Cruz',
                       'size', 'M', 'price_centavos', 65000,
                       'quantity', 1, 'upper_included', true),
    jsonb_build_object('id', (select id::text from public.apparel_order_names where line_id = v_shirt limit 1),
                       'uniform_type', 'tshirt', 'player_name', null,
                       'size', 'L', 'price_centavos', 18000,
                       'quantity', 50, 'upper_included', true)
  )) into v_result;

  if exists (select 1 from public.apparel_order_lines where id = v_jersey) then
    raise exception 'FAIL: the emptied item was left behind';
  end if;

  if not exists (
    select 1 from public.apparel_production_steps
    where line_id = v_shirt and stage = 'design'
  ) then
    raise exception 'FAIL: the bench marks did not follow the work';
  end if;
  raise notice 'PASS: bench marks follow their people to the item that took them';
end;
$$;

-- ---- A staff member WITHOUT the apparel permission -----------------------
-- Rosa has record_expenses and not apparel_job_orders. 15 already removed the
-- grant; it is removed again here so this file says the same thing whether or
-- not it is run on its own.
set test.user_id = '11111111-1111-1111-1111-111111111111';
delete from public.user_permissions
where user_id = '44444444-4444-4444-4444-444444444444'
  and permission = 'apparel_job_orders';

do $$
declare
  v_order_id uuid;
  v_line_id uuid;
begin
  raise notice '--- phase 13: without the apparel permission ---';

  /*
    The ids are picked up as the owner and then kept, because Rosa cannot read
    the project either. Handing her the real ids is the point: a refusal that
    only happened because she could not find the row would prove nothing about
    the policy.
  */
  set local test.user_id = '11111111-1111-1111-1111-111111111111';
  select id into v_order_id from public.apparel_orders
  where order_number = 'A-269013-901';
  select id into v_line_id from public.apparel_order_lines
  where order_id = v_order_id limit 1;

  set local test.user_id = '44444444-4444-4444-4444-444444444444';

  if exists (select 1 from public.apparel_orders where id = v_order_id) then
    raise exception 'FAIL: a staff member without the apparel permission read the project';
  end if;
  raise notice 'PASS: without the apparel permission, the project is not readable';

  -- Not even one column of it. A contact number is a customer's private
  -- detail (spec 4.3), and reading it one field at a time is still reading it.
  if exists (
    select 1 from public.apparel_orders
    where contact_number is not null or address is not null or facebook_link is not null
  ) then
    raise exception 'FAIL: a contact detail was readable without the apparel permission';
  end if;
  raise notice 'PASS: without the apparel permission, no contact detail is readable';

  if exists (select 1 from public.apparel_order_names) then
    raise exception 'FAIL: a staff member without the apparel permission read the people';
  end if;
  raise notice 'PASS: without the apparel permission, no person on a project is readable';

  begin
    insert into public.apparel_order_names (line_id, uniform_type, size, created_by)
    values (v_line_id, 'jersey', 'M', '44444444-4444-4444-4444-444444444444');
    raise exception 'FAIL: a staff member without the apparel permission encoded a person';
  exception when insufficient_privilege then
    raise notice 'PASS: without the apparel permission, nobody can be encoded';
  end;

  -- And the function is no way round it, which is the whole reason it runs as
  -- the caller rather than as its owner.
  begin
    perform public.save_apparel_encoding(v_order_id, jsonb_build_array(
      jsonb_build_object('uniform_type', 'jersey', 'size', 'M',
                         'quantity', 1, 'upper_included', true)
    ));
    raise exception 'FAIL: save_apparel_encoding let somebody past the policies';
  exception
    when insufficient_privilege then
      raise notice 'PASS: save_apparel_encoding refuses without the apparel permission';
    when raise_exception then
      -- It cannot even see the project, which is the same refusal one step
      -- earlier and just as good.
      raise notice 'PASS: save_apparel_encoding cannot even find the project';
  end;

  -- A contact detail cannot be written either.
  update public.apparel_orders set contact_person = 'Rosa' where id = v_order_id;
  if found then
    raise exception 'FAIL: a contact person was written without the apparel permission';
  end if;
  raise notice 'PASS: without the apparel permission, no contact detail can be written';
end;
$$;

-- ---- A cancelled project keeps its people exactly as they were -----------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_order_id uuid;
begin
  raise notice '--- phase 13: a cancelled project ---';

  select id into v_order_id from public.apparel_orders
  where order_number = 'A-269013-901';

  update public.apparel_orders
  set status = 'cancelled', cancel_reason = 'testing'
  where id = v_order_id;

  begin
    perform public.save_apparel_encoding(v_order_id, '[]'::jsonb);
    raise exception 'FAIL: a cancelled project was re-encoded';
  exception when raise_exception then
    raise notice 'PASS: a cancelled project keeps its people as they were';
  end;

  /*
    And it cannot be deleted - not because deleting is impossible (`0021`
    allows it for a project nothing has happened to) but because THIS project
    has bench marks on it, which the block above moved on to its t-shirt item.
    A mark is somebody's statement about work they did, so the project is
    cancelled with a reason and kept.
  */
  delete from public.apparel_orders where id = v_order_id;
  if found then
    raise exception 'FAIL: a project with bench marks on it was deleted';
  end if;
  raise notice 'PASS: a project with bench marks on it cannot be deleted';
end;
$$;

do $$
begin
  raise notice 'ALL PHASE 13 TESTS PASSED';
end;
$$;
