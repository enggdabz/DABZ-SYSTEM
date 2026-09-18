"use server";

/**
 * Employee records (spec 13.1).
 *
 * An employee is not the same thing as a login. Someone who only ever taps the
 * time clock has a staff row and no account; the owner has an account and a
 * staff row. The two are linked by profile_id, and either can exist alone.
 */
import { revalidatePath } from "next/cache";

import { recordAudit, diffFields } from "@/lib/audit";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { DIVISION_IDS } from "@/lib/divisions";
import { formatPesos, parsePesos } from "@/lib/money";
import { civilDateToISO, manilaToday, parseISODate } from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface StaffFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

export async function saveStaffAction(
  _previous: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const actor = await requireOwnerOrAdmin();

  const staffId = String(formData.get("staffId") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const fieldErrors: Record<string, string> = {};

  if (fullName === "") fieldErrors.fullName = "Enter their full name.";

  // The daily rate may legitimately be blank: better an empty field the screen
  // warns about than a guessed wage.
  const rawRate = String(formData.get("dailyRate") ?? "").trim();
  let dailyRateCentavos: number | null = null;
  if (rawRate !== "") {
    try {
      dailyRateCentavos = parsePesos(rawRate);
      if (dailyRateCentavos < 0) throw new Error("negative");
    } catch {
      fieldErrors.dailyRate = "Enter a daily rate like 500 or 500.00, or leave it blank.";
    }
  }

  const rawStart = String(formData.get("startDate") ?? "").trim();
  let startDate: string | null = null;
  if (rawStart !== "") {
    const parsed = parseISODate(rawStart);
    if (!parsed) fieldErrors.startDate = "Choose a valid start date.";
    else startDate = civilDateToISO(parsed);
  }

  const divisions = formData
    .getAll("divisions")
    .map(String)
    .filter((value) => (DIVISION_IDS as readonly string[]).includes(value));

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const values = {
    full_name: fullName,
    position: String(formData.get("position") ?? "").trim() || null,
    contact_number: String(formData.get("contactNumber") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    emergency_contact_name:
      String(formData.get("emergencyContactName") ?? "").trim() || null,
    emergency_contact_number:
      String(formData.get("emergencyContactNumber") ?? "").trim() || null,
    start_date: startDate,
    daily_rate_centavos: dailyRateCentavos,
    divisions,
    note: String(formData.get("note") ?? "").trim() || null,
  };

  const supabase = await createSupabaseServerClient();

  if (staffId === "") {
    const { error } = await supabase
      .from("staff")
      .insert({ ...values, created_by: actor.id });
    if (error) return { error: `Could not add them: ${error.message}` };

    await recordAudit({
      actorId: actor.id,
      actorUsername: actor.username,
      action: "create",
      entity: "staff",
      summary:
        dailyRateCentavos === null
          ? `Added ${fullName} as staff, with no daily rate set yet`
          : `Added ${fullName} as staff at ${formatPesos(dailyRateCentavos)} a day`,
      after: values,
    });

    revalidatePath("/staff");
    revalidatePath("/timeclock");
    revalidatePath("/payroll");
    return { success: `Added ${fullName}.` };
  }

  const { data: before } = await supabase
    .from("staff")
    .select("full_name, position, daily_rate_centavos, contact_number, start_date")
    .eq("id", staffId)
    .maybeSingle();

  const { error } = await supabase.from("staff").update(values).eq("id", staffId);
  if (error) return { error: `Could not save: ${error.message}` };

  const changed = before
    ? diffFields(before as Record<string, unknown>, {
        ...(before as object),
        full_name: values.full_name,
        position: values.position,
        daily_rate_centavos: values.daily_rate_centavos,
        contact_number: values.contact_number,
        start_date: values.start_date,
      } as Record<string, unknown>)
    : { before: {}, after: values, changedKeys: ["all"] };

  // A wage change is the one edit here that changes what someone is paid, so
  // it is spelled out in the log rather than left as "changed staff".
  const rateChanged = changed.changedKeys.includes("daily_rate_centavos");

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "update",
    entity: "staff",
    entityId: staffId,
    summary: rateChanged
      ? `Changed ${fullName}'s daily rate to ${
          dailyRateCentavos === null ? "not set" : formatPesos(dailyRateCentavos)
        }`
      : `Updated ${fullName}'s details`,
    before: changed.before,
    after: changed.after,
  });

  revalidatePath("/staff");
  revalidatePath("/timeclock");
  revalidatePath("/payroll");
  revalidatePath("/");

  return { success: `Saved ${fullName}.` };
}

