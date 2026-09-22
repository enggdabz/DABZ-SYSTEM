-- Security tests for Phase 14: the Dabz Apparel online shop (docs/spec.md).
--
-- This module is the second place in the system where somebody who is not
-- signed in causes a row to exist, and the first where they cause TWELVE of
-- them - an order, its items, a roster, a file, a log line. So the things
-- worth proving are about the line between the shop window and the books:
--
--   1. A STRANGER READS THE CATALOGUE AND NOTHING ELSE. Visible products,
--      their prices, options and pictures, the designs and the eight stage
--      names. Not one order, not one payment, not one customer.
--
--   2. A HIDDEN OR DELETED PRODUCT IS OFF THE SHOP IMMEDIATELY, because the
--      policy says so rather than because a query remembered to filter.
--
--   3. NOBODY WRITES AN ORDER DIRECTLY. There is no insert policy on any
--      order table, for anyone - the way in is a function that re-reads every
--      price out of the database and refuses a hidden product, a short order
--      and a stale set of options.
--
--   4. `anon` CANNOT CALL THAT FUNCTION. If it could, the validation, the
--      length caps, the honeypot and the rate limit in front of it would all
--      be decoration.
--
--   5. STAFF SEE THESE ORDERS ONLY WITH THE APPAREL PERMISSION, take payments
--      but never void one, and tick production steps in order or not at all.
--
-- The people come from the earlier files: eddie owner, maria admin, juan a
-- staff member who by now holds apparel_job_orders (08 granted it), rosa a
-- staff member who does not.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

do $$
declare
  v_table text;
  v_count integer;
begin
  raise notice '--- phase 14: structure ---';

  foreach v_table in array array[
    'online_categories', 'online_products', 'online_product_images',
    'online_product_prices', 'online_product_options', 'online_designs',
    'online_design_products', 'online_production_stages', 'online_orders',
    'online_order_items', 'online_order_roster', 'online_order_files',
    'online_payments', 'online_order_production', 'online_status_log',
    'online_rate_events'
  ]
  loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'FAIL: public.% does not exist', v_table;
    end if;
    if not (select relrowsecurity from pg_class where relname = v_table) then
      raise exception 'FAIL: public.% has Row Level Security switched off', v_table;
    end if;
  end loop;
  raise notice 'PASS: all sixteen tables exist, every one with RLS on';

  -- The server's own notebook: an address and a storage path, and nobody at
  -- all may read or write it through the API.
  if (select count(*) from pg_policies where tablename = 'online_rate_events') <> 0 then
    raise exception 'FAIL: online_rate_events has a policy - it is meant to have none';
  end if;
  raise notice 'PASS: online_rate_events is closed to everybody';

  /*
    The flag on online_order_totals, checked directly.

    Without it the view would run as its OWNER and hand every signed-in
    account the whole order book - balances, quotes, what each customer still
    owes - one row at a time, while every test below it still passed. Phase 10
    learned this on `collections`.
  */
  if not exists (
    select 1 from pg_class c
    where c.relname = 'online_order_totals'
      and c.reloptions @> array['security_invoker=true']
  ) then
    raise exception 'FAIL: online_order_totals is not security_invoker';
  end if;
  raise notice 'PASS: online_order_totals runs as the caller, not as its owner';

  -- And the opposite flag on the other view, also deliberate: "most ordered"
  -- is the shop's default sort and a visitor has to be able to read it. What
  -- it exposes is three numbers per product and never a row.
  if exists (
    select 1 from pg_class c
    where c.relname = 'online_product_stats'
      and c.reloptions @> array['security_invoker=true']
  ) then
    raise exception 'FAIL: online_product_stats cannot be security_invoker - an anonymous visitor would see nothing to sort by';
  end if;

  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'online_product_stats';
  if v_count <> 3 then
    raise exception 'FAIL: online_product_stats has % columns - every one of them is readable by a stranger', v_count;
  end if;
  raise notice 'PASS: online_product_stats exposes three counts and nothing else';

  -- No insert, update or delete policy on any order table. The functions are
  -- the way in, and a policy added here would be a second one.
  select count(*) into v_count
  from pg_policies
  where tablename in (
    'online_orders', 'online_order_items', 'online_order_roster',
    'online_order_files', 'online_payments', 'online_order_production',
    'online_status_log'
  )
  and cmd <> 'SELECT';
  if v_count <> 0 then
    raise exception 'FAIL: % write policies on the order tables - there should be none', v_count;
  end if;
  raise notice 'PASS: no order table can be written to directly, by anybody';

  -- The whole point of the Server Action in front of the function.
  if has_function_privilege(
    'anon',
    'public.create_online_order(text, text, text, text, text, date, text, jsonb, text)',
    'execute'
  ) then
    raise exception 'FAIL: anon can call create_online_order, so the rate limit in front of it is decoration';
  end if;
  raise notice 'PASS: anon cannot call create_online_order';
