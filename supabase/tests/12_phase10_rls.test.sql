-- Security and money tests for Phase 10: one counter, all three divisions.
--
-- Two things are proved here, and they are the two that could go wrong:
--
--   1. THE FEED LEAKS NOTHING. `public.collections` unions three tables whose
--      policies differ, so a mistake would hand a counter assistant the
--      apparel and DabzTech books one row at a time. It is a `security_invoker`
--      view precisely so the existing policies still decide - and this file
--      checks that they do, by asking as four different people.
--
--   2. THE FEED AND THE LEDGER AGREE. The feed is a view of the three payment
--      tables; the ledger is what those tables wrote. If they can ever differ,
--      the feed is wrong, because the ledger is the record. The check is per
--      MONEY SOURCE, which is the level the End of day screen puts them side
--      by side at.
--
-- Earlier files have already left sales, orders, tickets and payments behind.
-- That is deliberate: the agreement below is asserted over EVERYTHING in the
-- database, not only over rows this file created, so a mistake anywhere in the
-- suite shows up here.

\set ON_ERROR_STOP on

set role authenticated;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_options text[];
  v_overloads int;
begin
  raise notice '--- phase 10: structure ---';

  if to_regclass('public.collections') is null then
    raise exception 'FAIL: the collections view does not exist';
  end if;

  /*
    The single most important line in the migration. Without
    security_invoker the view would run with its OWNER's privileges and
    return every row to everybody, and none of the policy tests below would
    fail - they would all pass while the books were wide open.
  */
  select reloptions into v_options from pg_class where relname = 'collections';
  if v_options is null or not ('security_invoker=true' = any(v_options)) then
    raise exception 'FAIL: collections is not security_invoker - it would bypass every policy';
  end if;
  raise notice 'PASS: the collections view runs as the person asking';

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'repair_payments' and column_name = 'kind'
  ) then
    raise exception 'FAIL: repair_payments has no kind column';
  end if;

  -- Nullable on purpose: a payment taken before Phase 10 has no kind anybody
  -- can now know, and a default would have invented one for every old row.
  if (
    select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'repair_payments' and column_name = 'kind'
  ) <> 'YES' then
    raise exception 'FAIL: repair_payments.kind must stay nullable for old rows';
  end if;
  raise notice 'PASS: a DabzTech payment can say its kind, and an old one can stay silent';

  /*
    Exactly one function, not two. Adding p_kind with `create or replace`
    alone would have left the seven-argument version in place beside the new
    one - and then a call is ambiguous, or worse resolves to the old one and
    silently writes a payment with no kind.
  */
  select count(*) into v_overloads
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'record_repair_payment';

  if v_overloads <> 1 then
    raise exception 'FAIL: expected exactly one record_repair_payment, found %', v_overloads;
  end if;
  raise notice 'PASS: there is one and only one record_repair_payment';
end;
$$;

-- ---------------------------------------------------------------------------
-- A day at the three doors
-- ---------------------------------------------------------------------------
-- The owner's own walkthrough from docs/PHASES.md: a PHP 30 cash print sale, a
-- PHP 500 GCash apparel down payment and a PHP 200 cash DabzTech down payment.

set role postgres;

insert into auth.users (id, email) values
  ('66666666-6666-6666-6666-666666666666', 'nena@staff.dabz.local');

insert into public.profiles (id, username, full_name, role, must_change_password) values
  ('66666666-6666-6666-6666-666666666666', 'nena', 'Nena Counter', 'staff', false);

-- Nena may ring up a sale and NOTHING else. She is the whole point of the
-- policy tests further down.
insert into public.user_permissions (user_id, permission) values
  ('66666666-6666-6666-6666-666666666666', 'add_sales');

set role authenticated;

set test.user_id = '66666666-6666-6666-6666-666666666666';
do $$
declare
  v_result record;
