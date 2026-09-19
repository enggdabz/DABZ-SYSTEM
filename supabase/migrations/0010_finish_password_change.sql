-- Fix: a staff or admin account could never finish its forced password change.
--
-- THE BUG, IN ONE SENTENCE
--
-- A new account is created with `must_change_password = true` (spec 4.1), and
-- `requireUser()` bounces anyone carrying that flag to /change-password. The
-- change screen set the new password with Supabase Auth and then cleared the
-- flag with an ordinary update on `profiles` - but `profiles` has no policy
-- that lets a person update their OWN row:
--
--   * profiles_update_by_owner        needs is_owner()
--   * profiles_update_staff_by_admin  needs the CALLER to be an admin AND the
--                                     row being edited to be a staff row
--
-- A staff member is neither. An admin editing their own row is not either -
-- their own row is `role = 'admin'`, so the `role = 'staff'` condition fails.
-- Only the owner was ever able to clear the flag, and the owner's account is
-- created with it already false, so the bug never showed up in testing.
--
-- Row Level Security does not raise an error when no policy matches an UPDATE;
-- it simply updates no rows. So PostgREST returned success, the code believed
-- the flag was cleared, sent the person to /overview, and `requireUser()` read
-- the still-true flag and sent them straight back to /change-password. The
-- password really was changed every time round - which is why it looked like
-- the new password "kept being replaced".
--
-- THE FIX
--
-- Not a self-update policy on `profiles`. A policy wide enough to let someone
-- edit their own row is wide enough to let a staff member set their own role
-- to 'admin', because a policy cannot restrict WHICH COLUMNS an update
-- touches. Instead, one SECURITY DEFINER function that can change exactly one
-- boolean on exactly one row - the caller's own. That is the same shape as
-- `unlock_payroll_week`: the table stays shut, and there is a single named
-- sanctioned way past it.

create or replace function public.finish_password_change()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    raise exception 'Nobody is signed in.';
  end if;

  -- Deliberately narrow. It cannot name a row, cannot take a value, and
  -- cannot touch any other column, so the worst a staff member can do by
  -- calling it directly is tell the system they have chosen a password. They
  -- already know the temporary one the owner handed them, so that is not a
  -- door this opens - and the audit log records every real change anyway.
  update public.profiles
     set must_change_password = false,
         updated_at = now()
   where id = v_id;

  -- A signed-in account with no profile row cannot use the system at all.
  -- Saying so is better than another silent no-op.
  if not found then
    raise exception 'That account no longer exists.';
  end if;
end;
$$;

comment on function public.finish_password_change is
  'Clears the forced-password-change flag on the CALLER''S OWN profile, and nothing else. The only way past the missing self-update policy on profiles.';

grant execute on function public.finish_password_change() to authenticated;
