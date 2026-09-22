-- Table privileges that Supabase grants automatically on its hosted projects.
-- Privileges say "this role may attempt to read this table at all"; the RLS
-- policies then decide which rows come back. Both layers have to allow it.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;

-- The server's own role, for the handful of jobs that happen before anybody is
-- signed in. On Supabase it also bypasses RLS; here the stub gives it that,
-- and this gives it the privileges that sit underneath.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
