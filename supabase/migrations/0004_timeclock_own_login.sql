-- Each person clocks only themselves in (open decision 17.2, answered).
--
-- Phase 3 built the time clock for one shared counter computer: anyone signed
-- in could tap a colleague in, and who pressed the button was recorded. The
-- owner has since decided each person should clock only themselves, which
-- means every staff member needs a login.
--
-- What changes:
--   * Timing IN is allowed only for your own staff record.
--   * Timing OUT is allowed only on your own open shift.
--   * Owner and Admin can still record or correct a shift for anyone. That is
--     not a loophole - it is the only way to fix a forgotten tap, or to record
--     a day for someone whose account is not set up yet, and every one of those
--     goes to the audit log.
--
-- What this costs: a staff member with no login can no longer use the time
-- clock at all. The Staff screen warns about exactly that, and the owner can
-- either create them an account or record their days themselves.

-- ---------------------------------------------------------------------------
-- Timing in
-- ---------------------------------------------------------------------------

drop policy if exists attendance_clock_in on public.attendance_entries;
create policy attendance_clock_in on public.attendance_entries
  for insert
  with check (
    public.is_active_staff(staff_id)
    and (
      -- Yourself, and only yourself.
      staff_id = public.my_staff_id()
      -- ...or an Owner/Admin recording a day on someone's behalf.
      or public.is_owner_or_admin()
    )
  );

-- ---------------------------------------------------------------------------
-- Timing out
-- ---------------------------------------------------------------------------
-- Still only on a shift that has not been closed, so a finished shift cannot
-- be reopened and stretched. Owner/Admin may correct any shift.

drop policy if exists attendance_clock_out on public.attendance_entries;
create policy attendance_clock_out on public.attendance_entries
  for update
  using (
    public.is_owner_or_admin()
    or (staff_id = public.my_staff_id() and time_out is null)
  )
  with check (
    public.is_owner_or_admin()
    or staff_id = public.my_staff_id()
  );
