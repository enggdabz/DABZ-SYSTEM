-- Phase 3: staff, attendance, weekly payroll and cash advances (spec 13).
--
-- ONE DESIGN DECISION WORTH UNDERSTANDING
--
-- Spec 13.1 says a login is optional: "some staff may only use the time clock".
-- So an EMPLOYEE and an ACCOUNT are two different things here:
--
--   profiles  = someone who can sign in            (created in Phase 1)
--   staff     = someone the shop employs and pays  (this file)
--
-- A staff row may point at a profile, or at nothing at all. That is why staff
-- is a separate table rather than more columns on profiles - profiles.id has to
-- be a real Supabase Auth user, and a helper who only ever taps the time clock
-- has no reason to have one.
--
-- As in Phase 2, a figure only the owner can know is left NULL rather than
-- guessed: daily_rate_centavos starts empty and the screens ask for it.

-- ---------------------------------------------------------------------------
-- Staff (spec 13.1)
-- ---------------------------------------------------------------------------

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),

  -- The login, if this person has one. Deleting the account leaves the
  -- employment record and its payroll history untouched.
  profile_id uuid unique references public.profiles (id) on delete set null,

  full_name text not null check (length(btrim(full_name)) > 0),
  position text,

  -- Path inside the Supabase Storage bucket. Null shows initials instead.
  photo_path text,

  contact_number text,
  address text,
  emergency_contact_name text,
  emergency_contact_number text,
  start_date date,

  -- Null means the owner has not set it yet. Payroll refuses to guess.
  daily_rate_centavos bigint check (daily_rate_centavos >= 0),

  -- Which divisions this person works in (spec 1.1, 13.1).
  divisions text[] not null default '{}',

  -- Spec 13.1: deactivating keeps all history.
  status text not null default 'active' check (status in ('active', 'inactive')),
  note text,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.staff is
  'People the shop employs. profile_id is null for staff who only use the time clock.';

create index if not exists staff_status_idx on public.staff (status, full_name);

-- ---------------------------------------------------------------------------
-- Attendance: the time clock (spec 13.2)
-- ---------------------------------------------------------------------------

create table if not exists public.attendance_entries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,

  -- The Manila calendar date this shift belongs to. Stored as a plain date so
  -- a shift is never split across two days by a timezone.
  work_date date not null,

  time_in timestamptz,
  time_out timestamptz,
  note text,

  -- Who tapped the button. On a shared counter computer this is not always the
  -- person themselves, so it is recorded and shown (see the policy note below).
  recorded_by uuid,

  -- Set when an Owner/Admin fixes a forgotten time-out (spec 13.2).
  corrected_by uuid,
  corrected_at timestamptz,

  created_at timestamptz not null default now(),

  -- One shift per person per day. This is what makes "Time in" safe to press
  -- twice, and keeps the payroll table one row per day.
  constraint attendance_one_per_day unique (staff_id, work_date),
  -- A shift cannot end before it starts.
  constraint attendance_out_after_in check (time_out is null or time_in is null or time_out >= time_in)
);

comment on table public.attendance_entries is
  'One row per person per day. time_out null means they have not timed out yet.';

create index if not exists attendance_work_date_idx
  on public.attendance_entries (work_date desc);

-- ---------------------------------------------------------------------------
-- Weekly payroll (spec 13.3)
-- ---------------------------------------------------------------------------

create table if not exists public.payroll_weeks (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,

  -- The first day of the payroll week, per the week-start setting.
  week_start date not null,

  -- The rate is COPIED here when the week is created, not read from staff at
  -- payslip time. Otherwise giving someone a raise would silently rewrite what
  -- they were paid last month.
  daily_rate_centavos bigint not null check (daily_rate_centavos >= 0),

  bonus_centavos bigint not null default 0 check (bonus_centavos >= 0),
  advance_deduction_centavos bigint not null default 0
    check (advance_deduction_centavos >= 0),

  -- Stored alongside the day rows so a payslip can be reprinted years later
  -- and still show the figures that were actually paid.
  gross_centavos bigint not null default 0 check (gross_centavos >= 0),
  net_centavos bigint not null default 0 check (net_centavos >= 0),

  status text not null default 'draft' check (status in ('draft', 'paid')),
  paid_on date,
  paid_source text
    check (paid_source in ('cash_drawer', 'gcash', 'bank', 'owners_pocket')),

  -- Spec 13.3: a paid week is locked; the Owner can unlock it with a reason.
  unlocked_at timestamptz,
  unlocked_by uuid,
  unlock_reason text,

  ledger_entry_id uuid references public.ledger_entries (id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),

  constraint payroll_one_week_per_staff unique (staff_id, week_start),
  -- A paid week must say when and how it was paid.
  constraint payroll_paid_has_details
    check (status = 'draft' or (paid_on is not null and paid_source is not null))
);

