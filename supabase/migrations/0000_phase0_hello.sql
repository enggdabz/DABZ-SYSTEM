-- Phase 0: the very first table.
--
-- Its only job is to prove the chain works end to end:
--   the app on Vercel -> Supabase -> PostgreSQL -> back to the screen.
--
-- It also sets the habit the whole system depends on: Row Level Security is
-- turned ON for every table, and access is granted by explicit policy only
-- (spec 2). A table with RLS on and no policy is readable by nobody - which is
-- the safe default we want. Real tables arrive in Phase 1.

create table if not exists public.app_health (
  -- Deliberately a single-row table: there is only one "is the database alive"
  -- answer, so the check constraint stops extra rows being added by accident.
  id smallint primary key default 1,
  label text not null,
  checked_at timestamptz not null default now(),
  constraint app_health_single_row check (id = 1)
);

comment on table public.app_health is
  'Phase 0 connection check. One row. Safe for anyone to read; nobody can write.';

alter table public.app_health enable row level security;

-- Anyone who loads the site may read this one harmless row, because the
-- Phase 0 hello screen is shown before login exists.
drop policy if exists app_health_read_all on public.app_health;
create policy app_health_read_all
  on public.app_health
  for select
  using (true);

-- No insert/update/delete policy on purpose: with RLS enabled, that means the
-- app can never change this row. Only the owner can, from the Supabase editor.

insert into public.app_health (id, label)
values (1, 'Dabz database is connected')
on conflict (id) do nothing;
