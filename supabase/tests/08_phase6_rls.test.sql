-- Security and money tests for Phase 6: Dabz Apparel job orders (spec 8).
--
-- The rules that matter most here:
--   * A payment reaches the ledger only through record_apparel_payment, and
--     the split has to account for every centavo.
--   * A payment is voided, never deleted, and its takings go with it.
--   * Nothing was priced: the item list, the size surcharges and the down
--     payment policy are all open decision 17.10.

\set ON_ERROR_STOP on

set role authenticated;

-- ---- Structure -----------------------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  raise notice '--- phase 6: structure ---';

  if (select count(*) from public.apparel_products) <> 5 then
    raise exception 'FAIL: expected the 5 fixture apparel items';
  end if;
  raise notice 'PASS: an owner reads every apparel item';

  if (select count(base_price_centavos) from public.apparel_products) <> 0 then
    raise exception 'FAIL: a price appeared on an apparel item that has none';
  end if;
  raise notice 'PASS: an apparel item with no price keeps having no price';

  if (select count(*) from public.apparel_size_prices) <> 9 then
    raise exception 'FAIL: expected the 9 seeded sizes - 0012 must NOT clear the ladder';
  end if;
  if (select count(extra_centavos) from public.apparel_size_prices) <> 0 then
    raise exception 'FAIL: a size surcharge was invented';
  end if;
  raise notice 'PASS: the size ladder survives, with no surcharge invented';

  if (select apparel_down_payment_percent from public.app_settings where id = 1) is not null then
    raise exception 'FAIL: a down payment policy was invented';
  end if;
  raise notice 'PASS: no down payment policy was invented';

  -- No fabrics or collars either: those are the owner's suppliers.
  if (select count(*) from public.apparel_options) <> 0 then
    raise exception 'FAIL: a fabric or collar option was invented';
  end if;
  raise notice 'PASS: no fabric or collar option was invented';
end;
$$;

-- ---- Permission ----------------------------------------------------------
-- Juan has add_sales, record_expenses and stock_in_out from earlier phases,
-- but not apparel_job_orders.
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  raise notice '--- phase 6: permission ---';

  begin
    insert into public.apparel_orders (order_number, team_name)
    values ('A-260918-999', 'Nope');
    raise exception 'FAIL: a staff member without the permission wrote an order';
  exception when insufficient_privilege then
    raise notice 'PASS: writing a job order needs the permission';
  end;

  if (select count(*) from public.apparel_orders) <> 0 then
    raise exception 'FAIL: a staff member without the permission can read orders';
  end if;
  raise notice 'PASS: job orders are invisible without the permission';
end;
$$;

set test.user_id = '11111111-1111-1111-1111-111111111111';
insert into public.user_permissions (user_id, permission) values
  ('33333333-3333-3333-3333-333333333333', 'apparel_job_orders');

-- ---- A staff member writes an order --------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_order uuid;
  v_line uuid;
  v_total bigint;
begin
  raise notice '--- phase 6: writing an order ---';

  insert into public.apparel_orders (order_number, team_name, promised_on, created_by)
  values ('A-260918-001', 'San Carlos Runners', current_date + 10,
          '33333333-3333-3333-3333-333333333333')
  returning id into v_order;

  insert into public.apparel_order_lines (
    order_id, name, fabric, collar, unit_price_centavos, quantity,
    income_category, created_by
  )
  values (
    v_order, 'Sublimation jersey set', 'Dri-fit', 'Round neck', 65000, 1,
    'sublimation_jerseys', '33333333-3333-3333-3333-333333333333'
  )
  returning id into v_line;

  -- Three players; one of them is a 2XL at PHP 50.00 extra.
  insert into public.apparel_order_names (
    line_id, player_name, player_number, size, size_extra_centavos, sort_order, created_by
  )
  values
    (v_line, 'Dela Cruz', '7',  'M',   0,    1, '33333333-3333-3333-3333-333333333333'),
    (v_line, 'Reyes',     '10', 'L',   0,    2, '33333333-3333-3333-3333-333333333333'),
    (v_line, 'Santos',    '23', '2XL', 5000, 3, '33333333-3333-3333-3333-333333333333');

  -- The total is added up from the rows, never stored. Three jerseys at
  -- PHP 650.00 plus PHP 50.00 for the 2XL.
  select (l.unit_price_centavos * count(n.id)) + coalesce(sum(n.size_extra_centavos), 0)
  into v_total
  from public.apparel_order_lines l
  join public.apparel_order_names n on n.line_id = l.id
  where l.id = v_line
  group by l.unit_price_centavos;

  if v_total <> 200000 then
    raise exception 'FAIL: three jerseys with one 2XL did not come to PHP 2,000.00, got %', v_total;
  end if;
  raise notice 'PASS: an order totals its own rows, size surcharges included';

  -- The surcharge is copied, so a later price rise cannot rewrite the quote.
  set local test.user_id = '11111111-1111-1111-1111-111111111111';
  update public.apparel_size_prices set extra_centavos = 9900 where size = '2XL';
  set local test.user_id = '33333333-3333-3333-3333-333333333333';

  if (select size_extra_centavos from public.apparel_order_names
      where line_id = v_line and size = '2XL') <> 5000 then
    raise exception 'FAIL: raising the surcharge rewrote an existing order';
  end if;
  raise notice 'PASS: raising a size surcharge never rewrites an old quote';
