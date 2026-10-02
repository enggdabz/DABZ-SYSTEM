-- Paying a bill in parts (the owner's request, 2 Oct 2026: "an option if it
-- paid first with certain amount, then to follow the full payment. In the
-- bill, we just see the remaining amount for that bill").
--
-- Until now a bill had at most one payment a month, and that payment meant
-- "settled". Now a month may also hold PART payments (is_partial = true)
-- before the one that settles it.
--
-- Whether a payment settles the bill is the OWNER'S choice, made on the form,
-- not worked out by adding the parts up. Electricity is never the same amount
-- two months running: a bill whose usual figure is 3,500 may be settled by
-- 3,180, or need 3,900. Deciding "settled" from arithmetic against the usual
-- figure would be guessing what only the owner knows.
--
-- What does not change:
--   * one SETTLING payment per bill per month - now a partial unique index
--     rather than the table constraint, so pressing "Mark paid" twice is
--     still refused by the database;
--   * every payment writes its own ledger entry and, for a linked installment,
--     its own loan payment, in the same transaction (mark_bill_paid);
--   * undo voids the ledger entry and removes the loan payment.

alter table public.bill_payments
  add column if not exists is_partial boolean not null default false;

comment on column public.bill_payments.is_partial is
  'True for a part payment (0030). The month is settled only by a row where this is false.';

alter table public.bill_payments
  drop constraint if exists bill_payments_one_per_month;

create unique index if not exists bill_payments_one_settling_per_month
  on public.bill_payments (bill_id, period_month)
  where not is_partial;

comment on table public.bill_payments is
  'Bill payments: any number of part payments a month, and at most one that settles it (0030).';

-- The signature gains a parameter, so the old one is dropped first: two
-- versions side by side would make every call with six arguments ambiguous.
drop function if exists public.mark_bill_paid(uuid, date, bigint, date, text, text);

create or replace function public.mark_bill_paid(
  p_bill_id uuid,
  p_period_month date,
  p_amount_centavos bigint,
  p_paid_on date,
  p_source text,
  p_note text default null,
  p_is_partial boolean default false
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
  v_what text;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then
    raise exception 'That bill no longer exists.';
  end if;

  if date_trunc('month', p_period_month) <> p_period_month then
    raise exception 'The period must be the first day of a month.';
  end if;

  if p_is_partial and coalesce(p_amount_centavos, 0) <= 0 then
    raise exception 'A part payment has to be more than zero.';
  end if;

  -- A part payment after the month is settled would be money paid against a
  -- bill that is not owed. Refused the way a second "Mark paid" is, so the
  -- app can say the same sentence for both.
  if exists (
    select 1 from public.bill_payments
     where bill_id = p_bill_id and period_month = p_period_month and not is_partial
  ) then
    raise exception 'That bill is already paid for this month.'
      using errcode = 'unique_violation';
  end if;

  v_category := case
    when v_bill.type = 'loan_installment' then 'loan_payments'
    else 'fixed_bills'
  end;

  v_what := case when p_is_partial then 'Part payment of ' else '' end
    || v_bill.name || ' for ' || to_char(p_period_month, 'FMMonth YYYY');

  insert into public.ledger_entries (
    occurred_at, direction, amount_centavos, tag, category, source, note,
    source_table, source_id, created_by
  )
  values (
    p_paid_on::timestamptz, 'out', p_amount_centavos, 'whole_shop', v_category,
    p_source, coalesce(p_note, v_what),
    'bill_payments', null, auth.uid()
  )
  returning id into v_ledger_id;

  -- Paying a linked bill pays down its loan too (spec 12.1) - a part payment
  -- by exactly the part, so the balance only moves by money that moved.
  if v_bill.loan_id is not null then
    insert into public.loan_payments (
      loan_id, amount_centavos, paid_on, note, origin, ledger_entry_id, created_by
    )
    values (
      v_bill.loan_id, p_amount_centavos, p_paid_on,
      'From the "' || v_bill.name || '" bill for ' || to_char(p_period_month, 'FMMonth YYYY')
        || case when p_is_partial then ' (part payment)' else '' end,
      'bill', v_ledger_id, auth.uid()
    )
    returning id into v_loan_payment_id;
  end if;

  -- Last, so the unique index is what rejects a second settling payment that
  -- slipped past the check above - and the ledger entry rolls back with it.
  insert into public.bill_payments (
    bill_id, period_month, amount_centavos, paid_on, source, note,
    ledger_entry_id, loan_payment_id, created_by, is_partial
  )
  values (
    p_bill_id, p_period_month, p_amount_centavos, p_paid_on, p_source, p_note,
    v_ledger_id, v_loan_payment_id, auth.uid(), p_is_partial
  )
  returning id into v_payment_id;

  update public.ledger_entries
     set source_id = v_payment_id
   where id = v_ledger_id;

  return v_payment_id;
end;
$$;

comment on function public.mark_bill_paid is
  'Records a bill payment (whole or part), its ledger entry and any loan payment in one transaction.';

-- Undo now takes back the LATEST payment of that month: the settling one if
-- there is one (it is always last), otherwise the most recent part payment.
-- Pressing it again takes back the one before, one step at a time.
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
   where bill_id = p_bill_id and period_month = p_period_month
   order by is_partial asc, created_at desc, id desc
   limit 1;

  if not found then
    raise exception 'That bill has no payment for this month.';
  end if;

  if v_payment.ledger_entry_id is not null then
    update public.ledger_entries
       set voided_at = now(),
           voided_by = auth.uid(),
           void_reason = p_reason
     where id = v_payment.ledger_entry_id;
  end if;

  if v_payment.loan_payment_id is not null then
    delete from public.loan_payments where id = v_payment.loan_payment_id;
  end if;

  delete from public.bill_payments where id = v_payment.id;
end;
$$;

comment on function public.undo_bill_payment is
  'Undoes the latest payment of a bill for a month: voids its ledger entry, removes its loan payment.';

grant execute on function public.mark_bill_paid(uuid, date, bigint, date, text, text, boolean) to authenticated;
grant execute on function public.undo_bill_payment(uuid, date, text) to authenticated;