begin
  raise notice '--- phase 10: the counter ---';

  select * into v_result from public.complete_sale(
    current_date, null, 3000, 0, 'none', null, 3000, 'cash', null, 5000, 2000,
    jsonb_build_array(jsonb_build_object(
      'name', 'Photocopy', 'division', 'printshoppe', 'quantity', 10,
      'unit_price_centavos', 300, 'line_total_centavos', 3000,
      'income_category', 'photocopy')),
    jsonb_build_array(jsonb_build_object(
      'division', 'printshoppe', 'category', 'photocopy', 'amount_centavos', 3000))
  );

  if (select count(*) from public.collections
      where kind = 'counter_sale' and id = v_result.sale_id) <> 1 then
    raise exception 'FAIL: a counter sale did not reach the feed';
  end if;

  if (select amount_centavos from public.collections where id = v_result.sale_id) <> 3000 then
    raise exception 'FAIL: the feed disagrees with the sale about the amount';
  end if;

  -- The feed calls the method by the LEDGER's name for it, not the sale's, so
  -- the End of day screen can put the two side by side without translating.
  if (select source from public.collections where id = v_result.sale_id) <> 'cash_drawer' then
    raise exception 'FAIL: a cash sale did not land under cash_drawer';
  end if;

  if (select payment_kind from public.collections where id = v_result.sale_id) <> 'sale' then
    raise exception 'FAIL: a counter sale should read as a Sale';
  end if;

  -- A sale is its own parent: its row links to its own receipt.
  if (select parent_id from public.collections where id = v_result.sale_id)
     <> v_result.sale_id then
    raise exception 'FAIL: a counter sale does not point at itself';
  end if;

  raise notice 'PASS: a counter sale appears in the feed, as cash';
end;
$$;

-- Juan has apparel_job_orders and dabztech_tickets from the Phase 6 and 7
-- tests, so he is the one who can take the other two payments.
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_order uuid;
  v_line uuid;
  v_payment uuid;
  v_ticket uuid;