end;
$$;

-- ---- A staff member takes a down payment ---------------------------------
do $$
declare
  v_order uuid;
  v_payment uuid;
  v_ledger_count int;
begin
  raise notice '--- phase 6: taking money ---';

  select id into v_order from public.apparel_orders where order_number = 'A-260918-001';

  -- Straight at the table is refused: the ledger is Owner/Admin only.
  begin
    insert into public.apparel_payments (order_id, amount_centavos, source, kind)
    values (v_order, 100000, 'cash_drawer', 'down_payment');
    raise exception 'FAIL: a payment was written straight to the table';
  exception when insufficient_privilege then
    raise notice 'PASS: a payment cannot be written straight to the table';
  end;

  -- A split that does not add up would leave the ledger and the order
  -- disagreeing about what was taken.
  begin
    perform public.record_apparel_payment(
      v_order, 100000, current_date, 'cash_drawer', 'down_payment', null, null,
      jsonb_build_array(jsonb_build_object('category', 'sublimation_jerseys',
                                           'amount_centavos', 99999))
    );
    raise exception 'FAIL: a payment split that did not add up was accepted';
  exception when raise_exception then
    if position('does not add up' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS: a payment split must account for every centavo';
  end;

  v_payment := public.record_apparel_payment(
    v_order, 100000, current_date, 'cash_drawer', 'down_payment', null, 'Down payment',
    jsonb_build_array(jsonb_build_object('category', 'sublimation_jerseys',
                                         'amount_centavos', 100000))
  );

  -- Read the ledger AS THE OWNER. Juan cannot see it at all (spec 4.3), which
  -- is the point: the function wrote there on his behalf and he still cannot.
  set local test.user_id = '11111111-1111-1111-1111-111111111111';

  select count(*) into v_ledger_count from public.ledger_entries
  where source_table = 'apparel_payments' and source_id = v_payment;

  if v_ledger_count <> 1 then
    raise exception 'FAIL: the payment did not write exactly one ledger entry';
  end if;

  if (select tag from public.ledger_entries
      where source_table = 'apparel_payments' and source_id = v_payment) <> 'apparel' then
    raise exception 'FAIL: the takings did not land in the apparel books';
  end if;
  raise notice 'PASS: a down payment writes its takings to the apparel books';

  set local test.user_id = '33333333-3333-3333-3333-333333333333';

  -- A payment of nothing is a mistake, not an entry.
  begin
    perform public.record_apparel_payment(
      v_order, 0, current_date, 'cash_drawer', 'balance', null, null, '[]'::jsonb
    );
    raise exception 'FAIL: a payment of zero was allowed';
  exception when raise_exception then
    if position('needs an amount' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS: a payment needs an amount';
  end;
end;
$$;

-- ---- A payment split across two categories -------------------------------
do $$
declare
  v_order uuid;
  v_payment uuid;
  v_in_ledger bigint;
begin
  select id into v_order from public.apparel_orders where order_number = 'A-260918-001';

  insert into public.apparel_order_lines (
    order_id, name, unit_price_centavos, quantity, income_category, created_by
  )
  values (v_order, 'Jacket', 90000, 2, 'jackets',
          '33333333-3333-3333-3333-333333333333');

  v_payment := public.record_apparel_payment(
    v_order, 155000, current_date, 'gcash', 'balance', 'GC-1234', null,
    jsonb_build_array(
      jsonb_build_object('category', 'sublimation_jerseys', 'amount_centavos', 65000),
      jsonb_build_object('category', 'jackets', 'amount_centavos', 90000)
    )
  );

  set local test.user_id = '11111111-1111-1111-1111-111111111111';

  select coalesce(sum(amount_centavos), 0) into v_in_ledger
  from public.ledger_entries
  where source_table = 'apparel_payments' and source_id = v_payment;

  if v_in_ledger <> 155000 then
    raise exception 'FAIL: the split entries do not add back up to the payment, got %', v_in_ledger;
  end if;

  if (select count(*) from public.ledger_entries
      where source_table = 'apparel_payments' and source_id = v_payment) <> 2 then
    raise exception 'FAIL: expected one ledger entry per income category';
  end if;
  raise notice 'PASS: a split payment adds back up to the payment exactly';
end;
$$;

-- ---- Staff cannot void; the owner can ------------------------------------
do $$
declare
  v_payment uuid;
begin
  raise notice '--- phase 6: voiding ---';

  select id into v_payment from public.apparel_payments
  where kind = 'down_payment' limit 1;

  begin
    perform public.void_apparel_payment(v_payment, 'Changed my mind');
    raise exception 'FAIL: a staff member voided a payment';
  exception when insufficient_privilege then
    raise notice 'PASS: only Owner/Admin may void a payment';
  end;
end;
$$;

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_payment uuid;
  v_live bigint;
begin
  select id into v_payment from public.apparel_payments
  where kind = 'down_payment' limit 1;

  -- A void without a reason is how a shop loses track of why money moved.
  begin
    perform public.void_apparel_payment(v_payment, '   ');
    raise exception 'FAIL: a payment was voided with no reason';
  exception when raise_exception then
    if position('needs a reason' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS: voiding a payment needs a reason';
  end;

  perform public.void_apparel_payment(v_payment, 'Cheque bounced');

  if (select voided_at from public.apparel_payments where id = v_payment) is null then
    raise exception 'FAIL: the payment was not marked voided';
  end if;

  -- It is still there. A deleted payment is a payment nobody can explain.
  if not exists (select 1 from public.apparel_payments where id = v_payment) then
    raise exception 'FAIL: voiding deleted the payment';
  end if;
  raise notice 'PASS: a payment is voided, never deleted';

  select coalesce(sum(amount_centavos), 0) into v_live
  from public.ledger_entries
  where source_table = 'apparel_payments' and source_id = v_payment
    and voided_at is null;

  if v_live <> 0 then
    raise exception 'FAIL: voiding the payment left its takings counting, got %', v_live;
  end if;
  raise notice 'PASS: voiding a payment voids its takings too';

  -- Twice would double-void, which reads as two reasons for one event.
  begin
    perform public.void_apparel_payment(v_payment, 'Again');
    raise exception 'FAIL: the same payment was voided twice';
  exception when raise_exception then
    if position('already voided' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS: a payment cannot be voided twice';
  end;
end;
$$;

-- ---- An order is cancelled, never deleted --------------------------------
do $$
declare
  v_order uuid;
begin
  raise notice '--- phase 6: cancelling ---';

  select id into v_order from public.apparel_orders where order_number = 'A-260918-001';

  delete from public.apparel_orders where id = v_order;
  if not exists (select 1 from public.apparel_orders where id = v_order) then
    raise exception 'FAIL: a job order was deleted';
  end if;
  raise notice 'PASS: a job order cannot be deleted';

  update public.apparel_orders
  set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Team pulled out'
  where id = v_order;

  -- And no more money can be taken against it.
  begin
    perform public.record_apparel_payment(
      v_order, 10000, current_date, 'cash_drawer', 'balance', null, null,
      jsonb_build_array(jsonb_build_object('category', 'sublimation_jerseys',
                                           'amount_centavos', 10000))
    );
    raise exception 'FAIL: money was taken against a cancelled order';
  exception when raise_exception then
    if position('was cancelled' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS: a cancelled order cannot take more money';
  end;
end;
$$;

-- ---- Rosa, with no apparel permission, sees nothing -----------------------
set test.user_id = '44444444-4444-4444-4444-444444444444';
do $$
begin
  if (select count(*) from public.apparel_orders) <> 0 then
    raise exception 'FAIL: a staff member without the permission can read orders';
  end if;
  if (select count(*) from public.apparel_payments) <> 0 then
    raise exception 'FAIL: a staff member without the permission can read payments';
  end if;
  raise notice 'PASS: orders and payments stay invisible without the permission';

  -- But the price list is readable by anyone signed in: a price is not a secret.
  if (select count(*) from public.apparel_products) <> 5 then
    raise exception 'FAIL: the price list should be readable by anyone signed in';
  end if;
  raise notice 'PASS: the apparel price list is readable by anyone signed in';
end;
$$;

-- ---- Only Owner/Admin set prices -----------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  begin
    update public.apparel_products set base_price_centavos = 1 where true;
    if found then
      raise exception 'FAIL: a staff member set an apparel price';
    end if;
    raise notice 'PASS: only Owner/Admin set apparel prices';
  exception when insufficient_privilege then
    raise notice 'PASS: only Owner/Admin set apparel prices';
  end;

  begin
    update public.apparel_size_prices set extra_centavos = 1 where size = '3XL';
    if found then
      raise exception 'FAIL: a staff member set a size surcharge';
    end if;
    raise notice 'PASS: only Owner/Admin set size surcharges';
  exception when insufficient_privilege then
    raise notice 'PASS: only Owner/Admin set size surcharges';
  end;
end;
$$;

do $$
begin
  raise notice 'ALL PHASE 6 TESTS PASSED';
end;
$$;
