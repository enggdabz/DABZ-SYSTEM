-- Security and money tests for Phase 5: expenses, stocks and payables
-- (spec 11, 14, and the staff expense limit from spec 4.3).
--
-- The rules that matter most here:
--   * A staff expense above the limit must move NO money until the owner says.
--   * A stock level is added up from movements, never stored - so nothing can
--     make the number disagree with its own history.
--   * Supplier payables are debt, so staff cannot see them at all.

\set ON_ERROR_STOP on

set role authenticated;

-- ---- Structure -----------------------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  raise notice '--- phase 5: structure ---';

  if (select count(*) from public.expense_presets) <> 8 then
    raise exception 'FAIL: expected the 8 seeded quick picks';
  end if;
  raise notice 'PASS: the expense quick picks are seeded';

  -- The owner's usual amounts are open decision 17.14, so none was invented.
  if (select count(default_amount_centavos) from public.expense_presets) <> 0 then
    raise exception 'FAIL: a usual amount was invented for a quick pick';
  end if;
  raise notice 'PASS: no usual amount was invented';

  -- And no materials, units or reorder levels were invented either (17.15).
  if (select count(*) from public.stock_items) <> 0 then
    raise exception 'FAIL: a stock item was invented';
  end if;
  raise notice 'PASS: no stock item was invented';

  -- A movement that moves nothing is noise in a history meant to be traced.
  insert into public.stock_items (id, name, unit, tag, reorder_level_thousandths)
  values ('aaaaaaa1-0000-0000-0000-000000000001', 'Bond paper A4', 'ream', 'printshoppe', 5000);

  begin
    insert into public.stock_movements (stock_item_id, kind, delta_thousandths, created_by)
    values ('aaaaaaa1-0000-0000-0000-000000000001', 'in', 0,
            '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: a zero movement was allowed';
  exception when check_violation then
    raise notice 'PASS: a movement of nothing is rejected';
  end;
end;
$$;

-- ---- The owner records an expense ----------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_expense uuid;
  v_row public.expenses;
  v_ledger public.ledger_entries;
begin
  raise notice '--- phase 5: the owner spends ---';

  v_expense := public.record_expense(
    current_date, 480000, 'materials_supplies', 'printshoppe', 'cash_drawer',
    null, '20 reams bond paper'
  );

  select * into v_row from public.expenses where id = v_expense;

  if v_row.status <> 'approved' then
    raise exception 'FAIL: the owner was held up by the owner''s own limit';
  end if;
  raise notice 'PASS: the owner is never held up by the staff expense limit';

  if v_row.ledger_entry_id is null then
    raise exception 'FAIL: an approved expense left no ledger entry';
  end if;

  select * into v_ledger from public.ledger_entries where id = v_row.ledger_entry_id;

  if v_ledger.direction <> 'out' or v_ledger.amount_centavos <> 480000 then
    raise exception 'FAIL: the ledger entry does not match the expense';
  end if;
  if v_ledger.source_table <> 'expenses' or v_ledger.source_id <> v_expense then
    raise exception 'FAIL: the ledger entry does not point back at its expense';
  end if;
  raise notice 'PASS: an approved expense writes exactly one matching ledger entry';

  -- An expense of nothing is a mistake, not an entry.
  begin
    perform public.record_expense(
      current_date, 0, 'materials_supplies', 'printshoppe', 'cash_drawer', null, null
    );
    raise exception 'FAIL: an expense of zero was allowed';
  exception when raise_exception then
    if position('needs an amount' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS: an expense needs an amount';
  end;
end;
$$;

-- ---- A staff member under the limit --------------------------------------
-- Juan has add_sales only, so he may not record expenses at all yet.
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  raise notice '--- phase 5: permission ---';

  begin
    perform public.record_expense(
      current_date, 10000, 'meals_snacks', 'whole_shop', 'cash_drawer', null, 'Snacks'
    );
    raise exception 'FAIL: a staff member without the permission recorded an expense';
  exception when insufficient_privilege then
    raise notice 'PASS: recording an expense needs the permission';
  end;
end;
$$;

set test.user_id = '11111111-1111-1111-1111-111111111111';
insert into public.user_permissions (user_id, permission) values
  ('33333333-3333-3333-3333-333333333333', 'record_expenses'),
  ('33333333-3333-3333-3333-333333333333', 'stock_in_out');

set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_expense uuid;
  v_row public.expenses;
  v_limit bigint;
begin
  raise notice '--- phase 5: staff spending ---';

  select staff_expense_approval_limit_centavos into v_limit
  from public.app_settings where id = 1;

  -- Exactly at the limit is allowed: the limit is what staff MAY spend.
  v_expense := public.record_expense(
    current_date, v_limit, 'meals_snacks', 'whole_shop', 'cash_drawer', null, 'At the limit'
  );
  select * into v_row from public.expenses where id = v_expense;
  if v_row.status <> 'approved' then
    raise exception 'FAIL: an expense exactly at the limit was held';
  end if;
  raise notice 'PASS: a staff expense at the limit goes straight in';

  -- One centavo above it waits, and NOTHING is counted meanwhile.
  v_expense := public.record_expense(
    current_date, v_limit + 1, 'materials_supplies', 'printshoppe', 'cash_drawer',
    null, 'Over the limit'
  );
  select * into v_row from public.expenses where id = v_expense;

  if v_row.status <> 'pending' then
    raise exception 'FAIL: a staff expense above the limit was not held';
  end if;
  if v_row.ledger_entry_id is not null then
    raise exception 'FAIL: a waiting expense moved money before it was approved';
  end if;
  if exists (
    select 1 from public.ledger_entries
    where source_table = 'expenses' and source_id = v_expense
  ) then
    raise exception 'FAIL: a waiting expense left a ledger entry behind';
  end if;
  raise notice 'PASS: a staff expense above the limit moves no money at all';

  -- A staff member cannot approve their own expense.
  begin
    perform public.decide_expense(v_expense, true, 'Approving my own');
    raise exception 'FAIL: a staff member approved their own expense';
  exception when insufficient_privilege then
    raise notice 'PASS: a staff member cannot approve their own expense';
  end;

  -- Nor reach the table directly to do it.
  begin
    update public.expenses set status = 'approved' where id = v_expense;
    if found then
      raise exception 'FAIL: a staff member edited an expense directly';
    end if;
    raise notice 'PASS: nobody can edit an expense row directly';
  exception when insufficient_privilege then
    raise notice 'PASS: nobody can edit an expense row directly';
  end;
end;
$$;

-- ---- A staff member sees their own expenses, and no payables -------------
set test.user_id = '44444444-4444-4444-4444-444444444444';
do $$
begin
  raise notice '--- phase 5: what staff can see ---';

  -- Rosa recorded nothing, so she sees nothing - not even Juan's entries.
  if (select count(*) from public.expenses) <> 0 then
    raise exception 'FAIL: a staff member can read another person''s expenses';
  end if;
  raise notice 'PASS: a staff member sees only their own expenses';

  if (select count(*) from public.supplier_payables) <> 0 then
    raise exception 'FAIL: a staff member can read supplier payables';
  end if;
  raise notice 'PASS: supplier payables are invisible to staff, like bills and loans';
end;
$$;

-- ---- The owner decides ---------------------------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_pending uuid;
  v_row public.expenses;
  v_before bigint;
begin
  raise notice '--- phase 5: approving ---';

  select id into v_pending from public.expenses where status = 'pending' limit 1;

  select count(*) into v_before from public.ledger_entries;

  perform public.decide_expense(v_pending, true, 'Fine');

  select * into v_row from public.expenses where id = v_pending;

  if v_row.status <> 'approved' or v_row.ledger_entry_id is null then
    raise exception 'FAIL: approving did not record the money';
  end if;
  if (select count(*) from public.ledger_entries) <> v_before + 1 then
    raise exception 'FAIL: approving wrote the wrong number of ledger entries';
  end if;
  if v_row.decided_by is null or v_row.decided_at is null then
    raise exception 'FAIL: approving did not record who decided';
  end if;
  raise notice 'PASS: approving writes the money and records who decided';

  -- Deciding twice would pay twice.
  begin
    perform public.decide_expense(v_pending, true, 'Again');
    raise exception 'FAIL: the same expense was approved twice';
  exception when raise_exception then
    if position('already been decided' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS: an expense cannot be decided twice';
  end;
end;
$$;

do $$
declare
  v_expense uuid;
  v_row public.expenses;
begin
  raise notice '--- phase 5: refusing ---';

  -- Make a fresh pending one by lowering the limit below what staff just spent.
  update public.app_settings set staff_expense_approval_limit_centavos = 100 where id = 1;

  set local test.user_id = '33333333-3333-3333-3333-333333333333';
  v_expense := public.record_expense(
    current_date, 90000, 'miscellaneous', 'whole_shop', 'cash_drawer', null, 'Something odd'
  );

  set local test.user_id = '11111111-1111-1111-1111-111111111111';
  perform public.decide_expense(v_expense, false, 'Not ours');

  select * into v_row from public.expenses where id = v_expense;

  if v_row.status <> 'rejected' then
    raise exception 'FAIL: refusing did not mark the expense';
  end if;
  if v_row.ledger_entry_id is not null
     or exists (select 1 from public.ledger_entries
                where source_table = 'expenses' and source_id = v_expense) then
    raise exception 'FAIL: a refused expense left money behind';
  end if;
  raise notice 'PASS: a refused expense leaves no money trace at all';

  update public.app_settings set staff_expense_approval_limit_centavos = 200000 where id = 1;
end;
$$;

-- ---- Stock: the level is the history -------------------------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_item uuid := 'aaaaaaa1-0000-0000-0000-000000000001';
  v_on_hand bigint;
  v_movement uuid;
  v_expense_count int;
begin
  raise notice '--- phase 5: stock ---';

  -- 20 reams at ₱240.00, paid out of the drawer.
  v_movement := public.record_stock_in(
    v_item, 20000, 24000, null, '20 reams', true, 'cash_drawer', null
  );

  select count(*) into v_expense_count
  from public.expenses e
  join public.stock_movements m on m.expense_id = e.id
  where m.id = v_movement;

  if v_expense_count <> 1 then
    raise exception 'FAIL: receiving paid stock did not record the purchase';
  end if;

  -- 20 × ₱240.00 = ₱4,800.00
  if (select e.amount_centavos from public.expenses e
      join public.stock_movements m on m.expense_id = e.id
      where m.id = v_movement) <> 480000 then
    raise exception 'FAIL: the purchase cost was worked out wrongly';
  end if;
  raise notice 'PASS: receiving paid stock records the shelf and the money together';

  -- Take some out.
  insert into public.stock_movements (stock_item_id, kind, delta_thousandths, created_by)
  values (v_item, 'out', -2500, '33333333-3333-3333-3333-333333333333');

  select coalesce(sum(delta_thousandths), 0) into v_on_hand
  from public.stock_movements where stock_item_id = v_item;

  if v_on_hand <> 17500 then
    raise exception 'FAIL: the stock level does not match its movements, got %', v_on_hand;
  end if;
  raise notice 'PASS: the stock level is exactly the sum of its movements';

  -- Append-only: a mistake is corrected, never erased.
  begin
    update public.stock_movements set delta_thousandths = 1
    where stock_item_id = v_item and kind = 'out';
    if found then
      raise exception 'FAIL: a stock movement was edited';
    end if;
    raise notice 'PASS: a stock movement cannot be edited';
  exception when insufficient_privilege then
    raise notice 'PASS: a stock movement cannot be edited';
  end;

  begin
    delete from public.stock_movements where stock_item_id = v_item and kind = 'out';
    if found then
      raise exception 'FAIL: a stock movement was deleted';
    end if;
    raise notice 'PASS: a stock movement cannot be deleted';
  exception when insufficient_privilege then
    raise notice 'PASS: a stock movement cannot be deleted';
  end;

  -- Staff cannot invent a material, because its unit and reorder level are the
  -- owner's to decide.
  begin
    insert into public.stock_items (name, unit) values ('Invented', 'piece');
    raise exception 'FAIL: a staff member added a stock item';
  exception when insufficient_privilege then
    raise notice 'PASS: only Owner/Admin maintain the materials list';
  end;
end;
$$;

-- ---- Rosa has no stock permission ----------------------------------------
set test.user_id = '44444444-4444-4444-4444-444444444444';
do $$
begin
  begin
    insert into public.stock_movements (stock_item_id, kind, delta_thousandths, created_by)
    values ('aaaaaaa1-0000-0000-0000-000000000001', 'out', -1000,
            '44444444-4444-4444-4444-444444444444');
    raise exception 'FAIL: a staff member without the permission moved stock';
  exception when insufficient_privilege then
    raise notice 'PASS: moving stock needs the permission';
  end;
end;
$$;

-- ---- Receiving on account, and paying the supplier -----------------------
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_item uuid := 'aaaaaaa1-0000-0000-0000-000000000001';
  v_movement uuid;
  v_payable uuid;
begin
  raise notice '--- phase 5: payables ---';

  -- 2.5 reams at ₱240.00 = ₱600.00, not paid yet.
  v_movement := public.record_stock_in(
    v_item, 2500, 24000, null, 'On account', false, null, current_date + 15
  );

  select payable_id into v_payable from public.stock_movements where id = v_movement;

  if v_payable is null then
    raise exception 'FAIL: receiving unpaid stock did not raise a payable';
  end if;
  raise notice 'PASS: stock received unpaid becomes a supplier payable';
end;
$$;

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_payable uuid;
  v_row public.supplier_payables;
  v_ledger uuid;
begin
  select id into v_payable from public.supplier_payables where status = 'unpaid' limit 1;

  if (select amount_centavos from public.supplier_payables where id = v_payable) <> 60000 then
    raise exception 'FAIL: 2.5 reams at PHP 240.00 did not come to PHP 600.00';
  end if;
  raise notice 'PASS: a fractional delivery costs the right amount';

  v_ledger := public.pay_supplier_payable(v_payable, current_date, 'cash_drawer');

  select * into v_row from public.supplier_payables where id = v_payable;

  if v_row.status <> 'paid' or v_row.ledger_entry_id is null then
    raise exception 'FAIL: paying a supplier did not record it';
  end if;
  if (select amount_centavos from public.ledger_entries where id = v_ledger) <> v_row.amount_centavos then
    raise exception 'FAIL: the ledger entry does not match the payable';
  end if;
  raise notice 'PASS: paying a supplier writes the ledger entry and marks it paid, together';

  -- Paying twice would take the money twice.
  begin
    perform public.pay_supplier_payable(v_payable, current_date, 'cash_drawer');
    raise exception 'FAIL: the same payable was paid twice';
  exception when raise_exception then
    if position('already paid' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS: a payable cannot be paid twice';
  end;

  -- And a paid payable is frozen by the policy, not only by the function.
  update public.supplier_payables set amount_centavos = 1 where id = v_payable;
  if found then
    raise exception 'FAIL: a paid payable was edited';
  end if;
  raise notice 'PASS: a paid payable can never be edited again';
end;
$$;

-- ---- A refused delivery leaves nothing behind ----------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_movements_before int;
  v_expenses_before int;
begin
  raise notice '--- phase 5: one transaction ---';

  select count(*) into v_movements_before from public.stock_movements;
  select count(*) into v_expenses_before from public.expenses;

  -- A quantity of nothing is refused, and must take the whole thing with it.
  begin
    perform public.record_stock_in(
      'aaaaaaa1-0000-0000-0000-000000000001', 0, 24000, null, null, true, 'cash_drawer', null
    );
    raise exception 'FAIL: stock was received with no quantity';
  exception when raise_exception then
    if position('needs a quantity' in sqlerrm) = 0 then raise; end if;
  end;

  if (select count(*) from public.stock_movements) <> v_movements_before
     or (select count(*) from public.expenses) <> v_expenses_before then
    raise exception 'FAIL: a refused delivery left something behind';
  end if;
  raise notice 'PASS: a refused delivery leaves no movement and no expense';
end;
$$;

do $$
begin
  raise notice 'ALL PHASE 5 TESTS PASSED';
end;
$$;