end;
$$;

-- ---------------------------------------------------------------------------
-- A catalogue to work on (written as the migration role, so RLS is not in the
-- way of the fixtures themselves)
-- ---------------------------------------------------------------------------

reset role;

insert into public.online_products
  (id, category_id, name, slug, pricing_mode, min_order_qty, lead_time_days,
   uses_sizes, uses_roster, uses_design_gallery, is_visible)
values
  ('aaaa0001-0000-0000-0000-000000000001',
   (select id from public.online_categories where slug = 'jerseys'),
   'Full sublimation jersey', 'full-sublimation-jersey', 'fixed', 6, 10,
   true, true, true, true),
  ('aaaa0002-0000-0000-0000-000000000002',
   (select id from public.online_categories where slug = 'dtf-prints'),
   'DTF printed shirt', 'dtf-printed-shirt', 'fixed', 1, 3,
   true, false, false, true),
  ('aaaa0003-0000-0000-0000-000000000003',
   (select id from public.online_categories where slug = 'jackets'),
   'Custom jacket', 'custom-jacket', 'quote', 1, 14,
   true, false, false, true),
  ('aaaa0004-0000-0000-0000-000000000004',
   (select id from public.online_categories where slug = 'shirts'),
   'Not on the shop yet', 'not-on-the-shop-yet', 'fixed', 1, 7,
   true, false, false, false);

insert into public.online_product_prices (product_id, label, price_centavos, sort_order)
values
  ('aaaa0001-0000-0000-0000-000000000001', 'Standard', 45000, 1),
  ('aaaa0001-0000-0000-0000-000000000001', 'With long sleeves', 52000, 2),
  ('aaaa0002-0000-0000-0000-000000000002', 'A4 print', 22000, 1),
  ('aaaa0004-0000-0000-0000-000000000004', 'Standard', 19900, 1);

insert into public.online_product_options (product_id, name, choices, sort_order)
values ('aaaa0001-0000-0000-0000-000000000001', 'Collar', array['Round', 'V-neck'], 1);

insert into public.online_designs (id, code, name, is_visible)
values
  ('bbbb0001-0000-0000-0000-000000000001', 'DJ-101', 'Thunder', true),
  ('bbbb0002-0000-0000-0000-000000000002', 'DJ-102', 'Hidden one', false);

