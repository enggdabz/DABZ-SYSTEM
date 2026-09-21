-- Phase 10: one counter, all three divisions (spec: docs/SPEC-PHASE10-CONNECT.md).
--
-- Money already comes into the shop through three doors - the Counter, a Dabz
-- Apparel job order and a DabzTech repair ticket - and all three already write
-- to the same ledger. What was missing was a way to SEE them together, and a
-- way to take an apparel or repair payment without leaving the counter.
--
-- So this migration adds almost no new storage. It adds:
--
--   1. `kind` on a DabzTech payment, so a down payment can be told from a
--      balance the way an apparel payment already can. Nullable, because an
--      old payment's kind is not something anybody can now know.
--   2. `public.collections` - a VIEW, not a table. One row per money event
--      across the three doors. It stores nothing and can therefore never fall
--      out of step with the rows underneath it, the same reasoning as the
--      reports in Phase 8.
--   3. Nullable per-division columns on `day_closings`, so a day that has been
--      counted remembers which door its money came through.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- It does not create a new way for money to reach the ledger. Every peso still
-- arrives through complete_sale, record_apparel_payment or
-- record_repair_payment. A feed that could write would be a second truth.

-- ---------------------------------------------------------------------------
-- 1. A DabzTech payment says whether it is a down payment or a balance
-- ---------------------------------------------------------------------------

-- Nullable on purpose, with no default: an apparel payment has carried a kind
-- since 0007, but a repair payment has not, and guessing what an old one was
-- would be inventing a fact. Those rows read as plain "Payment" on screen.
alter table public.repair_payments
  add column if not exists kind text
    check (kind in ('down_payment', 'balance'));

comment on column public.repair_payments.kind is
  'down_payment or balance. Null on payments taken before Phase 10 - not guessed.';

/*
  record_repair_payment gains p_kind.

  The old seven-argument version is DROPPED rather than left beside the new
  one. `create or replace` with an extra parameter does not replace anything -
  it adds an overload - and then a call with seven arguments is ambiguous and
  PostgreSQL refuses it. Worse, a caller that did resolve to the old one would
  write a payment with no kind and nobody would notice.

  p_kind is last and defaults to null so a caller that does not pass it still
  works, and gets exactly the behaviour it had before.
*/
drop function if exists public.record_repair_payment(
  uuid, bigint, date, text, text, text, jsonb
);

