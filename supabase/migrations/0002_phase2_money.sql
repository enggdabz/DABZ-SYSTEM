-- Phase 2: bills, loans and the money in / money out ledger.
--
-- Seeded with the owner's real figures from specification sections 12.1 and
-- 12.2: eleven bills totalling PHP 141,127 a month, and six loans totalling
-- PHP 1,336,264 confirmed.
--
-- Two things are deliberately left empty, because the owner has not supplied
-- them yet (open decision 17.13) and a guess would be worse than a blank:
--   * every bill's due day
--   * every loan's interest rate
-- The screens ask for them and show a clear warning until they are filled in.
--
-- Money is stored as integer centavos throughout, so PHP 141,127 is 14112700.

-- ---------------------------------------------------------------------------
-- Bills (spec 12.1)
-- ---------------------------------------------------------------------------

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  amount_centavos bigint not null check (amount_centavos >= 0),

  -- Null means "the owner has not told us yet", which the screens surface as
  -- a warning. 1-31; a bill due on the 31st falls on the last day of a short
  -- month, which the app works out rather than storing.
  due_day smallint check (due_day between 1 and 31),

  type text not null default 'operating'
    check (type in ('operating', 'loan_installment')),

  -- Set when paying this bill also pays down a loan (spec 12.1).
  loan_id uuid,

  -- Deactivating keeps the history, like staff accounts.
  active boolean not null default true,
  note text,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.bills is
  'The fixed monthly bills. due_day null means the owner has not set it yet.';

-- ---------------------------------------------------------------------------
-- Loans (spec 12.2)
-- ---------------------------------------------------------------------------

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  lender text not null check (length(btrim(lender)) > 0),

  -- The balance as printed on a statement, plus the date it was true. Payments
  -- recorded after that date are subtracted; payments before it are already
  -- part of the figure (spec 12.2, "Update from statement").
  statement_balance_centavos bigint not null check (statement_balance_centavos >= 0),
  statement_date date not null,

  -- Null when the loan has no fixed monthly payment.
  monthly_payment_centavos bigint check (monthly_payment_centavos >= 0),

  -- Percent per month. Null until the owner reads it off a statement. Without
  -- it the system cannot say whether a balance is growing, so it says nothing
  -- rather than guessing.
  interest_percent_per_month numeric(6, 3)
    check (interest_percent_per_month >= 0 and interest_percent_per_month <= 100),

  note text,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.loans is
  'Money the shop owes. interest_percent_per_month null means unknown, not zero.';

-- Now that loans exist, tie the installment bills to them.
alter table public.bills
  drop constraint if exists bills_loan_id_fkey;
alter table public.bills
  add constraint bills_loan_id_fkey
  foreign key (loan_id) references public.loans (id) on delete set null;

-- ---------------------------------------------------------------------------
-- The ledger (spec 10)
-- ---------------------------------------------------------------------------

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),

  direction text not null check (direction in ('in', 'out')),
  amount_centavos bigint not null check (amount_centavos > 0),

  -- Which division, or the whole shop for shared costs (spec 1.1, 11).
  tag text not null
    check (tag in ('printshoppe', 'apparel', 'dabztech', 'whole_shop')),

  -- Kept as text rather than an enum so a new category is a code change, not
  -- a migration. The app validates it against its own list.
  category text not null,

  -- Where the money physically came from or went (spec 10.3).
  source text not null
    check (source in ('cash_drawer', 'gcash', 'bank', 'owners_pocket')),

  note text,

  -- Which record created this entry, for the automatic ones (spec 10.4). Lets
  -- an undo find and remove exactly the entry it made.
  source_table text,
  source_id uuid,

  -- Money records are never hard-deleted by staff (spec 2.1). A mistake is
  -- voided, which leaves the row and the reason in place.
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,

  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.ledger_entries is
  'Every peso in and out. Most rows are created automatically by other modules.';

create index if not exists ledger_entries_occurred_at_idx
  on public.ledger_entries (occurred_at desc);
create index if not exists ledger_entries_source_idx
  on public.ledger_entries (source_table, source_id);