comment on table public.payroll_weeks is
  'One row per person per week. daily_rate_centavos is a snapshot, not a live lookup.';

create table if not exists public.payroll_days (
  id uuid primary key default gen_random_uuid(),
  payroll_week_id uuid not null references public.payroll_weeks (id) on delete cascade,
  work_date date not null,

  -- The owner's choice for this day (spec 13.3, open decision 17.6).
  -- A half day pays half the daily rate.
  day_type text not null default 'absent'
    check (day_type in ('full', 'half', 'absent')),

  -- Recorded whether or not they are paid (spec 13.3).
  overtime_hours numeric(5, 2) not null default 0 check (overtime_hours >= 0),
  -- The owner's per-day choice: 0 means "no OT pay", which is a decision.
  overtime_pay_centavos bigint not null default 0
    check (overtime_pay_centavos >= 0),

  constraint payroll_days_one_per_date unique (payroll_week_id, work_date)
);

-- ---------------------------------------------------------------------------
-- Cash advances, "vale" (spec 13.4)
-- ---------------------------------------------------------------------------

create table if not exists public.cash_advances (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,

  amount_centavos bigint not null check (amount_centavos > 0),
  advanced_on date not null,
  source text not null
    check (source in ('cash_drawer', 'gcash', 'bank', 'owners_pocket')),
  reason text,

  -- Spec 13.4: how the owner intends to get it back.
  deduction_plan text not null default 'decide_on_payday'
    check (deduction_plan in ('next_payday', 'in_parts', 'decide_on_payday')),

  ledger_entry_id uuid references public.ledger_entries (id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.cash_advances is
  'Money advanced against future wages. Money out of the shop on the day it is given.';

create table if not exists public.advance_deductions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  payroll_week_id uuid references public.payroll_weeks (id) on delete cascade,

  amount_centavos bigint not null check (amount_centavos > 0),
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.advance_deductions is
  'Repayments taken out of a payslip. Balance owed = advances less deductions.';

create index if not exists advance_deductions_staff_idx
  on public.advance_deductions (staff_id);

drop trigger if exists staff_touch_updated_at on public.staff;
create trigger staff_touch_updated_at
  before update on public.staff
  for each row execute function public.touch_updated_at();

drop trigger if exists payroll_weeks_touch_updated_at on public.payroll_weeks;
create trigger payroll_weeks_touch_updated_at
  before update on public.payroll_weeks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Helper: which staff row belongs to the signed-in person
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER for the same reason as the Phase 1 helpers: a policy on
-- `staff` cannot read `staff` without recursing.

create or replace function public.my_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id
  from public.staff s
  where s.profile_id = auth.uid()
  limit 1;
$$;

comment on function public.my_staff_id() is
  'The staff row linked to the signed-in account, or null if there is none.';

/*
  Is this person still employed?

  SECURITY DEFINER matters here, and the reason is subtle. The time clock policy
  has to check that the person being clocked in is active - but a staff member
  can only SEE their own row in `staff`. A plain sub-query inside the policy
  would therefore find nothing when one person clocks in a colleague, and the
  shared time clock would refuse every entry but your own. This function reads
  `staff` without RLS so the check answers the question actually being asked.
*/
create or replace function public.is_active_staff(p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.staff
     where id = p_staff_id and status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Spec 4.3 keeps salaries and payroll to Owner/Admin. Spec 4.4 adds that each
-- staff member sees their OWN attendance and payslips - so the rule is "mine,
-- or everything if you are Owner/Admin", never "everyone's".

alter table public.staff enable row level security;
alter table public.attendance_entries enable row level security;
alter table public.payroll_weeks enable row level security;
alter table public.payroll_days enable row level security;
alter table public.cash_advances enable row level security;
alter table public.advance_deductions enable row level security;

-- ---- staff ---------------------------------------------------------------

drop policy if exists staff_read_own on public.staff;
create policy staff_read_own on public.staff
  for select using (profile_id = auth.uid());

drop policy if exists staff_read_all on public.staff;
create policy staff_read_all on public.staff
  for select using (public.is_owner_or_admin());

drop policy if exists staff_write on public.staff;
create policy staff_write on public.staff
  for all
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

-- ---- attendance ----------------------------------------------------------

drop policy if exists attendance_read_own on public.attendance_entries;
create policy attendance_read_own on public.attendance_entries
  for select using (staff_id = public.my_staff_id());

drop policy if exists attendance_read_all on public.attendance_entries;
create policy attendance_read_all on public.attendance_entries
  for select using (public.is_owner_or_admin());

/*
  THE TIME CLOCK, AND A TRADE-OFF WORTH KNOWING ABOUT

  Spec 13.2 has staff tap their own photo to time in, and spec 4.1 is explicit
  that logging in is not timing in. On one shared counter computer that means
  whoever is signed in taps the button for whoever is arriving - so any signed-
  in, active person may record attendance for any active staff member.

  The cost is that a staff member could clock in a colleague who has not
  arrived. The guard against that is `recorded_by`: every entry stores who
  pressed the button, and the time clock and payroll screens show it, so a
  pattern of one person clocking in another is visible to the owner.

  If the owner would rather each person clocked in only themselves - which
  needs every staff member to have a login, and answers open decision 17.2 -
  this is the policy to tighten: add `and staff_id = public.my_staff_id()`.
*/
drop policy if exists attendance_clock_in on public.attendance_entries;
create policy attendance_clock_in on public.attendance_entries
  for insert
  with check (
    public.current_role_name() is not null
    and public.is_active_staff(staff_id)
  );

drop policy if exists attendance_clock_out on public.attendance_entries;
create policy attendance_clock_out on public.attendance_entries
  for update
  using (
    public.is_owner_or_admin()
    -- Anyone signed in may complete a shift that has not been timed out yet.
    or (public.current_role_name() is not null and time_out is null)
  )
  with check (public.current_role_name() is not null);

-- Only Owner/Admin may remove an entry entirely (spec 13.2).
drop policy if exists attendance_delete on public.attendance_entries;
create policy attendance_delete on public.attendance_entries
  for delete using (public.is_owner_or_admin());

-- ---- payroll -------------------------------------------------------------
-- Staff may read their own payslips, and nothing else about payroll.

drop policy if exists payroll_weeks_read_own on public.payroll_weeks;
create policy payroll_weeks_read_own on public.payroll_weeks
  for select using (staff_id = public.my_staff_id());

drop policy if exists payroll_weeks_read_all on public.payroll_weeks;
create policy payroll_weeks_read_all on public.payroll_weeks
  for select using (public.is_owner_or_admin());

/*
  A PAID WEEK IS LOCKED (spec 13.3)

  The `using` clause only matches draft weeks, so once a week is marked paid
  the database itself refuses to change its figures - not the app, the
  database. Unlocking goes through unlock_payroll_week(), which records who
  did it and why.
*/
drop policy if exists payroll_weeks_insert on public.payroll_weeks;
create policy payroll_weeks_insert on public.payroll_weeks
  for insert with check (public.is_owner_or_admin());

drop policy if exists payroll_weeks_update_draft on public.payroll_weeks;
create policy payroll_weeks_update_draft on public.payroll_weeks
  for update
  using (public.is_owner_or_admin() and status = 'draft')
  with check (public.is_owner_or_admin());

drop policy if exists payroll_weeks_delete_draft on public.payroll_weeks;
create policy payroll_weeks_delete_draft on public.payroll_weeks
  for delete using (public.is_owner_or_admin() and status = 'draft');

drop policy if exists payroll_days_read_own on public.payroll_days;
create policy payroll_days_read_own on public.payroll_days
  for select using (
    exists (
      select 1 from public.payroll_weeks w
      where w.id = payroll_week_id and w.staff_id = public.my_staff_id()
    )
  );

drop policy if exists payroll_days_read_all on public.payroll_days;
create policy payroll_days_read_all on public.payroll_days
  for select using (public.is_owner_or_admin());

-- The day rows of a paid week are locked along with the week itself.
drop policy if exists payroll_days_write_draft on public.payroll_days;
create policy payroll_days_write_draft on public.payroll_days
  for all
  using (
    public.is_owner_or_admin()
    and exists (
      select 1 from public.payroll_weeks w
      where w.id = payroll_week_id and w.status = 'draft'
    )
  )
  with check (
    public.is_owner_or_admin()
    and exists (
      select 1 from public.payroll_weeks w
      where w.id = payroll_week_id and w.status = 'draft'
    )
  );

-- ---- cash advances -------------------------------------------------------
-- Staff may see what they owe, which they are entitled to know.

drop policy if exists cash_advances_read_own on public.cash_advances;
create policy cash_advances_read_own on public.cash_advances
  for select using (staff_id = public.my_staff_id());

drop policy if exists cash_advances_read_all on public.cash_advances;
create policy cash_advances_read_all on public.cash_advances
  for select using (public.is_owner_or_admin());

drop policy if exists cash_advances_write on public.cash_advances;
create policy cash_advances_write on public.cash_advances
  for all
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

drop policy if exists advance_deductions_read_own on public.advance_deductions;
create policy advance_deductions_read_own on public.advance_deductions
  for select using (staff_id = public.my_staff_id());

drop policy if exists advance_deductions_read_all on public.advance_deductions;
create policy advance_deductions_read_all on public.advance_deductions
  for select using (public.is_owner_or_admin());

drop policy if exists advance_deductions_write on public.advance_deductions;
create policy advance_deductions_write on public.advance_deductions
  for all
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

-- ---------------------------------------------------------------------------
-- Paying wages, as one transaction
-- ---------------------------------------------------------------------------
-- Marking payroll paid does three things: it records the money leaving the
-- shop, it takes any cash advance off the balance owed, and it locks the week.
-- Done as three separate requests, a failure halfway through could leave the
-- ledger saying wages were paid while the staff member still owes the full
-- advance - or the week unlocked and payable twice.

create or replace function public.mark_payroll_paid(
  p_week_id uuid,
  p_paid_on date,
  p_source text
)
returns uuid
language plpgsql
as $$
declare
  v_week public.payroll_weeks;
  v_staff public.staff;
  v_ledger_id uuid;
begin
  select * into v_week from public.payroll_weeks where id = p_week_id;
  if not found then
    raise exception 'That payroll week no longer exists.';
  end if;

  if v_week.status = 'paid' then
    raise exception 'That week is already marked paid.';
  end if;

  if v_week.net_centavos <= 0 and v_week.gross_centavos <= 0 then
    raise exception 'There is nothing to pay for that week.';
  end if;

  select * into v_staff from public.staff where id = v_week.staff_id;

  -- Wages leaving the shop (spec 10.2, "Salaries").
  insert into public.ledger_entries (
    occurred_at, direction, amount_centavos, tag, category, source, note,
    source_table, source_id, created_by
  )
  values (
    p_paid_on::timestamptz, 'out', v_week.net_centavos, 'whole_shop', 'salaries',
    p_source,
    'Wages for ' || coalesce(v_staff.full_name, 'staff') ||
      ', week of ' || to_char(v_week.week_start, 'FMDD Mon YYYY'),
    'payroll_weeks', p_week_id, auth.uid()
  )
  returning id into v_ledger_id;

  -- The cash advance repayment, if the owner chose to take one this payday.
  -- Recorded here rather than when the week was drafted, because it only
  -- actually happens when the wages are handed over.
  if v_week.advance_deduction_centavos > 0 then
    insert into public.advance_deductions (
      staff_id, payroll_week_id, amount_centavos, created_by
    )
    values (
      v_week.staff_id, p_week_id, v_week.advance_deduction_centavos, auth.uid()
    );
  end if;

  update public.payroll_weeks
     set status = 'paid',
         paid_on = p_paid_on,
         paid_source = p_source,
         ledger_entry_id = v_ledger_id,
         unlocked_at = null,
         unlocked_by = null,
         unlock_reason = null
   where id = p_week_id;

  return v_ledger_id;
end;
$$;

comment on function public.mark_payroll_paid is
  'Pays a payroll week: ledger entry, advance deduction and lock, in one transaction.';

/*
  Reopening a paid week.

  SECURITY DEFINER, and that is the point. The update policy on payroll_weeks
  only matches DRAFT weeks, so once a week is paid the database refuses to
  change it - including refusing this function, if it ran as the caller. Making
  it definer means this is the ONE sanctioned way past the lock, rather than
  loosening the policy and letting a paid week be edited directly.

  Because it bypasses RLS, it does its own checking first: owner only, reason
  required (spec 13.3).
*/
create or replace function public.unlock_payroll_week(
  p_week_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_week public.payroll_weeks;
begin
  -- Spec 13.3: only the Owner may unlock a paid week, and must give a reason.
  if not public.is_owner() then
    raise exception 'Only the owner can unlock a paid week.';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why the week is being unlocked.';
  end if;

  select * into v_week from public.payroll_weeks where id = p_week_id;
  if not found then
    raise exception 'That payroll week no longer exists.';
  end if;

  if v_week.status <> 'paid' then
    raise exception 'That week is not locked.';
  end if;

  -- The wages ledger entry is VOIDED, not deleted (spec 2.1) - the trail has
  -- to show that wages were recorded as paid and then taken back.
  if v_week.ledger_entry_id is not null then
    update public.ledger_entries
       set voided_at = now(),
           voided_by = auth.uid(),
           void_reason = 'Payroll week unlocked: ' || p_reason
     where id = v_week.ledger_entry_id;
  end if;

  -- The advance repayment IS removed, because it is a claim that the balance
  -- owed went down. If the wages were not really paid, it did not.
  delete from public.advance_deductions where payroll_week_id = p_week_id;

  update public.payroll_weeks
     set status = 'draft',
         paid_on = null,
         paid_source = null,
         ledger_entry_id = null,
         unlocked_at = now(),
         unlocked_by = auth.uid(),
         unlock_reason = p_reason
   where id = p_week_id;
end;
$$;

comment on function public.unlock_payroll_week is
  'Owner-only. Voids the wages entry, removes the advance repayment, reopens the week.';

-- ---------------------------------------------------------------------------
-- Giving a cash advance (spec 13.4)
-- ---------------------------------------------------------------------------
-- Money out of the shop on the day it is handed over, plus the record of what
-- is owed - together, so the drawer and the balance can never disagree.

create or replace function public.give_cash_advance(
  p_staff_id uuid,
  p_amount_centavos bigint,
  p_advanced_on date,
  p_source text,
  p_reason text default null,
  p_deduction_plan text default 'decide_on_payday'
)
returns uuid
language plpgsql
as $$
declare
  v_staff public.staff;
  v_ledger_id uuid;
  v_advance_id uuid;
begin
  if p_amount_centavos <= 0 then
    raise exception 'An advance has to be more than zero.';
  end if;

  select * into v_staff from public.staff where id = p_staff_id;
  if not found then
    raise exception 'That staff member no longer exists.';
  end if;

  insert into public.ledger_entries (
    occurred_at, direction, amount_centavos, tag, category, source, note,
    source_table, created_by
  )
  values (
    p_advanced_on::timestamptz, 'out', p_amount_centavos, 'whole_shop',
    'cash_advances', p_source,
    'Cash advance to ' || v_staff.full_name ||
      coalesce(' - ' || nullif(btrim(p_reason), ''), ''),
    'cash_advances', auth.uid()
  )
  returning id into v_ledger_id;

  insert into public.cash_advances (
    staff_id, amount_centavos, advanced_on, source, reason, deduction_plan,
    ledger_entry_id, created_by
  )
  values (
    p_staff_id, p_amount_centavos, p_advanced_on, p_source,
    nullif(btrim(p_reason), ''), p_deduction_plan, v_ledger_id, auth.uid()
  )
  returning id into v_advance_id;

  update public.ledger_entries set source_id = v_advance_id where id = v_ledger_id;

  return v_advance_id;
end;
$$;

comment on function public.give_cash_advance is
  'Records a cash advance and the money leaving the shop, in one transaction.';

grant execute on function public.mark_payroll_paid(uuid, date, text) to authenticated;
grant execute on function public.unlock_payroll_week(uuid, text) to authenticated;
grant execute on function public.give_cash_advance(uuid, bigint, date, text, text, text) to authenticated;
grant execute on function public.my_staff_id() to authenticated;
grant execute on function public.is_active_staff(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Staff photos (spec 13.1)
-- ---------------------------------------------------------------------------
-- Guarded, because the `storage` schema only exists on a hosted Supabase
-- project - this block is skipped when the migration runs against a plain
-- PostgreSQL for testing.

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('staff-photos', 'staff-photos', false)
    on conflict (id) do nothing;

    -- Anyone signed in may see the photos, because the time clock shows them
    -- so people can find their own face. Only Owner/Admin may change them.
    execute $policy$
      drop policy if exists staff_photos_read on storage.objects;
      create policy staff_photos_read on storage.objects
        for select using (
          bucket_id = 'staff-photos' and public.current_role_name() is not null
        );
    $policy$;

    execute $policy$
      drop policy if exists staff_photos_write on storage.objects;
      create policy staff_photos_write on storage.objects
        for all using (
          bucket_id = 'staff-photos' and public.is_owner_or_admin()
        ) with check (
          bucket_id = 'staff-photos' and public.is_owner_or_admin()
        );
    $policy$;
  end if;
end;
$$;
