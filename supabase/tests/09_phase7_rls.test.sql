-- Security and money tests for Phase 7: DabzTech repair tickets (spec 9).
--
-- The rule that matters most here is spec 9.3: the shop does not keep laptop
-- passwords. The first test asserts that NO COLUMN in this phase's tables could
-- hold one - not by name, not "temporarily", not in a field called something
-- else. It is the kind of rule that is only kept if something checks it.

\set ON_ERROR_STOP on

set role authenticated;

-- ---- No password, anywhere ------------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_offender text;
begin
  raise notice '--- phase 7: no passwords (spec 9.3) ---';

  select table_name || '.' || column_name into v_offender
  from information_schema.columns
  where table_schema = 'public'
    and table_name like 'repair%'
    and (column_name ilike '%password%'
         or column_name ilike '%passcode%'
         or column_name ilike '%pin%'
         or column_name ilike '%credential%')
  limit 1;

  if v_offender is not null then
    raise exception 'FAIL: a repair table has a password-shaped column: %', v_offender;
  end if;
  raise notice 'PASS: no repair table can hold a customer password';

  -- What IS recorded is how to get in, and only those three answers.
  begin
    insert into public.repair_tickets (
      ticket_number, customer_name, unit_kind, problem, unlock_method
    )
    values ('T-BAD-001', 'Nobody', 'laptop', 'Will not start', 'password_is_1234');
    raise exception 'FAIL: an unlock method outside the fixed list was allowed';
  exception when check_violation then
    raise notice 'PASS: the unlock method is one of three answers, never free text';
  end;
end;
$$;

-- ---- Structure -----------------------------------------------------------
do $$
begin
  raise notice '--- phase 7: structure ---';

  if (select count(*) from public.repair_services) <> 12 then
    raise exception 'FAIL: expected the 12 fixture services';
  end if;
  raise notice 'PASS: everyone signed in reads the repair price list';

  if (select count(price_centavos) from public.repair_services) <> 0 then
    raise exception 'FAIL: a price appeared on a repair service that has none';
  end if;
  raise notice 'PASS: a service with no price keeps having no price';

  -- Exactly one service is THE checking fee - the charge that applies even
  -- when the customer says no. The app asks for it by that flag, so two would
  -- make the answer arbitrary; a partial unique index (0012) enforces it.
  if (select count(*) from public.repair_services where is_checking_fee) <> 1 then
    raise exception 'FAIL: expected exactly one checking fee';
  end if;
  begin
    insert into public.repair_services (name, unit_kind, income_category, is_checking_fee)
    values ('A second checking fee', 'any', 'checking_fee', true);
    raise exception 'FAIL: a second checking fee was allowed';
  exception when unique_violation then
    raise notice 'PASS: only one service can be the checking fee';
  end;

  -- Laptop and desktop cleaning exist separately, so the owner can price them
  -- the same or differently. That is open decision 17.11, left open.
  if (select count(*) from public.repair_services where name = 'Cleaning & repaste') <> 2 then
    raise exception 'FAIL: laptop and desktop services were merged into one price';
  end if;
  raise notice 'PASS: laptop and desktop can be priced separately, or the same';

  -- DabzTech takes three kinds of machine and no others (spec 1.1).
  begin
    insert into public.repair_tickets (ticket_number, customer_name, unit_kind, problem)
    values ('T-BAD-002', 'Nobody', 'refrigerator', 'Not cold');
    raise exception 'FAIL: a unit DabzTech does not repair was accepted';
  exception when check_violation then
    raise notice 'PASS: only Epson printers, laptops and desktops are accepted';
  end;
end;
$$;

-- ---- Permission ----------------------------------------------------------
-- Juan has several permissions from earlier phases, but not dabztech_tickets.
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  raise notice '--- phase 7: permission ---';

  begin
    insert into public.repair_tickets (ticket_number, customer_name, unit_kind, problem)
    values ('T-260918-999', 'Nope', 'laptop', 'Nope');
    raise exception 'FAIL: a staff member without the permission opened a ticket';
  exception when insufficient_privilege then
    raise notice 'PASS: opening a ticket needs the permission';
  end;

  if (select count(*) from public.repair_tickets) <> 0 then
    raise exception 'FAIL: a staff member without the permission can read tickets';
  end if;
  raise notice 'PASS: tickets are invisible without the permission';
end;
$$;

set test.user_id = '11111111-1111-1111-1111-111111111111';
insert into public.user_permissions (user_id, permission) values
  ('33333333-3333-3333-3333-333333333333', 'dabztech_tickets');

-- ---- A technician takes a unit in ----------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_ticket uuid;
  v_total bigint;
