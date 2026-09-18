"use server";

/**
 * Weekly payroll (spec 13.3).
 *
 * The figures are worked out by src/lib/payroll.ts, which is tested on its own.
 * These actions store the owner's per-day choices, recompute the totals, and
 * hand the actual payment over to a database function so the wages, the ledger
 * entry and the cash advance repayment move together.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { getSettings, requireOwner, requireOwnerOrAdmin } from "@/lib/auth/dal";
import {
  buildWeekView,
  getAdvanceBalances,
  getPayrollDays,
  getPayrollWeeks,
  getStaff,
} from "@/lib/data/staff";
import { formatPesos, parsePesos } from "@/lib/money";
import { computeWeeklyPayroll, type DayType } from "@/lib/payroll";
import {
  civilDateToISO,
  formatWeekRange,
  manilaToday,
  parseISODate,
  startOfWeek,
  weekDays,
} from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PayrollActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

/**
 * Creates the draft week if it does not exist yet, then saves the owner's
 * choices for each day and recomputes gross and net.
 *
 * The daily rate is copied onto the week when it is created and never read
 * again from the staff record - so a later raise cannot rewrite what somebody
 * was paid last month.
 */
export async function saveWeekAction(
  _previous: PayrollActionState,
  formData: FormData,
): Promise<PayrollActionState> {
  const actor = await requireOwnerOrAdmin();
  const settings = await getSettings();

  const staffId = String(formData.get("staffId") ?? "");
  const weekStartDate = parseISODate(String(formData.get("weekStart") ?? ""));
  if (!weekStartDate) return { error: "That week is not valid." };

  const weekStart = startOfWeek(weekStartDate, settings.weekStartsOn);
  const staff = await getStaff();
  const member = staff.find((entry) => entry.id === staffId);
  if (!member) return { error: "That staff member no longer exists." };

  if (member.dailyRateCentavos === null) {
    return {
      error: `${member.fullName} has no daily rate yet. Set it on the Staff screen first - the system will not guess a wage.`,
    };
  }

  const supabase = await createSupabaseServerClient();

  // Find or create the draft week.
  const { data: existing } = await supabase
    .from("payroll_weeks")
    .select("id, status, daily_rate_centavos")
    .eq("staff_id", staffId)
    .eq("week_start", civilDateToISO(weekStart))
    .maybeSingle();

  if (existing?.status === "paid") {
    return {
      error:
        "That week is already paid and locked. The owner can unlock it below if something needs correcting.",
    };
  }

  let weekId = existing?.id as string | undefined;
  // A week already in progress keeps the rate it was created with.
  const rateForWeek = existing
    ? Number(existing.daily_rate_centavos)
    : member.dailyRateCentavos;

  if (!weekId) {
    const { data: created, error } = await supabase
      .from("payroll_weeks")
      .insert({
        staff_id: staffId,
        week_start: civilDateToISO(weekStart),
        daily_rate_centavos: member.dailyRateCentavos,
        created_by: actor.id,
      })
      .select("id")
      .single();

    if (error || !created) {
      return { error: `Could not start the week: ${error?.message}` };
    }
    weekId = created.id;
  }

  // Read the owner's choice for each of the seven days.
  const days = weekDays(weekStart).map((date) => {
    const iso = civilDateToISO(date);
    const rawType = String(formData.get(`dayType:${iso}`) ?? "absent");
    const dayType: DayType =
      rawType === "full" || rawType === "half" ? rawType : "absent";

    const overtimeHours = Number(formData.get(`otHours:${iso}`) ?? 0);
    const rawOtPay = String(formData.get(`otPay:${iso}`) ?? "").trim();

    let overtimePayCentavos = 0;
    if (rawOtPay !== "") {
      try {
        overtimePayCentavos = parsePesos(rawOtPay);
      } catch {
        overtimePayCentavos = 0;
      }
    }

    return {
      date,
      iso,
      dayType,
      overtimeHours: Number.isFinite(overtimeHours) ? Math.max(0, overtimeHours) : 0,
      overtimePayCentavos,
    };
  });

  let bonusCentavos = 0;
  const rawBonus = String(formData.get("bonus") ?? "").trim();
  if (rawBonus !== "") {
    try {
      bonusCentavos = parsePesos(rawBonus);
      if (bonusCentavos < 0) throw new Error("negative");
    } catch {
      return { fieldErrors: { bonus: "Enter an amount like 200, or leave it blank." } };
    }
  }

  let requestedDeduction = 0;
  const rawDeduction = String(formData.get("advanceDeduction") ?? "").trim();
  if (rawDeduction !== "") {
    try {
      requestedDeduction = parsePesos(rawDeduction);
      if (requestedDeduction < 0) throw new Error("negative");
    } catch {
      return {
        fieldErrors: { advanceDeduction: "Enter an amount like 500, or leave it blank." },
      };
    }
  }

  const balances = await getAdvanceBalances();
  const outstanding = balances.get(staffId) ?? 0;

  const totals = computeWeeklyPayroll({
    dailyRateCentavos: rateForWeek,
    days: days.map((day) => ({
      date: day.date,
      timeIn: null,
      timeOut: null,
      hoursWorked: null,
      late: false,
      forgotTimeOut: false,
      dayType: day.dayType,
      overtimeHours: day.overtimeHours,
      overtimePayCentavos: day.overtimePayCentavos,
    })),
    bonusCentavos,
    requestedAdvanceDeductionCentavos: requestedDeduction,
    outstandingAdvanceCentavos: outstanding,
  });

  // Replace the day rows wholesale: simpler than reconciling seven of them,
  // and the week is a draft so nothing is lost.
  await supabase.from("payroll_days").delete().eq("payroll_week_id", weekId);

  const { error: daysError } = await supabase.from("payroll_days").insert(
    days.map((day) => ({
      payroll_week_id: weekId,
      work_date: day.iso,
      day_type: day.dayType,
      overtime_hours: day.overtimeHours,
      overtime_pay_centavos: day.overtimePayCentavos,
    })),
  );

  if (daysError) return { error: `Could not save the days: ${daysError.message}` };

  const { error: weekError } = await supabase
    .from("payroll_weeks")
    .update({
      bonus_centavos: bonusCentavos,
      // Store what will actually be taken, not what was typed, so the payslip
      // and the balance owed always agree.
      advance_deduction_centavos: totals.advanceDeductionCentavos,
      gross_centavos: totals.grossCentavos,
      net_centavos: totals.netCentavos,
    })
    .eq("id", weekId);

  if (weekError) return { error: `Could not save the week: ${weekError.message}` };

  revalidatePath("/payroll");

  const warning = totals.deductionExceededGross
    ? ` The advance deduction was more than the ${formatPesos(totals.grossCentavos)} earned, so only ${formatPesos(totals.advanceDeductionCentavos)} was taken and ${formatPesos(totals.deductionCarriedOverCentavos)} carries over.`
    : "";

  return {
    success: `Saved. Gross ${formatPesos(totals.grossCentavos)}, net ${formatPesos(totals.netCentavos)}.${warning}`,
  };
}