begin
  raise notice '--- phase 10: apparel and dabztech, through the existing functions ---';

  insert into public.apparel_orders (order_number, team_name, created_by)
  values ('A-261001-001', 'Phase 10 Runners', '33333333-3333-3333-3333-333333333333')
  returning id into v_order;

  insert into public.apparel_order_lines (
    order_id, name, unit_price_centavos, quantity, income_category, created_by
  )
  values (
    v_order, 'Sublimation jersey', 200000, 1, 'sublimation_jerseys',
    '33333333-3333-3333-3333-333333333333'
  )
  returning id into v_line;

  v_payment := public.record_apparel_payment(
    v_order, 50000, current_date, 'gcash', 'down_payment', 'GC-1', null,
    jsonb_build_array(jsonb_build_object(
      'category', 'sublimation_jerseys', 'amount_centavos', 50000))
  );

  if (select count(*) from public.collections
      where kind = 'apparel_payment' and id = v_payment) <> 1 then
    raise exception 'FAIL: an apparel payment did not reach the feed';
  end if;

  if (select payment_kind from public.collections where id = v_payment) <> 'down_payment' then
    raise exception 'FAIL: the feed lost the apparel payment kind';
  end if;

  if (select reference from public.collections where id = v_payment) <> 'A-261001-001' then
    raise exception 'FAIL: the feed does not carry the job order number';
  end if;

  -- The row's own id is the PAYMENT (which is what a receipt needs) and
  -- parent_id is the ORDER (which is what the screen links to). Getting these
  -- the same way round would send every Sales row to a page that is not there.
  if (select parent_id from public.collections where id = v_payment) <> v_order then
    raise exception 'FAIL: an apparel payment does not point at its order';
  end if;

  -- No customer row on this order, so the team stands in for the name: the
  -- counter has to be able to find it by what the customer will say.
  if (select customer_name from public.collections where id = v_payment) <> 'Phase 10 Runners' then
    raise exception 'FAIL: the feed shows no name for a team order';
  end if;

  raise notice 'PASS: an apparel down payment appears in the feed, as GCash';

  insert into public.repair_tickets (
    ticket_number, customer_name, unit_kind, problem, created_by
  )
  values (
    'T-261001-001', 'Mrs Reyes', 'laptop', 'Will not charge',
    '33333333-3333-3333-3333-333333333333'
  )
  returning id into v_ticket;

  insert into public.repair_lines (
    ticket_id, kind, name, unit_price_centavos, quantity, income_category, created_by
  )
  values (
    v_ticket, 'service', 'Laptop repair', 120000, 1, 'laptop_repair',
    '33333333-3333-3333-3333-333333333333'
  );

  -- The new p_kind, at the end of the argument list.
  v_payment := public.record_repair_payment(
    v_ticket, 20000, current_date, 'cash_drawer', null, null,
    jsonb_build_array(jsonb_build_object(
      'category', 'laptop_repair', 'amount_centavos', 20000)),
    'down_payment'
  );

  if (select kind from public.repair_payments where id = v_payment) <> 'down_payment' then
    raise exception 'FAIL: record_repair_payment did not store the kind';
  end if;

  if (select payment_kind from public.collections where id = v_payment) <> 'down_payment' then
    raise exception 'FAIL: the feed lost the repair payment kind';
  end if;

  if (select customer_name from public.collections where id = v_payment) <> 'Mrs Reyes' then
    raise exception 'FAIL: the feed does not carry the repair customer';
  end if;

  if (select parent_id from public.collections where id = v_payment) <> v_ticket then
    raise exception 'FAIL: a repair payment does not point at its ticket';
  end if;

  raise notice 'PASS: a DabzTech down payment appears in the feed, as cash';

  -- Left without a kind on purpose, standing in for every payment taken
  -- before Phase 10. It must read as null, not as a guess.
  v_payment := public.record_repair_payment(
    v_ticket, 10000, current_date, 'maya', null, null,
    jsonb_build_array(jsonb_build_object(
      'category', 'laptop_repair', 'amount_centavos', 10000))
  );

  if (select kind from public.repair_payments where id = v_payment) is not null then
    raise exception 'FAIL: a kind was invented for a payment that gave none';
  end if;
  if (select payment_kind from public.collections where id = v_payment) is not null then
    raise exception 'FAIL: the feed invented a kind for an unlabelled payment';
  end if;
  raise notice 'PASS: a payment with no kind keeps having no kind';

  -- A kind that is neither is refused rather than stored as null: null means
  -- "taken before the column existed", and a typo must not manufacture one.
  begin
    perform public.record_repair_payment(
      v_ticket, 100, current_date, 'cash_drawer', null, null,
      jsonb_build_array(jsonb_build_object(
        'category', 'laptop_repair', 'amount_centavos', 100)),
      'deposit'
    );
    raise exception 'FAIL: an unknown payment kind was accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: an unknown payment kind is refused';
  end;

  -- The split still has to account for every centavo, exactly as before.
  begin
    perform public.record_repair_payment(
      v_ticket, 50000, current_date, 'cash_drawer', null, null,
      jsonb_build_array(jsonb_build_object(
        'category', 'laptop_repair', 'amount_centavos', 40000)),
      'balance'
    );
    raise exception 'FAIL: a split that does not add up was accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: a repair payment split still has to add back up';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- The feed and the ledger agree, per money source
-- ---------------------------------------------------------------------------

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_row record;
  v_checked int := 0;
begin
  raise notice '--- phase 10: the feed against the ledger ---';

  /*
    Every source, from both sides, full outer joined so a source that appears
    on one side and not the other is caught rather than skipped.

    The ledger side is filtered to INCOME rows written by the three payment
    tables. Money out, and money in that somebody typed straight into the
    ledger, are not collections and have no business in this comparison.
  */
  for v_row in
    with feed as (
      select source, sum(amount_centavos) as centavos
      from public.collections
      where voided_at is null
      group by source
    ),
    book as (
      select source, sum(amount_centavos) as centavos
      from public.ledger_entries
      where voided_at is null
        and direction = 'in'
        and source_table in ('sales', 'apparel_payments', 'repair_payments')
      group by source
    )
    select
      coalesce(feed.source, book.source) as source,
      coalesce(feed.centavos, 0) as feed_centavos,
      coalesce(book.centavos, 0) as book_centavos
    from feed
    full outer join book on book.source = feed.source
  loop
    if v_row.feed_centavos <> v_row.book_centavos then
      raise exception
        'FAIL: % - the feed says % and the ledger says %',
        v_row.source, v_row.feed_centavos, v_row.book_centavos;
    end if;
    v_checked := v_checked + 1;
    raise notice 'PASS: % agrees at %', v_row.source, v_row.feed_centavos;
  end loop;

  -- A check that silently checks nothing is worse than no check.
  if v_checked = 0 then
    raise exception 'FAIL: nothing was compared - the fixtures wrote no money at all';
  end if;

  raise notice 'PASS: the feed and the ledger agree on every money source (% checked)', v_checked;