create index if not exists ledger_entries_tag_idx
  on public.ledger_entries (tag, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Bill payments: one row per bill per month it was paid (spec 12.1)
-- ---------------------------------------------------------------------------

create table if not exists public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills (id) on delete cascade,

  -- The month this payment settles, as the first day of that month. Storing a
  -- real date rather than "2026-09" lets PostgreSQL sort and compare it.
  period_month date not null,

  amount_centavos bigint not null check (amount_centavos >= 0),
  paid_on date not null,
  source text not null
    check (source in ('cash_drawer', 'gcash', 'bank', 'owners_pocket')),
  note text,

  -- The ledger entry and loan payment this created, so undo can remove them.
  ledger_entry_id uuid references public.ledger_entries (id) on delete set null,
  loan_payment_id uuid,

  created_at timestamptz not null default now(),
  created_by uuid,

  -- A bill can only be paid once per month. This is what makes "Mark paid"
  -- safe to press twice, and what keeps September's payment out of October.
  constraint bill_payments_one_per_month unique (bill_id, period_month),
  -- Guards against a period of "2026-09-15", which would break month grouping.
  constraint bill_payments_period_is_month_start
    check (date_trunc('month', period_month) = period_month)
);

comment on table public.bill_payments is
  'One row per bill per month paid. The unique constraint prevents double payment.';

-- ---------------------------------------------------------------------------
-- Loan payments (spec 12.2)
-- ---------------------------------------------------------------------------