export async function markPayrollPaidAction(
  _previous: PayrollActionState,
  formData: FormData,
): Promise<PayrollActionState> {
  const actor = await requireOwnerOrAdmin();

  const weekId = String(formData.get("weekId") ?? "");
  const paidOn = parseISODate(String(formData.get("paidOn") ?? "")) ?? manilaToday();
  const source = String(formData.get("source") ?? "");

  if (!["cash_drawer", "gcash", "bank", "owners_pocket"].includes(source)) {
    return { error: "Choose how the wages were paid." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: week } = await supabase
    .from("payroll_weeks")
    .select("staff_id, week_start, net_centavos, status")
    .eq("id", weekId)
    .maybeSingle();

  if (!week) return { error: "That payroll week no longer exists." };
  if (week.status === "paid") return { error: "That week is already paid." };

  const { error } = await supabase.rpc("mark_payroll_paid", {
    p_week_id: weekId,
    p_paid_on: civilDateToISO(paidOn),
    p_source: source,
  });

  if (error) return { error: `Could not mark it paid: ${error.message}` };

  const staff = await getStaff();
  const member = staff.find((entry) => entry.id === week.staff_id);
  const weekStart = parseISODate(week.week_start);

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "create",
    entity: "payroll_weeks",
    entityId: weekId,
    summary: `Paid ${member?.fullName ?? "staff"} ${formatPesos(
      Number(week.net_centavos),
    )} for the week of ${weekStart ? formatWeekRange(weekStart) : week.week_start}`,
    after: { net_centavos: Number(week.net_centavos), paid_source: source },
  });

  revalidatePath("/payroll");
  revalidatePath("/ledger");
  revalidatePath("/staff");
  revalidatePath("/");

  return { success: "Wages recorded as paid, and the week is locked." };
}

/** Spec 13.3: only the Owner may unlock a paid week, and must say why. */
export async function unlockWeekAction(
  _previous: PayrollActionState,
  formData: FormData,
): Promise<PayrollActionState> {
  const actor = await requireOwner();

  const weekId = String(formData.get("weekId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (reason === "") {
    return { fieldErrors: { reason: "Say why the week is being unlocked." } };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("unlock_payroll_week", {
    p_week_id: weekId,
    p_reason: reason,
  });

  if (error) return { error: `Could not unlock it: ${error.message}` };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "void",
    entity: "payroll_weeks",
    entityId: weekId,
    summary: `Unlocked a paid payroll week: ${reason}`,
    before: { status: "paid" },
    after: { status: "draft", reason },
  });

  revalidatePath("/payroll");
  revalidatePath("/ledger");
  revalidatePath("/staff");
  revalidatePath("/");

  return {
    success:
      "The week is open again. The wages entry is voided and the advance repayment removed, so the balances are honest.",
  };
}

/** Everything the payroll screen needs for one person and one week. */
export async function loadWeek(staffId: string, weekStartISO: string) {
  const settings = await getSettings();
  const parsed = parseISODate(weekStartISO) ?? manilaToday();
  const weekStart = startOfWeek(parsed, settings.weekStartsOn);

  const weeks = await getPayrollWeeks({ staffId, limit: 60 });
  const week = weeks.find(
    (entry) => civilDateToISO(entry.weekStart) === civilDateToISO(weekStart),
  );

  const existingDays = week ? await getPayrollDays(week.id) : [];
  const view = await buildWeekView({ staffId, weekStart, existingDays });

  return { weekStart, week, view };
}