end;
$$;

-- ---------------------------------------------------------------------------
-- A void leaves both of them at the same moment
-- ---------------------------------------------------------------------------

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_payment uuid;
  v_feed_before bigint;
  v_book_before bigint;
  v_feed_after bigint;
  v_book_after bigint;
begin
  raise notice '--- phase 10: voiding a down payment ---';

  select id into v_payment from public.apparel_payments
  where amount_centavos = 50000 and voided_at is null
  order by created_at desc limit 1;

  select coalesce(sum(amount_centavos), 0) into v_feed_before
  from public.collections where voided_at is null and source = 'gcash';

  select coalesce(sum(amount_centavos), 0) into v_book_before
  from public.ledger_entries
  where voided_at is null and direction = 'in' and source = 'gcash'
    and source_table in ('sales', 'apparel_payments', 'repair_payments');

  perform public.void_apparel_payment(v_payment, 'Customer changed their mind.');

  select coalesce(sum(amount_centavos), 0) into v_feed_after
  from public.collections where voided_at is null and source = 'gcash';

  select coalesce(sum(amount_centavos), 0) into v_book_after
  from public.ledger_entries
  where voided_at is null and direction = 'in' and source = 'gcash'
    and source_table in ('sales', 'apparel_payments', 'repair_payments');

  if v_feed_before - v_feed_after <> 50000 then
    raise exception 'FAIL: the feed did not drop the voided PHP 500.00';
  end if;
  if v_book_before - v_book_after <> 50000 then
    raise exception 'FAIL: the ledger did not drop the voided PHP 500.00';
  end if;
  if v_feed_after <> v_book_after then
    raise exception 'FAIL: the feed and the ledger disagree after a void';
  end if;
  raise notice 'PASS: a voided down payment leaves the feed and the ledger together';

  -- And it is still THERE, because the customer may be holding the slip.
  if (select voided_at from public.collections where id = v_payment) is null then
    raise exception 'FAIL: a voided payment vanished from the feed instead of being marked';
  end if;
  raise notice 'PASS: the voided payment is still listed, marked as voided';
end;
$$;

-- ---------------------------------------------------------------------------
-- Manila dates (spec: a payment at 11:50 pm belongs to that day)
-- ---------------------------------------------------------------------------

set role postgres;
-- Written directly, because this is about the TIMESTAMP and not about the
-- path money takes. 15:50 UTC is 23:50 in Manila on the same date.
update public.repair_payments
   set created_at = timestamptz '2026-09-21 15:50:00+00'
 where amount_centavos = 10000
   and id = (select id from public.repair_payments where amount_centavos = 10000
             order by created_at desc limit 1);
set role authenticated;

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_taken timestamptz;
  v_from timestamptz := timestamptz '2026-09-20 16:00:00+00';  -- manilaDayRangeUtc('2026-09-21').from
  v_to   timestamptz := timestamptz '2026-09-21 16:00:00+00';  -- .to
begin
  raise notice '--- phase 10: Manila dates ---';

  select taken_at into v_taken from public.collections
  where amount_centavos = 10000 and kind = 'repair_payment'
  order by taken_at desc limit 1;

  if (v_taken at time zone 'Asia/Manila')::date <> date '2026-09-21' then
    raise exception 'FAIL: 23:50 Manila was read as %',
      (v_taken at time zone 'Asia/Manila')::date;
  end if;

  -- The window the app asks for is a UTC pair, and the row has to fall inside
  -- it. Comparing a stored timestamp to a bare date instead would put this
  -- payment in the 22nd, which is the bug this guards against.
  if not (v_taken >= v_from and v_taken < v_to) then
    raise exception 'FAIL: a 23:50 Manila payment fell outside that Manila day';
  end if;

  if v_taken >= timestamptz '2026-09-21 16:00:00+00' then
    raise exception 'FAIL: the payment leaked into the next Manila day';
  end if;

  raise notice 'PASS: a payment at 11:50 pm belongs to that Manila day';