begin
  raise notice '--- phase 7: taking a unit in ---';

  insert into public.repair_tickets (
    ticket_number, customer_name, contact_number, unit_kind, brand, model,
    problem, unlock_method, promised_on, created_by
  )
  values (
    'T-260918-001', 'Marcelo Uy', '0917 555 0700', 'laptop', 'Acer', 'Aspire 5',
    'Will not turn on', 'customer_unlocks', current_date + 3,
    '33333333-3333-3333-3333-333333333333'
  )
  returning id into v_ticket;

  insert into public.repair_lines (
    ticket_id, kind, name, unit_price_centavos, quantity, income_category, created_by
  )
  values
    (v_ticket, 'checking_fee', 'Checking / diagnostic fee', 15000, 1,
     'checking_fee', '33333333-3333-3333-3333-333333333333'),
    (v_ticket, 'service', 'Cleaning & repaste', 50000, 1,
     'laptop_repair', '33333333-3333-3333-3333-333333333333');

  -- The total is added up from the rows, never stored.
  select coalesce(sum(unit_price_centavos * quantity), 0) into v_total
  from public.repair_lines where ticket_id = v_ticket;

  if v_total <> 65000 then
    raise exception 'FAIL: the ticket did not come to PHP 650.00, got %', v_total;
  end if;
  raise notice 'PASS: a ticket totals its own rows';
end;
$$;

-- ---- Fitting a part takes it off the shelf -------------------------------
do $$
declare
  v_ticket uuid;
  v_item uuid := 'aaaaaaa1-0000-0000-0000-000000000001';
  v_line uuid;
  v_on_hand_before bigint;
  v_on_hand_after bigint;
begin
  raise notice '--- phase 7: parts ---';

  select id into v_ticket from public.repair_tickets where ticket_number = 'T-260918-001';

  select coalesce(sum(delta_thousandths), 0) into v_on_hand_before
  from public.stock_movements where stock_item_id = v_item;

  v_line := public.fit_repair_part(v_ticket, v_item, 2, 24000, null);

  select coalesce(sum(delta_thousandths), 0) into v_on_hand_after
  from public.stock_movements where stock_item_id = v_item;

  if v_on_hand_after <> v_on_hand_before - 2000 then
    raise exception 'FAIL: fitting two units did not take two off the shelf';
  end if;
  raise notice 'PASS: fitting a part takes it off the shelf in the same breath';

  if (select stock_movement_id from public.repair_lines where id = v_line) is null then
    raise exception 'FAIL: the charge does not point at the stock movement';
  end if;
  raise notice 'PASS: the charge and the stock movement can be traced to each other';

  -- A part of no quantity is a mistake, and must leave nothing behind.
  declare
    v_lines_before int;
    v_moves_before int;
  begin
    select count(*) into v_lines_before from public.repair_lines;
    select count(*) into v_moves_before from public.stock_movements;

    begin
      perform public.fit_repair_part(v_ticket, v_item, 0, 24000, null);
      raise exception 'FAIL: a part with no quantity was accepted';
    exception when raise_exception then
      if position('at least one' in sqlerrm) = 0 then raise; end if;
    end;

    if (select count(*) from public.repair_lines) <> v_lines_before
       or (select count(*) from public.stock_movements) <> v_moves_before then
      raise exception 'FAIL: a refused part left something behind';
    end if;
    raise notice 'PASS: a refused part leaves no charge and no stock movement';
  end;
end;
$$;

-- ---- Money ---------------------------------------------------------------
do $$
declare
  v_ticket uuid;
  v_payment uuid;
  v_in_ledger bigint;