export async function setStaffStatusAction(
  _previous: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const actor = await requireOwnerOrAdmin();

  const staffId = String(formData.get("staffId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  const supabase = await createSupabaseServerClient();
  const { data: member } = await supabase
    .from("staff")
    .select("full_name")
    .eq("id", staffId)
    .maybeSingle();

  if (!member) return { error: "That staff member no longer exists." };

  // Spec 13.1: deactivating keeps all history. Nothing is ever deleted.
  const { error } = await supabase
    .from("staff")
    .update({ status: active ? "active" : "inactive" })
    .eq("id", staffId);

  if (error) return { error: error.message };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: active ? "activate" : "deactivate",
    entity: "staff",
    entityId: staffId,
    summary: `${active ? "Reactivated" : "Deactivated"} ${member.full_name}`,
    before: { status: active ? "inactive" : "active" },
    after: { status: active ? "active" : "inactive" },
  });

  revalidatePath("/staff");
  revalidatePath("/timeclock");
  revalidatePath("/payroll");

  return {
    success: active
      ? `${member.full_name} is active again.`
      : `${member.full_name} is deactivated. Everything they entered is kept.`,
  };
}

/** Links an employee to a login account, or unlinks them (spec 13.1). */
export async function linkAccountAction(
  _previous: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const actor = await requireOwnerOrAdmin();

  const staffId = String(formData.get("staffId") ?? "");
  const profileId = String(formData.get("profileId") ?? "").trim();

  const supabase = await createSupabaseServerClient();

  const { data: member } = await supabase
    .from("staff")
    .select("full_name, profile_id")
    .eq("id", staffId)
    .maybeSingle();

  if (!member) return { error: "That staff member no longer exists." };

  const { error } = await supabase
    .from("staff")
    .update({ profile_id: profileId === "" ? null : profileId })
    .eq("id", staffId);

  if (error) {
    // The unique constraint stops one account being attached to two employees.
    if (error.code === "23505") {
      return { error: "That account is already linked to another staff member." };
    }
    return { error: `Could not link the account: ${error.message}` };
  }

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "update",
    entity: "staff",
    entityId: staffId,
    summary:
      profileId === ""
        ? `Unlinked ${member.full_name} from their login account`
        : `Linked ${member.full_name} to a login account`,
    before: { profile_id: member.profile_id },
    after: { profile_id: profileId === "" ? null : profileId },
  });

  revalidatePath("/staff");
  return {
    success:
      profileId === ""
        ? `${member.full_name} no longer has a login. They can still use the time clock.`
        : `${member.full_name} can now sign in, and will see their own attendance and payslips.`,
  };
}

/** Records a cash advance (spec 13.4), as one transaction with the ledger. */
export async function giveCashAdvanceAction(
  _previous: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const actor = await requireOwnerOrAdmin();

  const staffId = String(formData.get("staffId") ?? "");
  const fieldErrors: Record<string, string> = {};

  let amountCentavos = 0;
  try {
    amountCentavos = parsePesos(String(formData.get("amount") ?? ""));
    if (amountCentavos <= 0) throw new Error("not positive");
  } catch {
    fieldErrors.amount = "Enter an amount like 500 or 500.00.";
  }

  const advancedOn = parseISODate(String(formData.get("advancedOn") ?? "")) ?? manilaToday();

  const source = String(formData.get("source") ?? "");
  if (!["cash_drawer", "gcash", "bank", "owners_pocket"].includes(source)) {
    fieldErrors.source = "Choose where the money came from.";
  }

  const plan = String(formData.get("deductionPlan") ?? "decide_on_payday");
  if (!["next_payday", "in_parts", "decide_on_payday"].includes(plan)) {
    fieldErrors.deductionPlan = "Choose how it will be paid back.";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createSupabaseServerClient();

  const { data: member } = await supabase
    .from("staff")
    .select("full_name")
    .eq("id", staffId)
    .maybeSingle();

  if (!member) return { error: "That staff member no longer exists." };

  const { error } = await supabase.rpc("give_cash_advance", {
    p_staff_id: staffId,
    p_amount_centavos: amountCentavos,
    p_advanced_on: civilDateToISO(advancedOn),
    p_source: source,
    p_reason: String(formData.get("reason") ?? "").trim() || null,
    p_deduction_plan: plan,
  });

  if (error) return { error: `Could not record the advance: ${error.message}` };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "create",
    entity: "cash_advances",
    entityId: staffId,
    summary: `Gave ${member.full_name} a cash advance of ${formatPesos(amountCentavos)}`,
    after: { amount_centavos: amountCentavos, source, deduction_plan: plan },
  });

  revalidatePath("/staff");
  revalidatePath("/payroll");
  revalidatePath("/ledger");
  revalidatePath("/");

  return {
    success: `Recorded ${formatPesos(amountCentavos)} advanced to ${member.full_name}.`,
  };
}