end;
$$;

-- ---------------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------------

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  raise notice '--- phase 10: the owner ---';

  if (select count(*) from public.collections where kind = 'counter_sale') = 0 then
    raise exception 'FAIL: the owner cannot see counter sales';
  end if;
  if (select count(*) from public.collections where kind = 'apparel_payment') = 0 then
    raise exception 'FAIL: the owner cannot see apparel payments';
  end if;
  if (select count(*) from public.collections where kind = 'repair_payment') = 0 then
    raise exception 'FAIL: the owner cannot see repair payments';
  end if;
  raise notice 'PASS: the owner sees all three doors';
end;
$$;

set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  raise notice '--- phase 10: an admin ---';

  if (select count(*) from public.collections where kind = 'apparel_payment') = 0 then
    raise exception 'FAIL: an admin cannot see apparel payments';
  end if;
  if (select count(*) from public.collections where kind = 'repair_payment') = 0 then
    raise exception 'FAIL: an admin cannot see repair payments';
  end if;
  raise notice 'PASS: an admin sees all three doors too';
end;
$$;

/*
  Nena is the case spec 4.3 is about: a person at the counter who may ring up
  a sale and knows nothing about the shop's other books. She has add_sales and
  nothing else.
*/
set test.user_id = '66666666-6666-6666-6666-666666666666';
do $$
declare
  v_mine int;
begin
  raise notice '--- phase 10: a staff member with only add_sales ---';

  if (select count(*) from public.collections where kind = 'apparel_payment') <> 0 then
    raise exception 'FAIL: add_sales alone showed apparel payments in the feed';
  end if;
  raise notice 'PASS: apparel payments are invisible without the apparel permission';

  if (select count(*) from public.collections where kind = 'repair_payment') <> 0 then
    raise exception 'FAIL: add_sales alone showed repair payments in the feed';
  end if;
  raise notice 'PASS: repair payments are invisible without the DabzTech permission';

  -- Her own sale, and only her own: she has no view_daily_sales_report yet.
  select count(*) into v_mine from public.collections where kind = 'counter_sale';
  if v_mine <> 1 then
    raise exception 'FAIL: expected only her own sale in the feed, got %', v_mine;
  end if;
  raise notice 'PASS: she sees the one sale she rang up, and no others';

  -- And she cannot take an apparel payment, however she asks.
  begin
    perform public.record_apparel_payment(
      (select id from public.apparel_orders limit 1),
      10000, current_date, 'cash_drawer', 'balance', null, null,
      jsonb_build_array(jsonb_build_object(
        'category', 'sublimation_jerseys', 'amount_centavos', 10000))
    );
    raise exception 'FAIL: add_sales alone took an apparel payment';
  exception when insufficient_privilege then
    raise notice 'PASS: taking an apparel payment needs the apparel permission';
  end;

  begin
    perform public.record_repair_payment(
      (select id from public.repair_tickets limit 1),
      10000, current_date, 'cash_drawer', null, null,
      jsonb_build_array(jsonb_build_object(
        'category', 'laptop_repair', 'amount_centavos', 10000)),
      'balance'
    );
    raise exception 'FAIL: add_sales alone took a repair payment';
  exception when insufficient_privilege then
    raise notice 'PASS: taking a repair payment needs the DabzTech permission';
  end;
end;
$$;

-- The daily sales report permission widens the COUNTER, and nothing else.
set test.user_id = '11111111-1111-1111-1111-111111111111';
insert into public.user_permissions (user_id, permission) values
  ('66666666-6666-6666-6666-666666666666', 'view_daily_sales_report');

set test.user_id = '66666666-6666-6666-6666-666666666666';
do $$
declare
  v_sales int;