create table if not exists public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,

  amount_centavos bigint not null check (amount_centavos > 0),
  paid_on date not null,
  note text,

  -- 'bill' when this came from marking a linked bill paid, 'manual' when the
  -- owner recorded it directly.
  origin text not null default 'manual' check (origin in ('manual', 'bill')),

  ledger_entry_id uuid references public.ledger_entries (id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists loan_payments_loan_idx
  on public.loan_payments (loan_id, paid_on desc);

alter table public.bill_payments
  drop constraint if exists bill_payments_loan_payment_id_fkey;
alter table public.bill_payments
  add constraint bill_payments_loan_payment_id_fkey
  foreign key (loan_payment_id) references public.loan_payments (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Keep updated_at honest
-- ---------------------------------------------------------------------------

drop trigger if exists bills_touch_updated_at on public.bills;
create trigger bills_touch_updated_at
  before update on public.bills
  for each row execute function public.touch_updated_at();

drop trigger if exists loans_touch_updated_at on public.loans;
create trigger loans_touch_updated_at
  before update on public.loans
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Bills, loans and the ledger are Owner/Admin only. Spec 4.3 puts bills,
-- loans and full reports beyond what any staff checkbox can grant, so there is
-- deliberately no staff-facing policy here at all - not even read.

alter table public.bills enable row level security;
alter table public.loans enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.bill_payments enable row level security;
alter table public.loan_payments enable row level security;

do $$
declare
  target text;
begin
  foreach target in array array[
    'bills', 'loans', 'ledger_entries', 'bill_payments', 'loan_payments'
  ]
  loop
    execute format('drop policy if exists %1$s_owner_admin_read on public.%1$s', target);
    execute format(
      'create policy %1$s_owner_admin_read on public.%1$s for select using (public.is_owner_or_admin())',
      target
    );

    execute format('drop policy if exists %1$s_owner_admin_insert on public.%1$s', target);
    execute format(
      'create policy %1$s_owner_admin_insert on public.%1$s for insert with check (public.is_owner_or_admin())',
      target
    );

    execute format('drop policy if exists %1$s_owner_admin_update on public.%1$s', target);
    execute format(
      'create policy %1$s_owner_admin_update on public.%1$s for update using (public.is_owner_or_admin()) with check (public.is_owner_or_admin())',
      target
    );
  end loop;
end;
$$;

-- Deletes are allowed only where they are the honest undo of a mistake:
--
--   * bill_payments  - "Mark paid" has an undo (spec 12.1), and the row means
--                      "this bill was paid this month". Undoing it must remove
--                      it, not leave a contradiction behind.
--   * loan_payments  - removed with the bill payment that created them.
--
-- Bills and loans themselves are deactivated, never deleted, so their history
-- survives. Ledger entries are voided, never deleted (spec 2.1).
drop policy if exists bill_payments_owner_admin_delete on public.bill_payments;
create policy bill_payments_owner_admin_delete on public.bill_payments
  for delete using (public.is_owner_or_admin());

drop policy if exists loan_payments_owner_admin_delete on public.loan_payments;
create policy loan_payments_owner_admin_delete on public.loan_payments
  for delete using (public.is_owner_or_admin());

-- ---------------------------------------------------------------------------
-- Seed data: the owner's real bills and loans
-- ---------------------------------------------------------------------------
-- Guarded so re-running this migration cannot create a second copy.

insert into public.loans (lender, statement_balance_centavos, statement_date, monthly_payment_centavos, note)
select * from (values
  ('Lupa',           45000000::bigint, current_date, 2000000::bigint, 'Paid through the "Lupa Lilimasan" bill. Interest rate not yet known.'),
  ('BPI',            30000000::bigint, current_date, 3325000::bigint, 'Interest rate not yet known.'),
  ('Credit card 3',  50000000::bigint, current_date, 1200000::bigint, 'Owner to check the statement for the interest rate (spec 12.2).'),
  ('Cenpelco',        5000000::bigint, current_date, null::bigint,    'No fixed monthly payment recorded yet.'),
  ('Credit card 2',   1913700::bigint, current_date, null::bigint,    'Interest rate not yet known.'),
  ('Credit card 1',   1712700::bigint, current_date, null::bigint,    'Interest rate not yet known.')
) as seed(lender, statement_balance_centavos, statement_date, monthly_payment_centavos, note)
where not exists (select 1 from public.loans);

insert into public.bills (name, amount_centavos, type, loan_id, note)
select
  seed.name,
  seed.amount_centavos,
  seed.type,
  -- Ties the installment bills to the loans just inserted.
  (select l.id from public.loans l where l.lender = seed.lender_name),
  seed.note
from (values
  ('Electricity',     3500000::bigint, 'operating',         null,             null),
  ('Water',            150000::bigint, 'operating',         null,             null),
  ('Internet',         210000::bigint, 'operating',         null,             null),
  ('Magic Payment',    167700::bigint, 'operating',         null,             'Owner to confirm what this covers (spec 17.13).'),
  ('BIR',              150000::bigint, 'operating',         null,             null),
  ('Rent',            2000000::bigint, 'operating',         null,             null),
  ('CP Plan',          450000::bigint, 'operating',         null,             null),
  ('Lupa Lilimasan',  2000000::bigint, 'loan_installment',  'Lupa',           null),
  ('BPI',             3325000::bigint, 'loan_installment',  'BPI',            null),
  ('Credit card',     1200000::bigint, 'loan_installment',  'Credit card 3',  null),
  ('Forests Lake',     960000::bigint, 'loan_installment',  null,             'Owner to confirm what this covers, and whether it has a loan balance (spec 17.13).')
) as seed(name, amount_centavos, type, lender_name, note)
where not exists (select 1 from public.bills);

-- ---------------------------------------------------------------------------
-- Marking a bill paid, as one transaction
-- ---------------------------------------------------------------------------
-- Paying a bill touches three tables: it records the payment, adds a money-out
-- entry to the ledger, and - for the installment bills - records a payment
-- against the loan.
--
-- Doing that as three separate requests from the app risks the worst possible
-- outcome: the ledger says PHP 33,250 left the bank but the loan balance never
-- moved. A database function runs all three inside one transaction, so either
-- everything happens or nothing does.
--
-- SECURITY INVOKER (the default) is deliberate: these run as the person who
-- called them, so Row Level Security still decides whether they are allowed.

create or replace function public.mark_bill_paid(
  p_bill_id uuid,
  p_period_month date,
  p_amount_centavos bigint,
  p_paid_on date,
  p_source text,
  p_note text default null
)
returns uuid
language plpgsql
as $$
declare
  v_bill public.bills;
  v_ledger_id uuid;
  v_loan_payment_id uuid := null;
  v_payment_id uuid;
  v_category text;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then
    raise exception 'That bill no longer exists.';
  end if;

  if date_trunc('month', p_period_month) <> p_period_month then
    raise exception 'The period must be the first day of a month.';
  end if;

  -- A loan installment is a loan payment; everything else is a fixed bill
  -- (spec 10.2).
  v_category := case
    when v_bill.type = 'loan_installment' then 'loan_payments'
    else 'fixed_bills'
  end;

  insert into public.ledger_entries (
    occurred_at, direction, amount_centavos, tag, category, source, note,
    source_table, source_id, created_by
  )
  values (
    p_paid_on::timestamptz, 'out', p_amount_centavos, 'whole_shop', v_category,
    p_source,
    coalesce(p_note, v_bill.name || ' for ' || to_char(p_period_month, 'FMMonth YYYY')),
    'bill_payments', null, auth.uid()
  )
  returning id into v_ledger_id;

  -- Paying a linked bill pays down its loan too (spec 12.1).
  if v_bill.loan_id is not null then
    insert into public.loan_payments (
      loan_id, amount_centavos, paid_on, note, origin, ledger_entry_id, created_by
    )
    values (
      v_bill.loan_id, p_amount_centavos, p_paid_on,
      'From the "' || v_bill.name || '" bill for ' || to_char(p_period_month, 'FMMonth YYYY'),
      'bill', v_ledger_id, auth.uid()
    )
    returning id into v_loan_payment_id;
  end if;

  -- Last, so the unique constraint on (bill, month) is what rejects a double
  -- payment - and because this statement is inside the same transaction, the
  -- ledger entry above is rolled back with it.
  insert into public.bill_payments (
    bill_id, period_month, amount_centavos, paid_on, source, note,
    ledger_entry_id, loan_payment_id, created_by
  )
  values (
    p_bill_id, p_period_month, p_amount_centavos, p_paid_on, p_source, p_note,
    v_ledger_id, v_loan_payment_id, auth.uid()
  )
  returning id into v_payment_id;

  -- Point the ledger entry back at the payment, now that it has an id.
  update public.ledger_entries
     set source_id = v_payment_id
   where id = v_ledger_id;

  return v_payment_id;
end;
$$;

comment on function public.mark_bill_paid is
  'Records a bill payment, its ledger entry and any loan payment in one transaction.';

create or replace function public.undo_bill_payment(
  p_bill_id uuid,
  p_period_month date,
  p_reason text default 'Mark paid was undone'
)
returns void
language plpgsql
as $$
declare
  v_payment public.bill_payments;
begin
  select * into v_payment
    from public.bill_payments
   where bill_id = p_bill_id and period_month = p_period_month;

  if not found then
    raise exception 'That bill is not marked paid for this month.';
  end if;

  -- The ledger entry is VOIDED rather than deleted. Money records are never
  -- erased (spec 2.1) - the trail has to show that a payment was recorded and
  -- then taken back, not pretend it never happened.
  if v_payment.ledger_entry_id is not null then
    update public.ledger_entries
       set voided_at = now(),
           voided_by = auth.uid(),
           void_reason = p_reason
     where id = v_payment.ledger_entry_id;
  end if;

  -- The loan payment IS removed, because it is not a record of money moving -
  -- it is the claim that this loan's balance went down, and that claim is now
  -- false. Leaving it would understate the debt.
  if v_payment.loan_payment_id is not null then
    delete from public.loan_payments where id = v_payment.loan_payment_id;
  end if;

  delete from public.bill_payments where id = v_payment.id;
end;
$$;

comment on function public.undo_bill_payment is
  'Undoes Mark paid: voids the ledger entry, removes the loan payment, clears the month.';

-- Anyone signed in may call them; the policies inside decide what actually
-- happens, and both start by reading a table only Owner/Admin can see.
grant execute on function public.mark_bill_paid(uuid, date, bigint, date, text, text) to authenticated;
grant execute on function public.undo_bill_payment(uuid, date, text) to authenticated;
