-- Phase 1: the foundation - accounts, roles, permissions, settings, audit log.
--
-- READ THIS FIRST IF YOU ARE CHANGING THIS FILE
--
-- Row Level Security (RLS) is the real security boundary of this system. The
-- app code is a convenience; the database is the guard. Every table below has
-- RLS enabled and explicit policies, so even if a bug in a screen asked for
-- staff salaries, PostgreSQL would return nothing.
--
-- Two rules that are easy to get wrong:
--
-- 1. A policy on `profiles` must not read `profiles` directly, or PostgreSQL
--    recurses forever. That is why the helper functions below are
--    SECURITY DEFINER: they run as their owner and skip RLS, which breaks the
--    loop. They are deliberately tiny and read-only.
--
-- 2. Write policies need BOTH `using` (which existing rows may I touch) and
--    `with check` (what may the row look like afterwards). Without
--    `with check`, an admin could edit a staff row and set its role to owner.

-- ---------------------------------------------------------------------------
-- Settings (spec 4.1, 12.3, 17.5, 17.8)
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  -- One shop, one row of settings.
  id smallint primary key default 1,
  constraint app_settings_single_row check (id = 1),

  -- Spec 12.3: the daily target divides monthly costs by working days.
  working_days_per_month smallint not null default 26
    check (working_days_per_month between 1 and 31),

  -- Spec 2.1: weeks run Monday-Sunday unless changed here.
  week_starts_on text not null default 'monday'
    check (week_starts_on in ('monday', 'sunday')),

  -- Spec 13.2: used to flag late arrivals and overtime.
  work_day_start time not null default '08:00',
  work_day_end time not null default '17:00',

  -- Spec 4.1: idle staff are signed out of the shared counter computer.
  auto_logout_minutes smallint not null default 15
    check (auto_logout_minutes between 1 and 480),

  -- Spec 17.8: money limits are centavos, like every amount in this system.
  staff_expense_approval_limit_centavos integer not null default 200000
    check (staff_expense_approval_limit_centavos >= 0),
  staff_discount_limit_percent numeric(5, 2) not null default 10.00
    check (staff_discount_limit_percent between 0 and 100),
  staff_discount_limit_centavos integer not null default 10000
    check (staff_discount_limit_centavos >= 0),

  -- Spec 9.3 / 9.4, used from Phase 7 but configured here.
  default_warranty_days smallint not null default 30
    check (default_warranty_days >= 0),
  unclaimed_unit_days smallint not null default 30
    check (unclaimed_unit_days >= 0),

  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.app_settings is
  'Shop-wide settings. One row. Readable by any signed-in person; only Owner/Admin may change it.';

-- ---------------------------------------------------------------------------
-- Profiles: one row per person who can sign in (spec 4.2)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  -- Same id as the Supabase Auth user. Deleting the auth user removes this.
  id uuid primary key references auth.users (id) on delete cascade,

  -- Staff sign in with a username; the email Supabase needs is derived from it
  -- and never shown to staff (spec 4.1).
  username text not null unique
    check (username ~ '^[a-z0-9]([a-z0-9._-]{1,28}[a-z0-9])$'),

  full_name text not null check (length(btrim(full_name)) > 0),

  role text not null default 'staff'
    check (role in ('owner', 'admin', 'staff')),

  -- Spec 13.1: deactivating keeps all history, so accounts are never deleted
  -- once they have touched money.
  status text not null default 'active'
    check (status in ('active', 'inactive')),

  -- Spec 4.1: new accounts get a temporary password and must change it.
  must_change_password boolean not null default true,

  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'People who can sign in. Staff details like daily rate arrive in Phase 3.';

-- Exactly one owner, enforced by the database rather than by hopeful code.
create unique index if not exists profiles_single_owner
  on public.profiles ((role)) where (role = 'owner');

create index if not exists profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- Permissions (spec 4.3)
-- ---------------------------------------------------------------------------
-- A row here means "granted". No row means "not granted". Owner and Admin do
-- not need rows: they always pass (see has_permission below).

create table if not exists public.user_permissions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  permission text not null check (permission in (
    'add_sales',
    'record_expenses',
    'stock_in_out',
    'dabztech_tickets',
    'apparel_job_orders',
    'give_discounts',
    'view_daily_sales_report'
  )),
  granted_at timestamptz not null default now(),
  granted_by uuid,
  primary key (user_id, permission)
);

comment on table public.user_permissions is
  'Per-staff permission checkboxes. Owner/Admin bypass these entirely.';

-- ---------------------------------------------------------------------------
-- Audit log (spec 2.1)
-- ---------------------------------------------------------------------------

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),

  -- Kept as both a link and a snapshot of the name, so the log still reads
  -- correctly years later even if the account is gone.
  actor_id uuid,
  actor_username text,

  action text not null check (action in (
    'create', 'update', 'delete', 'void',
    'login', 'login_failed', 'logout',
    'password_change', 'password_reset',
    'permission_grant', 'permission_revoke',
    'activate', 'deactivate'
  )),

  entity text not null,
  entity_id text,

  -- One plain-language line, so the owner can read the log without help.
  summary text not null,

  -- Before/after for edits, voids and deletions (spec 2.1).
  before jsonb,
  after jsonb
);