begin
  raise notice '--- phase 10: with the daily sales report permission ---';

  select count(*) into v_sales from public.collections where kind = 'counter_sale';
  if v_sales < 2 then
    raise exception 'FAIL: the daily report permission did not widen the counter, got %', v_sales;
  end if;
  raise notice 'PASS: she now sees every counter sale (%)', v_sales;

  -- The one that matters: the daily sales report is NOT a way into the other
  -- two divisions' books.
  if (select count(*) from public.collections
      where kind in ('apparel_payment', 'repair_payment')) <> 0 then
    raise exception 'FAIL: the daily sales report permission leaked the apparel and DabzTech books';
  end if;
  raise notice 'PASS: it still shows nothing of Apparel or DabzTech';
end;
$$;

-- Juan has both division permissions, so he sees those rows - and still only
-- his own counter sales, because he has no daily report permission.
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  raise notice '--- phase 10: a staff member with both division permissions ---';

  if (select count(*) from public.collections where kind = 'apparel_payment') = 0 then
    raise exception 'FAIL: the apparel permission did not show apparel payments';
  end if;
  if (select count(*) from public.collections where kind = 'repair_payment') = 0 then
    raise exception 'FAIL: the DabzTech permission did not show repair payments';
  end if;
  raise notice 'PASS: each division permission opens its own door and no other';

  if exists (
    select 1 from public.collections c
    join public.sales s on s.id = c.id
    where c.kind = 'counter_sale'
      and s.created_by <> '33333333-3333-3333-3333-333333333333'
  ) then
    raise exception 'FAIL: he saw a counter sale that is not his';
  end if;
  raise notice 'PASS: the counter is still his own sales only';
end;
$$;

/*
  A deactivated account sees nothing at all, whatever it was allowed before
  (spec 13.1).

  This is the test that found the gap `0015` closes: `sales_read_own` compared
  `created_by` to `auth.uid()` and checked nothing else, so a dismissed staff
  member's own sales stayed readable. Sign-in already refused them, but RLS is
  the boundary and must not lean on the layer in front of it.
*/
set test.user_id = '11111111-1111-1111-1111-111111111111';
update public.profiles set status = 'inactive' where username = 'nena';

set test.user_id = '66666666-6666-6666-6666-666666666666';
do $$
begin
  raise notice '--- phase 10: a deactivated account ---';

  if (select count(*) from public.collections) <> 0 then
    raise exception 'FAIL: a deactivated account still reads the feed';
  end if;
  raise notice 'PASS: a deactivated account sees nothing in the feed';

  -- And not through the underlying tables either, which is where the hole was.
  if (select count(*) from public.sales) <> 0 then
    raise exception 'FAIL: a deactivated account still reads its own sales';
  end if;
  if (select count(*) from public.sale_lines) <> 0 then
    raise exception 'FAIL: a deactivated account still reads its own sale lines';
  end if;
  raise notice 'PASS: it cannot reach its own old sales either';
end;
$$;

-- Put her back, so the reading below is about permissions and not about status.
set test.user_id = '11111111-1111-1111-1111-111111111111';
update public.profiles set status = 'active' where username = 'nena';

set test.user_id = '66666666-6666-6666-6666-666666666666';
do $$
begin
  if (select count(*) from public.collections) = 0 then
    raise exception 'FAIL: reactivating the account did not give the feed back';
  end if;
  raise notice 'PASS: reactivating the account gives the feed back';
end;
$$;

-- Nobody at all: the feed is not a public page.
set test.user_id = '';
do $$
begin
  if (select count(*) from public.collections) <> 0 then
    raise exception 'FAIL: the feed answered somebody who is not signed in';
  end if;
  raise notice 'PASS: the feed says nothing to anyone not signed in';
end;
$$;

-- ---------------------------------------------------------------------------
-- The feed is a view of records, never a way to write one
-- ---------------------------------------------------------------------------

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  raise notice '--- phase 10: the feed writes nothing ---';

  /*
    A three-table UNION view is not auto-updatable in PostgreSQL, so this
    already cannot happen - but it is worth pinning down, because the whole
    design rests on there being exactly three ways money reaches the ledger.
    If somebody ever added INSTEAD OF triggers to make the feed writable,
    this is the test that would object.
  */
  begin
    insert into public.collections (id, kind, division, amount_centavos)
    values (gen_random_uuid(), 'counter_sale', 'printshoppe', 100);
    raise exception 'FAIL: something was written through the collections feed';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: nothing can be written through the feed';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- The day closing remembers its breakdown
