"use server";

/**
 * The time clock (spec 13.2).
 *
 * Logging in is not timing in (spec 4.1). This is the separate, deliberate act
 * of starting and ending a shift.
 *
 * On one shared counter computer, whoever is signed in taps the button for
 * whoever is arriving - so any signed-in, active person may clock any active
 * staff member. Every entry records who pressed it, and the screen shows that,
 * which is the guard against clocking in an absent colleague.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireOwnerOrAdmin, requireUser } from "@/lib/auth/dal";
import { civilDateToISO, manilaToday, parseISODate } from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ClockState {
  error?: string;
  success?: string;
}

export async function timeInAction(
  _previous: ClockState,
  formData: FormData,
): Promise<ClockState> {
  const actor = await requireUser();
  const staffId = String(formData.get("staffId") ?? "");

  const supabase = await createSupabaseServerClient();
  const today = manilaToday();

  const { data: member } = await supabase
    .from("staff")
    .select("full_name, status")
    .eq("id", staffId)
    .maybeSingle();

  // Staff can only see their own row, so a colleague's name may not be
  // readable here. That is fine - the database policy still checks that the
  // person is active.
  const name = member?.full_name ?? "Staff member";

  const { error } = await supabase.from("attendance_entries").insert({
    staff_id: staffId,
    work_date: civilDateToISO(today),
    time_in: new Date().toISOString(),
    recorded_by: actor.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: `${name} has already timed in today.` };
    }
    return {
      error:
        "Could not time in. The staff member may be deactivated, or you may not have permission.",
    };
  }

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "create",
    entity: "attendance_entries",
    entityId: staffId,
    summary: `${name} timed in${staffId === actor.id ? "" : ` (recorded by ${actor.username})`}`,
  });

  revalidatePath("/timeclock");
  revalidatePath("/payroll");

  return { success: `${name} timed in.` };
}

export async function timeOutAction(
  _previous: ClockState,
  formData: FormData,
): Promise<ClockState> {
  const actor = await requireUser();
  const entryId = String(formData.get("entryId") ?? "");

  const supabase = await createSupabaseServerClient();

  const { data: entry } = await supabase
    .from("attendance_entries")
    .select("staff_id, time_out")
    .eq("id", entryId)
    .maybeSingle();

  if (!entry) return { error: "That shift no longer exists." };
  if (entry.time_out) return { error: "That shift is already timed out." };

  const { error } = await supabase
    .from("attendance_entries")
    .update({ time_out: new Date().toISOString() })
    .eq("id", entryId);

  if (error) return { error: "Could not time out. You may not have permission." };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "update",
    entity: "attendance_entries",
    entityId: entryId,
    summary: `Timed out a shift (recorded by ${actor.username})`,
  });

  revalidatePath("/timeclock");
  revalidatePath("/payroll");

  return { success: "Timed out." };
}

/**
 * Corrects a shift (spec 13.2: "forgot to time out - owner must correct").
 * Owner/Admin only, and written to the audit log with the old and new times.
 */
export async function correctShiftAction(
  _previous: ClockState,
  formData: FormData,
): Promise<ClockState> {
  const actor = await requireOwnerOrAdmin();

  const entryId = String(formData.get("entryId") ?? "");
  const workDate = parseISODate(String(formData.get("workDate") ?? ""));
  const timeInRaw = String(formData.get("timeIn") ?? "").trim();
  const timeOutRaw = String(formData.get("timeOut") ?? "").trim();

  if (!workDate) return { error: "That date is not valid." };

  // The times arrive as "HH:MM" from the form, meaning Manila time on that day.
  const toTimestamp = (value: string) =>
    value === ""
      ? null
      : new Date(`${civilDateToISO(workDate)}T${value}:00+08:00`).toISOString();

  const timeIn = toTimestamp(timeInRaw);
  const timeOut = toTimestamp(timeOutRaw);

  if (timeIn && timeOut && new Date(timeOut) < new Date(timeIn)) {
    return { error: "The time out cannot be before the time in." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: before } = await supabase
    .from("attendance_entries")
    .select("time_in, time_out, staff_id")
    .eq("id", entryId)
    .maybeSingle();

  if (!before) return { error: "That shift no longer exists." };

  const { error } = await supabase
    .from("attendance_entries")
    .update({
      time_in: timeIn,
      time_out: timeOut,
      corrected_by: actor.id,
      corrected_at: new Date().toISOString(),
    })
    .eq("id", entryId);

  if (error) return { error: `Could not save the correction: ${error.message}` };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "update",
    entity: "attendance_entries",
    entityId: entryId,
    summary: `Corrected a shift on ${civilDateToISO(workDate)}`,
    before: { time_in: before.time_in, time_out: before.time_out },
    after: { time_in: timeIn, time_out: timeOut },
  });

  revalidatePath("/timeclock");
  revalidatePath("/payroll");

  return { success: "Shift corrected." };
}

export async function deleteShiftAction(
  _previous: ClockState,
  formData: FormData,
): Promise<ClockState> {
  const actor = await requireOwnerOrAdmin();
  const entryId = String(formData.get("entryId") ?? "");

  const supabase = await createSupabaseServerClient();

  const { data: before } = await supabase
    .from("attendance_entries")
    .select("staff_id, work_date, time_in, time_out")
    .eq("id", entryId)
    .maybeSingle();

  if (!before) return { error: "That shift no longer exists." };

  const { error } = await supabase
    .from("attendance_entries")
    .delete()
    .eq("id", entryId);

  if (error) return { error: `Could not remove it: ${error.message}` };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "delete",
    entity: "attendance_entries",
    entityId: entryId,
    summary: `Removed a shift on ${before.work_date}`,
    before: { time_in: before.time_in, time_out: before.time_out },
  });

  revalidatePath("/timeclock");
  revalidatePath("/payroll");

  return { success: "Shift removed." };
}
