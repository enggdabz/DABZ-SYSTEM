-- Staff accounts stay signed in until they sign out (spec 4.1, revised).
--
-- Spec 4.1 signs everybody out after a run of idle minutes, because the
-- counter computer is shared. In practice that threw the counter staff back to
-- the login screen over and over during a working day, and the owner asked for
-- them to stay signed in (21 September 2026).
--
-- A switch rather than a removal: owner and admin accounts keep the idle timer
-- whatever this says - they are the ones who can open payroll, the ledger and
-- the bills - and unticking it in Settings puts staff back on the timer too.
--
-- Defaults to TRUE because that is what the owner asked for; nobody should
-- have to find a checkbox before the change they requested takes effect.
--
-- No policy changes: this is one more column on app_settings, which Owner and
-- Admin already write and everybody already reads (staff need the discount
-- limit at the counter). In particular a staff member still cannot flip this
-- switch for themselves - 03_rls.test.sql proves it.

alter table public.app_settings
  add column if not exists staff_stay_signed_in boolean not null default true;

comment on column public.app_settings.staff_stay_signed_in is
  'True leaves a staff account signed in until the person signs out. Owner and admin accounts follow auto_logout_minutes either way.';