-- ---------------------------------------------------------------------------

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_missing text;
begin
  raise notice '--- phase 10: the day closing ---';

  -- All nullable, so a day closed before Phase 10 keeps saying nothing rather
  -- than claiming every door took zero.
  for v_missing in
    select column_name from (values
      ('counter_cash_centavos'), ('counter_total_centavos'),
      ('apparel_cash_centavos'), ('apparel_total_centavos'),
      ('apparel_down_payment_centavos'), ('apparel_balance_centavos'),
      ('dabztech_cash_centavos'), ('dabztech_total_centavos'),
      ('dabztech_down_payment_centavos'), ('dabztech_balance_centavos'),
      ('owners_pocket_centavos')
    ) as wanted(column_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'day_closings'
        and c.column_name = wanted.column_name
        and c.is_nullable = 'YES'
    )
  loop
    raise exception 'FAIL: day_closings is missing a nullable %', v_missing;
  end loop;
  raise notice 'PASS: a closed day can remember its breakdown, and an old one can stay silent';
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading the three tables directly shows exactly what the feed shows
-- ---------------------------------------------------------------------------

/*
  The claim the app's fallback rests on, checked as SQL.

  When `public.collections` is not in the database - which is what happened to
  the owner's on 21 September 2026, because migration 0015 had never been
  applied - the app reads `sales`, `apparel_payments` and `repair_payments`
  directly instead, so the Sales screen can still show the day. That is only
  safe because the view is `security_invoker`: it holds no privilege of its
  own, so it can never have been showing LESS than the three tables show.

  "Can never have been" is the part worth proving rather than asserting. If it
  were ever false - a policy tightened on the view's owner, a future migration
  that filtered rows inside the view - the fallback would be a leak, and it
  would be a leak that no screen could see. So: ask as five different people,
  and require the two answers to be the same set, row for row.

  The apparel and repair joins are INNER on purpose, because the view's are:
  a payment whose order or ticket this person may not read is not theirs, and
  the app drops those rows for the same reason.
*/

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_user text;
  v_differences int;
  v_rows int;
  v_checked int := 0;
begin
  raise notice '--- phase 10: the feed and the tables under it agree, per person ---';

  foreach v_user in array array[
    '11111111-1111-1111-1111-111111111111',  -- the owner
    '22222222-2222-2222-2222-222222222222',  -- an admin
    '33333333-3333-3333-3333-333333333333',  -- both division permissions
    '66666666-6666-6666-6666-666666666666',  -- the counter, and the daily report
    ''                                        -- nobody at all
  ]
  loop
    perform set_config('test.user_id', v_user, false);

    with feed as (
      select id, amount_centavos from public.collections
    ),
    direct as (
      select s.id, s.total_centavos as amount_centavos
        from public.sales s
      union all
      select p.id, p.amount_centavos
        from public.apparel_payments p
        join public.apparel_orders o on o.id = p.order_id
      union all
      select p.id, p.amount_centavos
        from public.repair_payments p
        join public.repair_tickets t on t.id = p.ticket_id
    )
    select count(*) into v_differences from (
      (select * from feed except all select * from direct)
      union all
      (select * from direct except all select * from feed)
    ) as disagreement;

    if v_differences <> 0 then
      raise exception 'FAIL: % row(s) differ between the feed and the tables under it, as %',
        v_differences, coalesce(nullif(v_user, ''), 'nobody');
    end if;

    select count(*) into v_rows from public.collections;
    v_checked := v_checked + v_rows;
  end loop;

  /*
    And the check has to have had something to chew on. Five people all seeing
    nothing would satisfy every line above while proving nothing at all - the
    same trap as a test that passes because its fixture never loaded.
  */
  if v_checked = 0 then
    raise exception 'FAIL: nobody saw any payments, so this check proved nothing';
  end if;

  raise notice 'PASS: five people, % rows, and the two ways of asking agree every time', v_checked;
end;
$$;

do $$
begin
  raise notice 'ALL PHASE 10 TESTS PASSED';
end;
$$;

reset role;