begin
  raise notice '--- phase 7: taking money ---';

  select id into v_ticket from public.repair_tickets where ticket_number = 'T-260918-001';

  -- Straight at the table is refused: the ledger is Owner/Admin only.
  begin
    insert into public.repair_payments (ticket_id, amount_centavos, source)
    values (v_ticket, 10000, 'cash_drawer');
    raise exception 'FAIL: a payment was written straight to the table';
  exception when insufficient_privilege then
    raise notice 'PASS: a payment cannot be written straight to the table';
  end;

  begin
    perform public.record_repair_payment(
      v_ticket, 100000, current_date, 'cash_drawer', null, null,
      jsonb_build_array(jsonb_build_object('category', 'laptop_repair',
                                           'amount_centavos', 99999))
    );
    raise exception 'FAIL: a split that did not add up was accepted';
  exception when raise_exception then
    if position('does not add up' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS: a payment split must account for every centavo';
  end;

  -- PHP 150 fee + PHP 500 labour + 2 parts at PHP 240 = PHP 1,130.
  v_payment := public.record_repair_payment(
    v_ticket, 113000, current_date, 'cash_drawer', null, 'Paid in full',
    jsonb_build_array(
      jsonb_build_object('category', 'checking_fee', 'amount_centavos', 15000),
      jsonb_build_object('category', 'laptop_repair', 'amount_centavos', 50000),
      jsonb_build_object('category', 'parts_sold', 'amount_centavos', 48000)
    )
  );

  -- Read the ledger AS THE OWNER: Juan cannot see it at all (spec 4.3), which
  -- is the point - the function wrote there on his behalf and he still cannot.
  set local test.user_id = '11111111-1111-1111-1111-111111111111';

  select coalesce(sum(amount_centavos), 0) into v_in_ledger
  from public.ledger_entries
  where source_table = 'repair_payments' and source_id = v_payment;

  if v_in_ledger <> 113000 then
    raise exception 'FAIL: the ledger entries do not add up to the payment, got %', v_in_ledger;
  end if;

  if (select count(*) from public.ledger_entries
      where source_table = 'repair_payments' and source_id = v_payment) <> 3 then
    raise exception 'FAIL: expected one ledger entry per income category';
  end if;

  if (select distinct tag from public.ledger_entries
      where source_table = 'repair_payments' and source_id = v_payment) <> 'dabztech' then
    raise exception 'FAIL: the takings did not land in the DabzTech books';
  end if;
  raise notice 'PASS: a repair payment splits across the fee, labour and parts';
end;
$$;

-- ---- Releasing, and the warranty -----------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_ticket uuid;
begin
  raise notice '--- phase 7: releasing ---';

  select id into v_ticket from public.repair_tickets where ticket_number = 'T-260918-001';

  -- A released unit has to say when it went.
  begin
    update public.repair_tickets set status = 'released' where id = v_ticket;
    raise exception 'FAIL: a unit was released with no release date';
  exception when check_violation then
    raise notice 'PASS: a released unit must record when it went';
  end;

  update public.repair_tickets
  set status = 'released', released_on = current_date, ready_on = current_date,
      warranty_days = 30
  where id = v_ticket;

  if (select warranty_days from public.repair_tickets where id = v_ticket) <> 30 then
    raise exception 'FAIL: the warranty period was not recorded on the ticket';
  end if;

  -- Changing the shop default afterwards must not touch a promise made.
  set local test.user_id = '11111111-1111-1111-1111-111111111111';
  update public.app_settings set default_warranty_days = 7 where id = 1;
  set local test.user_id = '33333333-3333-3333-3333-333333333333';

  if (select warranty_days from public.repair_tickets where id = v_ticket) <> 30 then
    raise exception 'FAIL: shortening the shop warranty rewrote an old ticket';
  end if;
  raise notice 'PASS: shortening the shop warranty never cancels a promise made';

  set local test.user_id = '11111111-1111-1111-1111-111111111111';
  update public.app_settings set default_warranty_days = 30 where id = 1;
end;
$$;

-- ---- Voiding -------------------------------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_payment uuid;
begin
  select id into v_payment from public.repair_payments limit 1;

  begin
    perform public.void_repair_payment(v_payment, 'Changed my mind');
    raise exception 'FAIL: a technician voided a payment';
  exception when insufficient_privilege then
    raise notice 'PASS: only Owner/Admin may void a repair payment';
  end;
end;
$$;

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_payment uuid;
  v_live bigint;
begin
  select id into v_payment from public.repair_payments limit 1;

  begin
    perform public.void_repair_payment(v_payment, '  ');
    raise exception 'FAIL: a payment was voided with no reason';
  exception when raise_exception then
    if position('needs a reason' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS: voiding a repair payment needs a reason';
  end;

  perform public.void_repair_payment(v_payment, 'Cheque bounced');

  if not exists (select 1 from public.repair_payments where id = v_payment) then
    raise exception 'FAIL: voiding deleted the payment';
  end if;

  select coalesce(sum(amount_centavos), 0) into v_live
  from public.ledger_entries
  where source_table = 'repair_payments' and source_id = v_payment
    and voided_at is null;

  if v_live <> 0 then
    raise exception 'FAIL: voiding the payment left its takings counting, got %', v_live;
  end if;
  raise notice 'PASS: voiding a repair payment voids its takings too';
end;
$$;

-- ---- A ticket is never deleted -------------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_ticket uuid;
begin
  select id into v_ticket from public.repair_tickets where ticket_number = 'T-260918-001';

  delete from public.repair_tickets where id = v_ticket;
  if not exists (select 1 from public.repair_tickets where id = v_ticket) then
    raise exception 'FAIL: a repair ticket was deleted';
  end if;
  raise notice 'PASS: a repair ticket cannot be deleted - the customer holds the stub';
end;
$$;

-- ---- Rosa sees nothing; the price list is public --------------------------
set test.user_id = '44444444-4444-4444-4444-444444444444';
do $$
begin
  if (select count(*) from public.repair_tickets) <> 0 then
    raise exception 'FAIL: a staff member without the permission can read tickets';
  end if;
  if (select count(*) from public.repair_payments) <> 0 then
    raise exception 'FAIL: a staff member without the permission can read payments';
  end if;
  raise notice 'PASS: tickets and payments stay invisible without the permission';

  if (select count(*) from public.repair_services) <> 12 then
    raise exception 'FAIL: the price list should be readable by anyone signed in';
  end if;
  raise notice 'PASS: the repair price list is readable by anyone signed in';
end;
$$;

set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  begin
    update public.repair_services set price_centavos = 1 where true;
    if found then
      raise exception 'FAIL: a technician set a repair price';
    end if;
    raise notice 'PASS: only Owner/Admin set repair prices';
  exception when insufficient_privilege then
    raise notice 'PASS: only Owner/Admin set repair prices';
  end;
end;
$$;

do $$
begin
  raise notice 'ALL PHASE 7 TESTS PASSED';
end;
$$;