comment on table public.audit_log is
  'Append-only history of who did what. No policy allows update or delete.';

create index if not exists audit_log_occurred_at_idx
  on public.audit_log (occurred_at desc);
create index if not exists audit_log_entity_idx
  on public.audit_log (entity, entity_id);

-- ---------------------------------------------------------------------------
-- Login events (spec 4.1)
-- ---------------------------------------------------------------------------
-- Serves two jobs: the login history the owner can read, and the counter that
-- locks an account after 5 failed tries.
--
-- Written only by the server (using the secret service-role key), never by a
-- browser - otherwise anyone could flood it or lock out a colleague.

create table if not exists public.login_events (
  id bigint generated always as identity primary key,
  -- Text, not a link: a failed attempt may name a username that does not exist.
  username text not null,
  user_id uuid,
  outcome text not null check (outcome in (
    'success', 'wrong_password', 'unknown_user', 'locked_out', 'inactive_account'
  )),
  occurred_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);

comment on table public.login_events is
  'Login history and the failed-attempt counter. Server writes only.';

create index if not exists login_events_username_idx
  on public.login_events (username, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so they can read `profiles` without tripping the RLS
-- policies that call them. `search_path` is pinned so nobody can shadow the
-- tables these functions read.

create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active';
$$;

comment on function public.current_role_name() is
  'Role of the signed-in person, or null if not signed in or deactivated.';

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_role_name() = 'owner', false);
$$;

create or replace function public.is_owner_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_role_name() in ('owner', 'admin'), false);
$$;

create or replace function public.has_permission(wanted text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    -- Owner and Admin are never limited by the checkboxes (spec 4.3).
    when public.current_role_name() in ('owner', 'admin') then true
    when public.current_role_name() = 'staff' then exists (
      select 1
      from public.user_permissions up
      where up.user_id = auth.uid()
        and up.permission = wanted
    )
    -- Not signed in, or deactivated.
    else false
  end;
$$;

comment on function public.has_permission(text) is
  'True when the signed-in person may do this. Owner/Admin always may.';

-- Keeps updated_at honest without the app having to remember.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
  before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.audit_log enable row level security;
alter table public.login_events enable row level security;

-- Settings: anyone signed in may read (the POS needs the discount limit);
-- only Owner/Admin may change them.
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select using (public.current_role_name() is not null);

drop policy if exists app_settings_update on public.app_settings;
create policy app_settings_update on public.app_settings
  for update
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

-- Profiles: you always see yourself; Owner/Admin see everyone (spec 4.4).
drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_read_all_staff on public.profiles;
create policy profiles_read_all_staff on public.profiles
  for select using (public.is_owner_or_admin());

-- Owner may edit anyone. Admin may edit staff only, and may not turn a staff
-- row into an owner or admin - that is what `with check` prevents.
drop policy if exists profiles_update_by_owner on public.profiles;
create policy profiles_update_by_owner on public.profiles
  for update
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists profiles_update_staff_by_admin on public.profiles;
create policy profiles_update_staff_by_admin on public.profiles
  for update
  using (public.current_role_name() = 'admin' and role = 'staff')
  with check (public.current_role_name() = 'admin' and role = 'staff');

-- Nobody edits profiles except through the two policies above, and nobody
-- deletes them at all: deactivate instead, so history survives (spec 13.1).
-- Account creation goes through the server with the service-role key, which
-- bypasses RLS, so no insert policy is needed here either.

-- Permissions: see your own; Owner/Admin see and change everyone's.
drop policy if exists user_permissions_read_self on public.user_permissions;
create policy user_permissions_read_self on public.user_permissions
  for select using (user_id = auth.uid());

drop policy if exists user_permissions_read_all on public.user_permissions;
create policy user_permissions_read_all on public.user_permissions
  for select using (public.is_owner_or_admin());

drop policy if exists user_permissions_insert on public.user_permissions;
create policy user_permissions_insert on public.user_permissions
  for insert with check (public.is_owner_or_admin());

drop policy if exists user_permissions_delete on public.user_permissions;
create policy user_permissions_delete on public.user_permissions
  for delete using (public.is_owner_or_admin());

-- Audit log: Owner/Admin may read it, and that is ALL anyone may do.
--
-- There is deliberately no insert, update or delete policy. Every entry is
-- written by the server through the service-role key, which bypasses RLS, so
-- no browser can add a row. That matters: if a staff member could insert
-- entries they could bury a real one under invented ones, and if anyone could
-- update or delete them the log would not be worth reading.
drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log
  for select using (public.is_owner_or_admin());

-- Removes the permissive insert policy from earlier drafts, in case this
-- migration is re-run over a database that already had it.
drop policy if exists audit_log_insert on public.audit_log;

-- Login history: Owner/Admin may read. Writes are server-side only.
drop policy if exists login_events_read on public.login_events;
create policy login_events_read on public.login_events
  for select using (public.is_owner_or_admin());

-- ---------------------------------------------------------------------------
-- Seed the single settings row with the defaults from the specification.
-- ---------------------------------------------------------------------------

insert into public.app_settings (id) values (1) on conflict (id) do nothing;
