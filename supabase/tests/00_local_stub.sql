-- Stand-in for the parts of Supabase that live outside our migrations.
--
-- Supabase hosts provide the `auth` schema, the `auth.users` table, the
-- `auth.uid()` function and the `anon` / `authenticated` / `service_role`
-- database roles. A plain PostgreSQL does not, so this file recreates just
-- enough of them to run the security tests locally.
--
-- ONLY used by supabase/tests. Never run this against the real project.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text unique
);

-- On Supabase this reads the signed-in person's id out of their JWT. Here the
-- tests set it directly, which lets one test session act as different people.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('test.user_id', true), '')::uuid;
$$;

-- The role every signed-in person's requests run as. RLS is skipped for a
-- table's owner, so tests must act as this role for the policies to apply.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end;
$$;

grant usage on schema public, auth to authenticated, anon;