insert into public.online_design_products (design_id, product_id)
values
  ('bbbb0001-0000-0000-0000-000000000001', 'aaaa0001-0000-0000-0000-000000000001'),
  ('bbbb0002-0000-0000-0000-000000000002', 'aaaa0001-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- A stranger: the shop window, and nothing behind it
-- ---------------------------------------------------------------------------

set role anon;
set test.user_id = '';

do $$
begin
  raise notice '--- phase 14: a stranger ---';

  if (select count(*) from public.online_products) <> 3 then
    raise exception 'FAIL: a stranger sees % products, expected the 3 visible ones',
      (select count(*) from public.online_products);
  end if;
  raise notice 'PASS: a stranger sees the three visible products and not the hidden one';

  if exists (select 1 from public.online_product_prices where price_centavos = 19900) then
    raise exception 'FAIL: a stranger reads the price of a product that is not on the shop';
  end if;
  raise notice 'PASS: a hidden product''s prices are hidden with it';

  if (select count(*) from public.online_designs) <> 1 then
    raise exception 'FAIL: a stranger sees a design that is switched off';
  end if;
  raise notice 'PASS: a stranger sees only the visible design';

  if (select count(*) from public.online_production_stages) <> 8 then
    raise exception 'FAIL: the stage names are not readable';
  end if;
  raise notice 'PASS: a stranger can read the eight stage names (the track page needs them)';

  if (select count(*) from public.online_orders) <> 0 then
    raise exception 'FAIL: a stranger can read orders';
  end if;
  if (select count(*) from public.online_payments) <> 0 then
    raise exception 'FAIL: a stranger can read payments';
  end if;
  if (select count(*) from public.online_status_log) <> 0 then
    raise exception 'FAIL: a stranger can read an order''s history';
  end if;
  raise notice 'PASS: a stranger reads no order, no payment and no history';

  begin
    insert into public.online_products (name, slug, pricing_mode)
    values ('Sneaky', 'sneaky', 'quote');
    raise exception 'FAIL: a stranger added a product';
  exception
    when insufficient_privilege then raise notice 'PASS: a stranger cannot add a product';
    when others then
      if sqlstate = '42501' then raise notice 'PASS: a stranger cannot add a product';
      else raise; end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- The website places an order (the server, as nobody signed in)
-- ---------------------------------------------------------------------------

reset role;
set role service_role;
set test.user_id = '';

do $$
declare
  v_result jsonb;
  v_order_id uuid;
  v_item record;
begin
  raise notice '--- phase 14: the website places an order ---';

  v_result := public.create_online_order(
    'Barangay Ball Club', '09171234567', 'BBC Team', 'pickup', null,
    ((now() at time zone 'Asia/Manila')::date + 20),
    'Ring us when it is ready.',
    jsonb_build_array(
      jsonb_build_object(
        'product_id', 'aaaa0001-0000-0000-0000-000000000001',
        'variant_label', 'Standard',
        'options', jsonb_build_object('Collar', 'V-neck'),
        'design_id', 'bbbb0001-0000-0000-0000-000000000001',
        'team_colors', 'black body, red accents',
        -- The browser is welcome to send this. It is ignored: the roster is
        -- the quantity.
        'qty', 999,
        'roster', jsonb_build_array(
          jsonb_build_object('player_name', ' ramos ', 'player_number', '7', 'size', 'M'),
          jsonb_build_object('player_name', 'cruz', 'player_number', '10', 'size', 'L'),
          jsonb_build_object('player_name', 'reyes', 'player_number', '', 'size', 'L'),
          jsonb_build_object('player_name', 'santos', 'player_number', '3', 'size', 'XL'),
          jsonb_build_object('player_name', 'dela cruz', 'player_number', '5', 'size', 'M'),
          jsonb_build_object('player_name', null, 'player_number', null, 'size', 'S')
        )
      ),
      jsonb_build_object(
        'product_id', 'aaaa0003-0000-0000-0000-000000000003',
        'qty', 2,
        'sizes', jsonb_build_object('L', 1, 'XL', 1)
      )
    )
  );

  v_order_id := (v_result ->> 'id')::uuid;

  if (v_result ->> 'order_no') !~ '^DA-[0-9]{4,}$' then
    raise exception 'FAIL: the order number is %, expected DA-0001 shape', v_result ->> 'order_no';
  end if;
  if length(v_result ->> 'receipt_token') < 32 then
    raise exception 'FAIL: the receipt token is short enough to guess';
  end if;
  raise notice 'PASS: the website gets an order number and an unguessable token';

  select * into v_item from public.online_order_items
  where order_id = v_order_id and pricing_mode = 'fixed';

  -- The browser never sends a price. This is the whole reason the function
  -- takes a product id and a variant label rather than an amount.
  if v_item.unit_price_centavos <> 45000 then
    raise exception 'FAIL: the jersey was priced at %, not the 45000 in the database',
      v_item.unit_price_centavos;
  end if;
  raise notice 'PASS: the price came from the database, not from the browser';

  if v_item.qty <> 6 then
    raise exception 'FAIL: the quantity is %, but six names were sent', v_item.qty;
  end if;
  raise notice 'PASS: the roster is the quantity - the 999 the browser sent was ignored';

  if v_item.product_name <> 'Full sublimation jersey'
     or v_item.category_name <> 'Jerseys'
     or v_item.production_path <> 'full' then
    raise exception 'FAIL: the item did not snapshot the product it was ordered against';
  end if;
  raise notice 'PASS: the item carries its own copy of the product, category and path';

  if (select player_name from public.online_order_roster
      where order_item_id = v_item.id and position = 1) <> 'RAMOS' then
    raise exception 'FAIL: a player name was not upper-cased and trimmed';
  end if;
  if (select player_name from public.online_order_roster
      where order_item_id = v_item.id and position = 6) is not null then
    raise exception 'FAIL: a blank player name became an empty string rather than nothing';
  end if;
  raise notice 'PASS: player names are trimmed and upper-cased, and a blank one stays blank';

  if (select count(*) from public.online_status_log where order_id = v_order_id) <> 1
     or (select actor_label from public.online_status_log where order_id = v_order_id) <> 'Website' then
    raise exception 'FAIL: the order was not logged as coming from the website';
  end if;
  raise notice 'PASS: the order''s history starts with "New" by "Website"';

  if (select source from public.online_orders where id = v_order_id) <> 'website' then
    raise exception 'FAIL: an order placed by nobody signed in is not marked as a website order';
  end if;

  -- One customer row, matched on the number.
  if (select count(*) from public.customers where contact_number = '09171234567') <> 1 then
    raise exception 'FAIL: the customer was not created, or was created twice';
  end if;
  raise notice 'PASS: the customer was created once, matched on their number';
end;
$$;

do $$
declare
  v_ignored jsonb;
begin
  raise notice '--- phase 14: what the function refuses ---';

  begin
    v_ignored := public.create_online_order(
      'Too Few', '09171234567', null, 'pickup', null,
      ((now() at time zone 'Asia/Manila')::date + 20), null,
      jsonb_build_array(jsonb_build_object(
        'product_id', 'aaaa0001-0000-0000-0000-000000000001',
        'variant_label', 'Standard',
        'options', jsonb_build_object('Collar', 'Round'),
        'roster', jsonb_build_array(
          jsonb_build_object('player_name', 'one', 'size', 'M'),
          jsonb_build_object('player_name', 'two', 'size', 'M')
        )
      ))
    );
    raise exception 'FAIL: two jerseys were accepted where the minimum is six';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: an order under the product''s minimum is refused';
  end;

  begin
    v_ignored := public.create_online_order(
      'Hidden Product', '09171234567', null, 'pickup', null,
      ((now() at time zone 'Asia/Manila')::date + 20), null,
      jsonb_build_array(jsonb_build_object(
        'product_id', 'aaaa0004-0000-0000-0000-000000000004',
        'variant_label', 'Standard',
        'sizes', jsonb_build_object('M', 2)
      ))
    );
    raise exception 'FAIL: a product that is not on the shop was ordered';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: a hidden product cannot be ordered even by id';
  end;

  begin
    v_ignored := public.create_online_order(
      'Too Soon', '09171234567', null, 'pickup', null,
      (now() at time zone 'Asia/Manila')::date, null,
      jsonb_build_array(jsonb_build_object(
        'product_id', 'aaaa0002-0000-0000-0000-000000000002',
        'variant_label', 'A4 print',
        'sizes', jsonb_build_object('M', 2)
      ))
    );
    raise exception 'FAIL: the website booked a date inside the lead time';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: the website cannot ask for a date sooner than the shop allows';
  end;

  begin
    v_ignored := public.create_online_order(
      'Stale Options', '09171234567', null, 'delivery', 'Somewhere',
      ((now() at time zone 'Asia/Manila')::date + 20), null,
      jsonb_build_array(jsonb_build_object(
        'product_id', 'aaaa0001-0000-0000-0000-000000000001',
        'variant_label', 'Standard',
        'options', jsonb_build_object('Collar', 'Mandarin'),
        'roster', (
          select jsonb_agg(jsonb_build_object('player_name', 'p' || g, 'size', 'M'))
          from generate_series(1, 6) g
        )
      ))
    );
    raise exception 'FAIL: an option the product does not offer was stored';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: a choice the product does not offer is refused, not stored';
  end;

  begin
    v_ignored := public.create_online_order(
      'No Address', '09171234567', null, 'delivery', '   ',
      ((now() at time zone 'Asia/Manila')::date + 20), null,
      jsonb_build_array(jsonb_build_object(
        'product_id', 'aaaa0002-0000-0000-0000-000000000002',
        'variant_label', 'A4 print',
        'sizes', jsonb_build_object('M', 2)
      ))
    );
    raise exception 'FAIL: a delivery with no address was accepted';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: a delivery needs an address';
  end;

  -- Anything the caller sends that the product did not ask about is dropped,
  -- and a size the shop does not make is not a size.
  declare
    v_order jsonb;
    v_item record;
  begin
    v_order := public.create_online_order(
      'Extra Keys', '09171234567', null, 'pickup', null,
      ((now() at time zone 'Asia/Manila')::date + 20), null,
      jsonb_build_array(jsonb_build_object(
        'product_id', 'aaaa0002-0000-0000-0000-000000000002',
        'variant_label', 'A4 print',
        'options', jsonb_build_object('Sneaky', 'yes'),
        'sizes', jsonb_build_object('M', 2, '4XL', 5, 'L', 'x')
      ))
    );

    select * into v_item from public.online_order_items
    where order_id = (v_order ->> 'id')::uuid;

    if v_item.options <> '{}'::jsonb then
      raise exception 'FAIL: an option the product never asked about was stored';
    end if;
    raise notice 'PASS: an option the product never asked about is dropped, not stored';

    if v_item.qty <> 2 or v_item.sizes <> jsonb_build_object('M', 2) then
      raise exception 'FAIL: the size tally kept a size the shop does not make (qty %, sizes %)',
        v_item.qty, v_item.sizes;
    end if;
    raise notice 'PASS: a size the shop does not make is not counted and not stored';
  end;

  begin
    v_ignored := public.create_online_order(
      'Bad Size', '09171234567', null, 'pickup', null,
      ((now() at time zone 'Asia/Manila')::date + 20), null,
      jsonb_build_array(jsonb_build_object(
        'product_id', 'aaaa0001-0000-0000-0000-000000000001',
        'variant_label', 'Standard',
        'options', jsonb_build_object('Collar', 'Round'),
        'roster', (
          select jsonb_agg(jsonb_build_object('player_name', 'p' || g, 'size', '4XL'))
          from generate_series(1, 6) g
        )
      ))
    );
    raise exception 'FAIL: a roster asked for a size the shop does not make';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: a roster size the shop does not make is refused';
  end;

  begin
    v_ignored := public.create_online_order(
      'Bad Number', '12345', null, 'pickup', null,
      ((now() at time zone 'Asia/Manila')::date + 20), null,
      jsonb_build_array(jsonb_build_object(
        'product_id', 'aaaa0002-0000-0000-0000-000000000002',
        'variant_label', 'A4 print',
        'sizes', jsonb_build_object('M', 2)
      ))
    );
    raise exception 'FAIL: a mobile number that is not one was accepted';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: a mobile number is eleven digits starting 09';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: who sees these orders at all
-- ---------------------------------------------------------------------------

reset role;
set role authenticated;

-- Rosa is staff with no apparel permission.
set test.user_id = '44444444-4444-4444-4444-444444444444';
do $$
begin
  raise notice '--- phase 14: staff without the apparel permission ---';

  if (select count(*) from public.online_orders) <> 0 then
    raise exception 'FAIL: a staff member without the apparel permission reads the orders';
  end if;
  if (select count(*) from public.online_payments) <> 0 then
    raise exception 'FAIL: a staff member without the apparel permission reads the payments';
  end if;
  if (select count(*) from public.online_order_totals) <> 0 then
    raise exception 'FAIL: the totals view handed over an order the tables would not';
  end if;
  raise notice 'PASS: no orders, no payments, and no totals either';

  -- The catalogue is different: everybody signed in reads it, because whoever
  -- writes an order needs the prices.
  if (select count(*) from public.online_products) <> 4 then
    raise exception 'FAIL: a signed-in staff member cannot see the hidden product';
  end if;
  raise notice 'PASS: anybody signed in reads the whole catalogue, hidden rows included';

  begin
    perform public.online_staff_label();
    raise exception 'FAIL: a staff member without the permission was handed a staff label';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: the staff-only functions refuse them by name';
  end;
end;
$$;

-- Juan is staff WITH apparel_job_orders (granted in 08).
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_order_id uuid;
begin
  raise notice '--- phase 14: staff with the apparel permission ---';

  select id into v_order_id from public.online_orders limit 1;
  if v_order_id is null then
    raise exception 'FAIL: a staff member with the permission reads no orders';
  end if;
  raise notice 'PASS: the apparel permission is what opens these orders';

  begin
    insert into public.online_orders
      (order_no, customer_name, mobile, method, date_needed, receipt_token)
    values ('DA-9999', 'Direct', '09170000000', 'pickup', current_date, 'token');
    raise exception 'FAIL: an order was inserted directly, going round the function';
  exception
    when insufficient_privilege then
      raise notice 'PASS: an order cannot be inserted directly, even with the permission';
    when others then
      if SQLERRM like 'FAIL:%' then raise; end if;
      raise notice 'PASS: an order cannot be inserted directly, even with the permission';
  end;

  begin
    insert into public.online_payments (order_id, amount_centavos, method)
    values (v_order_id, 100000, 'cash');
    raise exception 'FAIL: a payment was inserted directly, with no log line beside it';
  exception
    when insufficient_privilege then
      raise notice 'PASS: a payment cannot be inserted directly';
    when others then
      if SQLERRM like 'FAIL:%' then raise; end if;
      raise notice 'PASS: a payment cannot be inserted directly';
  end;

  begin
    insert into public.online_status_log (order_id, event, actor_label)
    values (v_order_id, 'Made it up', 'Juan Staff');
    raise exception 'FAIL: a history line was written by hand';
  exception
    when insufficient_privilege then raise notice 'PASS: the history cannot be written by hand';
    when others then
      if SQLERRM like 'FAIL:%' then raise; end if;
      raise notice 'PASS: the history cannot be written by hand';
  end;

  begin
    update public.online_products set name = 'Renamed by staff'
    where id = 'aaaa0001-0000-0000-0000-000000000001';
    if found then
      raise exception 'FAIL: a staff member edited the catalogue';
    end if;
    raise notice 'PASS: only Owner/Admin change the catalogue';
  exception
    when insufficient_privilege then raise notice 'PASS: only Owner/Admin change the catalogue';
    when others then
      if SQLERRM like 'FAIL:%' then raise; end if;
      raise notice 'PASS: only Owner/Admin change the catalogue';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quoting, confirming and the money
-- ---------------------------------------------------------------------------

set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_order_id uuid;
  v_totals record;
  v_payment_id uuid;
begin
  raise notice '--- phase 14: quoting, confirming and payments ---';

  select id into v_order_id from public.online_orders order by created_at limit 1;

  -- The order has a quote item (the jacket), so it cannot be agreed to yet.
  begin
    perform public.online_set_status(v_order_id, 'confirmed', null);
    raise exception 'FAIL: an order with an unpriced item was confirmed';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: an order with something still to be priced cannot be confirmed';
  end;

  select * into v_totals from public.online_order_totals where order_id = v_order_id;
  -- Six jerseys at 450.00. The jacket adds nothing until it is quoted.
  if v_totals.fixed_total_centavos <> 270000 then
    raise exception 'FAIL: the fixed total is %, expected 270000', v_totals.fixed_total_centavos;
  end if;
  if not v_totals.has_quote_items or v_totals.quote_amount_centavos is not null then
    raise exception 'FAIL: the order does not read as "part of this is still to be quoted"';
  end if;
  if v_totals.pieces <> 8 then
    raise exception 'FAIL: the order is % pieces, expected 8', v_totals.pieces;
  end if;
  raise notice 'PASS: six jerseys and two jackets add up, and the jacket stays unpriced';

  perform public.online_send_quote(v_order_id, 800000);

  if (select status from public.online_orders where id = v_order_id) <> 'quoted' then
    raise exception 'FAIL: saving a quote did not move the order to Quoted';
  end if;
  raise notice 'PASS: saving a quote quotes the order, in the same action';

  select * into v_totals from public.online_order_totals where order_id = v_order_id;
  if v_totals.total_centavos <> 1070000 then
    raise exception 'FAIL: the total is %, expected 1070000', v_totals.total_centavos;
  end if;
  if v_totals.balance_centavos <> 1070000 then
    raise exception 'FAIL: nothing is paid, so the balance should be the total';
  end if;
  raise notice 'PASS: the quote and the fixed lines add up to one total';

  perform public.online_set_status(v_order_id, 'confirmed', null);
  if (select status from public.online_orders where id = v_order_id) <> 'confirmed' then
    raise exception 'FAIL: the order was not confirmed once it had a price';
  end if;
  raise notice 'PASS: once it is priced, it can be confirmed';

  v_payment_id := public.online_record_payment(v_order_id, 500000, 'cash', null, 'Down payment');

  select * into v_totals from public.online_order_totals where order_id = v_order_id;
  if v_totals.paid_centavos <> 500000 or v_totals.balance_centavos <> 570000 then
    raise exception 'FAIL: paid is % and the balance %, expected 500000 and 570000',
      v_totals.paid_centavos, v_totals.balance_centavos;
  end if;
  raise notice 'PASS: a payment moves what is paid and what is left, together';

  if not exists (
    select 1 from public.online_status_log
    where order_id = v_order_id and event like 'Payment%Cash'
  ) then
    raise exception 'FAIL: the payment did not write its own line in the history';
  end if;
  raise notice 'PASS: the payment wrote its own line in the history';

  -- Staff take a payment; only Owner/Admin take one back (spec 4.4).
  begin
    perform public.online_void_payment(v_payment_id, 'Typed it twice');
    raise exception 'FAIL: a staff member voided a payment';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: a staff member cannot void a payment';
  end;

  begin
    perform public.online_record_payment(v_order_id, 100000, 'gateway', null, null);
    raise exception 'FAIL: a payment was typed in as if it came from a gateway';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: nobody can type in a gateway payment by hand';
  end;
end;
$$;

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_payment_id uuid;
  v_order_id uuid;
  v_totals record;
begin
  raise notice '--- phase 14: the owner voids a payment ---';

  select id, order_id into v_payment_id, v_order_id
  from public.online_payments where voided_at is null limit 1;

  begin
    perform public.online_void_payment(v_payment_id, '');
    raise exception 'FAIL: a payment was voided with no reason given';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: voiding a payment needs a reason';
  end;

  perform public.online_void_payment(v_payment_id, 'Recorded twice');

  select * into v_totals from public.online_order_totals where order_id = v_order_id;
  if v_totals.paid_centavos <> 0 then
    raise exception 'FAIL: a voided payment is still counted as paid';
  end if;
  raise notice 'PASS: a voided payment stays on the row and out of every sum';

  if (select count(*) from public.online_payments where id = v_payment_id) <> 1 then
    raise exception 'FAIL: the voided payment was deleted rather than struck through';
  end if;
  raise notice 'PASS: it was struck through, not deleted';
end;
$$;

-- ---------------------------------------------------------------------------
-- Production: in order, or not at all
-- ---------------------------------------------------------------------------

set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_order_id uuid;
  v_stage record;
begin
  raise notice '--- phase 14: production steps ---';

  select id into v_order_id from public.online_orders order by created_at limit 1;

  if public.online_order_path(v_order_id) <> 'full' then
    raise exception 'FAIL: an order with a sublimated jersey in it took the DTF path';
  end if;
  raise notice 'PASS: one sublimated item puts the whole order on the full path';

  begin
    perform public.online_mark_stage(v_order_id, 'sewing', false);
    raise exception 'FAIL: a step in the middle was ticked before the ones before it';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: only the current step can be ticked';
  end;

  perform public.online_mark_stage(v_order_id, 'design', false);

  if (select status from public.online_orders where id = v_order_id) <> 'in_production' then
    raise exception 'FAIL: ticking the first step did not start production';
  end if;
  raise notice 'PASS: the first step starts production by itself';

  perform public.online_mark_stage(v_order_id, 'pattern', true);
  if not (select skipped from public.online_order_production
          where order_id = v_order_id and stage_key = 'pattern') then
    raise exception 'FAIL: "not needed" was recorded as an ordinary tick';
  end if;
  if not exists (
    select 1 from public.online_status_log
    where order_id = v_order_id and event = 'Pattern: not needed'
  ) then
    raise exception 'FAIL: "not needed" did not say so in the history';
  end if;
  raise notice 'PASS: "not needed for this order" is a finished step that says which it was';

  for v_stage in
    select key from public.online_production_stages
    where key in ('print', 'heat_press', 'tabas', 'sewing', 'quality_check')
    order by position
  loop
    perform public.online_mark_stage(v_order_id, v_stage.key, false);
  end loop;

  if (select status from public.online_orders where id = v_order_id) <> 'in_production' then
    raise exception 'FAIL: the order left production before its last step';
  end if;

  perform public.online_mark_stage(v_order_id, 'packaging', false);

  if (select status from public.online_orders where id = v_order_id) <> 'ready_to_ship' then
    raise exception 'FAIL: the last step did not make the order ready to ship';
  end if;
  raise notice 'PASS: the last step makes it ready to ship, with no button for it';

  begin
    perform public.online_mark_stage(v_order_id, 'packaging', false);
    raise exception 'FAIL: a step was ticked twice';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: there is nothing left to tick';
  end;

  perform public.online_undo_stage(v_order_id);

  if (select status from public.online_orders where id = v_order_id) <> 'in_production' then
    raise exception 'FAIL: undoing the last step left the order saying it was packed';
  end if;
  if exists (select 1 from public.online_order_production
             where order_id = v_order_id and stage_key = 'packaging') then
    raise exception 'FAIL: undo did not remove the step';
  end if;
  if not exists (
    select 1 from public.online_status_log
    where order_id = v_order_id and event = 'Undo: Packaging'
  ) then
    raise exception 'FAIL: the undo is not in the history';
  end if;
  raise notice 'PASS: undo walks back one step and says so, and the order is no longer ready';

  -- Ready to ship is reached by doing the work, never by saying so.
  begin
    perform public.online_set_status(v_order_id, 'ready_to_ship', null);
    raise exception 'FAIL: an order was moved to ready to ship by hand';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: nobody can jump an order to ready to ship';
  end;

  begin
    perform public.online_set_status(v_order_id, 'cancelled', 'Changed their mind');
    raise exception 'FAIL: an order already in production was cancelled here';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: an order already in production is not cancelled from this screen';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- A DTF-only order takes the short path
-- ---------------------------------------------------------------------------

reset role;
set role service_role;
set test.user_id = '';

do $$
declare
  v_result jsonb;
  v_order_id uuid;
  v_steps integer;
begin
  raise notice '--- phase 14: the DTF path ---';

  v_result := public.create_online_order(
    'Shirt Buyer', '09998887777', null, 'pickup', null,
    ((now() at time zone 'Asia/Manila')::date + 10), null,
    jsonb_build_array(jsonb_build_object(
      'product_id', 'aaaa0002-0000-0000-0000-000000000002',
      'variant_label', 'A4 print',
      'sizes', jsonb_build_object('M', 3, 'L', 2)
    ))
  );
  v_order_id := (v_result ->> 'id')::uuid;

  if (select qty from public.online_order_items where order_id = v_order_id) <> 5 then
    raise exception 'FAIL: the size tally is not the quantity';
  end if;
  raise notice 'PASS: with no roster, the size tally is the quantity';

  if public.online_order_path(v_order_id) <> 'dtf' then
    raise exception 'FAIL: an order of nothing but DTF prints took the full path';
  end if;

  select count(*) into v_steps from public.online_production_stages where in_dtf_path;
  if v_steps <> 5 then
    raise exception 'FAIL: the DTF path is % steps, expected 5', v_steps;
  end if;
  raise notice 'PASS: a DTF-only order has five steps, not eight';
end;
$$;

reset role;
set role authenticated;
set test.user_id = '33333333-3333-3333-3333-333333333333';

do $$
declare
  v_order_id uuid;
begin
  select o.id into v_order_id from public.online_orders o
  where o.mobile = '09998887777' limit 1;

  perform public.online_set_status(v_order_id, 'confirmed', null);

  -- The pattern step is not on this order's path at all, so it is not the
  -- next one and cannot be ticked.
  begin
    perform public.online_mark_stage(v_order_id, 'pattern', false);
    raise exception 'FAIL: a step that is not on this order''s path was ticked';
  exception when others then
    if SQLERRM like 'FAIL:%' then raise; end if;
    raise notice 'PASS: a step off this order''s path is not the next one';
  end;

  perform public.online_mark_stage(v_order_id, 'design', false);
  perform public.online_mark_stage(v_order_id, 'print', false);
  perform public.online_mark_stage(v_order_id, 'heat_press', false);
  perform public.online_mark_stage(v_order_id, 'quality_check', false);

  if (select status from public.online_orders where id = v_order_id) <> 'in_production' then
    raise exception 'FAIL: a DTF order went ready to ship before packaging';
  end if;

  perform public.online_mark_stage(v_order_id, 'packaging', false);

  if (select status from public.online_orders where id = v_order_id) <> 'ready_to_ship' then
    raise exception 'FAIL: five steps did not finish a DTF order';
  end if;
  raise notice 'PASS: five steps finish a DTF order';

  perform public.online_set_status(v_order_id, 'completed', null);
  if (select completed_at from public.online_orders where id = v_order_id) is null then
    raise exception 'FAIL: a completed order has no date on it';
  end if;
  raise notice 'PASS: completing an order stamps the day it was completed';
end;
$$;

-- ---------------------------------------------------------------------------
-- Moving the date, and what a stranger still cannot see
-- ---------------------------------------------------------------------------

set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_order_id uuid;
begin
  raise notice '--- phase 14: the date and the last look from outside ---';

  select id into v_order_id from public.online_orders order by created_at limit 1;

  perform public.online_set_date_needed(v_order_id, current_date + 30);
  if not exists (
    select 1 from public.online_status_log
    where order_id = v_order_id and event like 'Date moved to %'
  ) then
    raise exception 'FAIL: moving the date was not logged';
  end if;
  raise notice 'PASS: moving the date says so in the history';
end;
$$;

reset role;
set role anon;
set test.user_id = '';

do $$
begin
  if (select count(*) from public.online_order_totals) <> 0 then
    raise exception 'FAIL: a stranger reads the totals of every order';
  end if;
  if (select count(*) from public.online_order_roster) <> 0 then
    raise exception 'FAIL: a stranger reads a team''s player names';
  end if;
  if (select count(*) from public.online_order_files) <> 0 then
    raise exception 'FAIL: a stranger reads where a customer''s artwork is kept';
  end if;
  raise notice 'PASS: after all of that, a stranger still reads none of it';

  -- The one aggregate they may read, and all it says.
  if (select pieces from public.online_product_stats
      where product_id = 'aaaa0001-0000-0000-0000-000000000001') <> 6 then
    raise exception 'FAIL: the "most ordered" figure a visitor sorts by is wrong';
  end if;
  raise notice 'PASS: a visitor can sort by how often a product has been ordered';
end;
$$;

reset role;

do $$
begin
  raise notice 'ALL PHASE 13 TESTS PASSED';
end;
$$;