create or replace function public.record_repair_payment(
  p_ticket_id uuid,
  p_amount_centavos bigint,
  p_paid_on date,
  p_source text,
  p_reference_number text,
  p_note text,
  -- [{category, amount_centavos}], worked out by splitTicketPayment so the
  -- parts add back up to the payment exactly.
  p_ledger jsonb,
  p_kind text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_id uuid;
  v_ticket public.repair_tickets;
  v_split_total bigint;
begin
  -- SECURITY DEFINER for the same reason as complete_sale, record_expense and
  -- record_apparel_payment: the ledger is Owner/Admin only, but a technician
  -- with the DabzTech permission has to be able to take money for a repair.
  if not public.has_permission('dabztech_tickets') then
    raise exception 'You do not have permission to take repair payments.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_amount_centavos is null or p_amount_centavos <= 0 then
    raise exception 'A payment needs an amount.';
  end if;

  -- An unknown kind is refused rather than quietly stored as null: null means
  -- "taken before Phase 10", and a typo must not be able to manufacture one.
  if p_kind is not null and p_kind not in ('down_payment', 'balance') then
    raise exception 'A payment is either a down payment or a balance.';
  end if;

  select * into v_ticket from public.repair_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'That ticket no longer exists.';
  end if;

  select coalesce(sum((entry ->> 'amount_centavos')::bigint), 0)
  into v_split_total
  from jsonb_array_elements(p_ledger) as entry;

  if v_split_total <> p_amount_centavos then
    raise exception 'The payment split does not add up to the payment.';
  end if;

  insert into public.repair_payments (
    ticket_id, amount_centavos, paid_on, source, kind, reference_number, note,
    created_by
  )
  values (
    p_ticket_id, p_amount_centavos, coalesce(p_paid_on, current_date), p_source,
    p_kind, nullif(btrim(p_reference_number), ''), nullif(btrim(p_note), ''),
    auth.uid()
  )
  returning id into v_payment_id;

  insert into public.ledger_entries (
    direction, amount_centavos, tag, category, source, note,
    source_table, source_id, created_by
  )
  select
    'in',
    (entry ->> 'amount_centavos')::bigint,
    'dabztech',
    entry ->> 'category',
    p_source,
    'Repair ' || v_ticket.ticket_number,
    'repair_payments',
    v_payment_id,
    auth.uid()
  from jsonb_array_elements(p_ledger) as entry
  where (entry ->> 'amount_centavos')::bigint > 0;

  return v_payment_id;
end;
$$;

comment on function public.record_repair_payment is
  'Records a repair payment and its ledger entries together, split across the checking fee, labour and parts.';

grant execute on function public.record_repair_payment(
  uuid, bigint, date, text, text, text, jsonb, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The collections feed
-- ---------------------------------------------------------------------------

/*
  One row per money event, across all three doors.

  SECURITY INVOKER is the whole point. A view normally runs with the
  privileges of whoever created it, which would hand every signed-in person
  every row - a staff member with only Add sales would suddenly be reading the
  apparel and DabzTech books, one row at a time, which is exactly what spec 4.3
  forbids. With security_invoker the existing policies on sales,
  apparel_payments and repair_payments still decide what comes back, and this
  view inherits all three without restating any of them.

  So: never make this SECURITY DEFINER, and never add a policy "for the view" -
  a view has none, and adding one to a table to make the view work would open
  that table everywhere else too.

  WHICH TIMESTAMP IS "WHEN"
  taken_at is the moment the row was WRITTEN (occurred_at on a sale,
  created_at on a payment), not the date somebody typed into "Paid on". It has
  to be, because the matching ledger entry is stamped with the same now() in
  the same transaction, and the feed's totals are required to equal the
  ledger's for any day. recorded_for carries the typed date as well, so a
  backdated payment can still say so on screen.
*/

drop view if exists public.collections;

create view public.collections
with (security_invoker = true) as

  -- The Counter. A sale's ledger entries are tagged by the DIVISION of each
  -- line, so one sale can put money under apparel and dabztech; here the
  -- division is the DOOR the money came through, which is always the counter.
  select
    s.id,
    'counter_sale'::text            as kind,
    'printshoppe'::text             as division,
    'sale'::text                    as payment_kind,
    s.sale_number                   as reference,
    -- What the row LINKS to. For a payment this is the order or the ticket,
    -- which is not the payment's own id - and the screen needs both, so the
    -- view carries both rather than making every read go looking.
    s.id                            as parent_id,
    s.customer_id,
    c.name                          as customer_name,
    s.total_centavos                as amount_centavos,
    -- The same mapping complete_sale uses when it writes the ledger entry, so
    -- the two can never disagree about which column a sale lands in.
    case s.payment_method
      when 'cash'  then 'cash_drawer'
      when 'gcash' then 'gcash'
      when 'maya'  then 'maya'
      when 'bank'  then 'bank'
      else 'cash_drawer'
    end                             as source,
    s.reference_number,
    s.occurred_at                   as taken_at,
    s.sale_date                     as recorded_for,
    s.created_by                    as taken_by,
    s.voided_at
  from public.sales s
  left join public.customers c on c.id = s.customer_id

union all

  -- Dabz Apparel: a down payment or a balance on a job order.
  select
    p.id,
    'apparel_payment'::text,
    'apparel'::text,
    p.kind,
    o.order_number,
    p.order_id,
    o.customer_id,
    coalesce(c.name, o.team_name),
    p.amount_centavos,
    p.source,
    p.reference_number,
    p.created_at,
    p.paid_on,
    p.created_by,
    p.voided_at
  from public.apparel_payments p
  join public.apparel_orders o on o.id = p.order_id
  left join public.customers c on c.id = o.customer_id

union all

  -- DabzTech Solutions: a down payment, a balance, or - on a payment taken
  -- before Phase 10 - a kind nobody recorded.
  select
    p.id,
    'repair_payment'::text,
    'dabztech'::text,
    p.kind,
    t.ticket_number,
    p.ticket_id,
    t.customer_id,
    t.customer_name,
    p.amount_centavos,
    p.source,
    p.reference_number,
    p.created_at,
    p.paid_on,
    p.created_by,
    p.voided_at
  from public.repair_payments p
  join public.repair_tickets t on t.id = p.ticket_id;

comment on view public.collections is
  'Every payment taken at any of the three doors. A view, so it stores nothing and cannot disagree with the rows under it. security_invoker: the policies on sales, apparel_payments and repair_payments decide what each person sees.';

grant select on public.collections to authenticated;

-- The feed is read by day and by range, so each door needs its own index on
-- the timestamp the feed sorts and filters by.
create index if not exists sales_occurred_idx
  on public.sales (occurred_at desc);
create index if not exists apparel_payments_created_idx
  on public.apparel_payments (created_at desc);
create index if not exists repair_payments_created_idx
  on public.repair_payments (created_at desc);

-- ---------------------------------------------------------------------------
-- 3. A deactivated account reads nothing, including its own old sales
-- ---------------------------------------------------------------------------

/*
  Found by the Phase 10 test, and older than Phase 10.

  Spec 13.1 says a deactivated account can do nothing at all, and every other
  policy in the system obeys it by going through `current_role_name()` or
  `has_permission()`, both of which answer null / false once an account is
  switched off. These three did not: they compared `created_by` to `auth.uid()`
  and nothing else, so a dismissed staff member with a live token could still
  read back the sales they rang up.

  In practice sign-in already refuses them (`requireUser` redirects on an
  inactive profile), so nothing was leaking through a screen. But RLS is the
  boundary, not the screens, and a boundary that relies on the layer in front
  of it is not one.

  Adding the check costs an active person nothing - `current_role_name()` is
  non-null for exactly the people the policy already allowed.
*/

drop policy if exists sales_read_own on public.sales;
create policy sales_read_own on public.sales
  for select using (
    created_by = auth.uid() and public.current_role_name() is not null
  );

drop policy if exists sale_lines_read_own on public.sale_lines;
create policy sale_lines_read_own on public.sale_lines
  for select using (
    public.current_role_name() is not null
    and exists (
      select 1 from public.sales s
      where s.id = sale_id and s.created_by = auth.uid()
    )
  );

drop policy if exists void_requests_read_own on public.void_requests;
create policy void_requests_read_own on public.void_requests
  for select using (
    requested_by = auth.uid() and public.current_role_name() is not null
  );

-- ---------------------------------------------------------------------------
-- 4. A closed day remembers which door its money came through
-- ---------------------------------------------------------------------------

/*
  All nullable, all without a default.

  A day closed before Phase 10 has no breakdown and never will, and zero is
  not the same answer as "not recorded" - a row of zeroes beside a day that
  took PHP 8,000 reads as a fault in the system. The screen says "Breakdown not
  recorded for this day" instead.

  Cash is stored per division as well as the totals, because cash is the one
  that can go missing: "the drawer is PHP 200 short" is only traceable if the
  day remembers that PHP 200 of its cash came in through DabzTech.
*/
alter table public.day_closings
  add column if not exists counter_cash_centavos bigint,
  add column if not exists counter_total_centavos bigint,

  add column if not exists apparel_cash_centavos bigint,
  add column if not exists apparel_total_centavos bigint,
  add column if not exists apparel_down_payment_centavos bigint,
  add column if not exists apparel_balance_centavos bigint,

  add column if not exists dabztech_cash_centavos bigint,
  add column if not exists dabztech_total_centavos bigint,
  add column if not exists dabztech_down_payment_centavos bigint,
  add column if not exists dabztech_balance_centavos bigint,

  -- Money a customer handed over that went into the owner's pocket rather than
  -- the drawer. It is takings, so it belongs in the day's total - but it is
  -- NOT drawer cash, so folding it into the cash figure would make an honest
  -- drawer look short by exactly that amount.
  add column if not exists owners_pocket_centavos bigint;

comment on column public.day_closings.counter_cash_centavos is
  'Cash taken at the counter. Null on days closed before Phase 10 - not zero.';
comment on column public.day_closings.owners_pocket_centavos is
  'Takings that went to the owner directly. Never part of the drawer count.';
