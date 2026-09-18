-- Table privileges that Supabase grants automatically on its hosted projects.
-- Privileges say "this role may attempt to read this table at all"; the RLS
-- policies then decide which rows come back. Both layers have to allow it.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
