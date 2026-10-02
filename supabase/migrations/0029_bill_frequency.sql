-- One-time bills, and the month a bill starts counting (the owner's request,
-- 2 Oct 2026: "add an option if it is a 1 time bill or monthly bill. Also add
-- bills that are not paid for last month in the next month bills").
--
-- frequency    'monthly' comes back every month; 'one_time' is owed once.
-- starts_month The first month a monthly bill counts, or the one month a
--              one-time bill is for. Always the first day of a month.
--
-- Nothing here touches money. Carrying an unpaid month forward is worked out
-- by the app from bill_payments, which already holds one row per bill per
-- month paid - so there is nothing new to store, and a carried-over bill is
-- paid by the same mark_bill_paid, against the month it was owed in.

alter table public.bills
  add column if not exists frequency text not null default 'monthly'
    check (frequency in ('monthly', 'one_time')),
  add column if not exists starts_month date
    default (date_trunc('month', (now() at time zone 'Asia/Manila')))::date
    check (starts_month is null or starts_month = date_trunc('month', starts_month)::date);

comment on column public.bills.frequency is
  'monthly or one_time (0029). A one-time bill is owed only in starts_month.';
comment on column public.bills.starts_month is
  'First month a monthly bill counts, or the month a one-time bill is for (0029). First day of the month, Manila.';

-- Adding the column filled every existing row with THIS month. Every row here
-- existed before this migration, so each is set instead to the month it was
-- entered, read in Manila. Earlier months are not turned into unpaid ones: the shop
-- did not have these bills in the system then, and calling them owed would be
-- a backlog nobody said existed.
update public.bills
   set starts_month = date_trunc('month', (created_at at time zone 'Asia/Manila'))::date;

alter table public.bills
  drop constraint if exists bills_one_time_has_month;
alter table public.bills
  add constraint bills_one_time_has_month
    check (frequency <> 'one_time' or starts_month is not null);
