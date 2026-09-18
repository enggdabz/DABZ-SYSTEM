"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { requireRole, requireUser } from "@/lib/auth";
import {
  DEDUCTION_PLANS, MONEY_SOURCES, PAYROLL_DAY_TYPES, type MoneySource,
} from "@/lib/domain";
import { parsePesosToCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => text(f, k) || null;

/** A half day earns half the rate; an absent day earns nothing. */
const DAY_SHARE: Record<string, number> = { full: 1, half: 0.5, absent: 0 };

/**
 * Recomputes a week's gross and net from its days.
 *
 * The totals are stored on payroll_weeks, so they are rewritten whenever a day
 * changes rather than left to drift. Only a draft week can be touched — the
 * RLS policy says so, and a paid week's figures must match what was handed over.
 */
async function recalculateWeek(weekId: string): Promise<void> {
  const supabase = await createClient();

  const { data: week } = await supabase
    .from("payroll_weeks")
    .select("id, daily_rate_centavos, bonus_centavos, advance_deduction_centavos, status")
    .eq("id", weekId)
    .maybeSingle();

  if (!week || week.status !== "draft") return;

  const { data: days } = await supabase
    .from("payroll_days")
    .select("day_type, overtime_pay_centavos")
    .eq("payroll_week_id", weekId);

  const worked = (days ?? []).reduce(
    (sum, day) => sum + Math.round(week.daily_rate_centavos * (DAY_SHARE[day.day_type] ?? 0)),
    0,
  );
  const overtime = (days ?? []).reduce(
    (sum, day) => sum + (day.overtime_pay_centavos ?? 0),
    0,
  );

  const gross = worked + overtime + (week.bonus_centavos ?? 0);
  // payroll_weeks_net_centavos_check: net may not go below zero.
  const net = Math.max(0, gross - (week.advance_deduction_centavos ?? 0));

  await supabase
    .from("payroll_weeks")
    .update({ gross_centavos: gross, net_centavos: net })
    .eq("id", weekId);
}

export async function saveStaff(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);

  const fullName = text(formData, "full_name");
  if (!fullName) return { error: "Enter a full name.", notice: null };

  const rate = parsePesosToCentavos(text(formData, "daily_rate") || "0");
  if (rate === null || rate < 0) return { error: "Enter a valid daily rate.", notice: null };

  const supabase = await createClient();
  const id = opt(formData, "id");
  const row = {
    full_name: fullName,
    position: opt(formData, "position"),
    contact_number: opt(formData, "contact_number"),
    address: opt(formData, "address"),
    emergency_contact_name: opt(formData, "emergency_contact_name"),
    emergency_contact_number: opt(formData, "emergency_contact_number"),
    start_date: opt(formData, "start_date"),
    daily_rate_centavos: rate,
    profile_id: opt(formData, "profile_id"),
    status: text(formData, "status") === "inactive" ? "inactive" : "active",
    note: opt(formData, "note"),
  };

  const { error } = id
    ? await supabase.from("staff").update(row).eq("id", id)
    : await supabase.from("staff").insert(row);
  if (error) return { error: "Could not save the staff record.", notice: null };

  revalidatePath("/admin/payroll/staff");
  return { error: null, notice: id ? "Staff updated." : "Staff added." };
}

export async function recordAttendance(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();

  const staffId = text(formData, "staff_id");
  const workDate = text(formData, "work_date") || new Date().toISOString().slice(0, 10);
  const timeIn = opt(formData, "time_in");
  const timeOut = opt(formData, "time_out");

  // attendance_out_after_in
  if (timeIn && timeOut && timeOut < timeIn) {
    return { error: "Time out cannot be before time in.", notice: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("attendance_entries").insert({
    staff_id: staffId,
    work_date: workDate,
    time_in: timeIn,
    time_out: timeOut,
    note: opt(formData, "note"),
  });
  if (error) return { error: error.message, notice: null };

  revalidatePath("/admin/payroll/attendance");
  return { error: null, notice: "Attendance recorded." };
}

export async function createPayrollWeek(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole(["owner", "admin"]);

  const staffId = text(formData, "staff_id");
  const weekStart = text(formData, "week_start");
  if (!staffId || !weekStart) {
    return { error: "Choose a staff member and a week.", notice: null };
  }

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("staff")
    .select("daily_rate_centavos")
    .eq("id", staffId)
    .maybeSingle();

  const { error } = await supabase.from("payroll_weeks").insert({
    staff_id: staffId,
    week_start: weekStart,
    // The rate is snapshotted onto the week, so a later raise does not rewrite
    // wages that were already worked.
    daily_rate_centavos: member?.daily_rate_centavos ?? 0,
    bonus_centavos: 0,
    advance_deduction_centavos: 0,
    gross_centavos: 0,
    net_centavos: 0,
    status: "draft",
    created_by: actor.user.id,
  });
  if (error) return { error: error.message, notice: null };

  revalidatePath("/admin/payroll");
  return { error: null, notice: "Draft week created." };
}

export async function setPayrollDay(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);

  const weekId = text(formData, "week_id");
  const workDate = text(formData, "work_date");
  const dayType = text(formData, "day_type");
  if (!PAYROLL_DAY_TYPES.includes(dayType as never)) {
    return { error: "Choose a day type.", notice: null };
  }

  const overtimePay = parsePesosToCentavos(text(formData, "overtime_pay") || "0");
  const overtimeHours = Number(text(formData, "overtime_hours") || "0");
  if (overtimePay === null || overtimePay < 0 || overtimeHours < 0) {
    return { error: "Enter valid overtime values.", notice: null };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("payroll_days")
    .select("id")
    .eq("payroll_week_id", weekId)
    .eq("work_date", workDate)
    .maybeSingle();

  const row = {
    payroll_week_id: weekId,
    work_date: workDate,
    day_type: dayType,
    overtime_hours: overtimeHours,
    overtime_pay_centavos: overtimePay,
  };

  const { error } = existing
    ? await supabase.from("payroll_days").update(row).eq("id", existing.id)
    : await supabase.from("payroll_days").insert(row);
  if (error) return { error: error.message, notice: null };

  await recalculateWeek(weekId);
  revalidatePath("/admin/payroll");
  return { error: null, notice: "Day saved." };
}

export async function setWeekAdjustments(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);

  const weekId = text(formData, "week_id");
  const bonus = parsePesosToCentavos(text(formData, "bonus") || "0");
  const deduction = parsePesosToCentavos(text(formData, "advance_deduction") || "0");
  if (bonus === null || bonus < 0 || deduction === null || deduction < 0) {
    return { error: "Enter valid amounts.", notice: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("payroll_weeks")
    .update({ bonus_centavos: bonus, advance_deduction_centavos: deduction })
    .eq("id", weekId);
  if (error) return { error: error.message, notice: null };

  await recalculateWeek(weekId);
  revalidatePath("/admin/payroll");
  return { error: null, notice: "Week updated." };
}

export async function payPayrollWeek(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);

  const source = text(formData, "source") as MoneySource;
  if (!MONEY_SOURCES.includes(source)) {
    return { error: "Choose where the money came from.", notice: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_payroll_paid", {
    p_week_id: text(formData, "week_id"),
    p_paid_on: text(formData, "paid_on") || new Date().toISOString().slice(0, 10),
    p_source: source,
  });
  if (error) return { error: error.message, notice: null };

  revalidatePath("/admin/payroll");
  return { error: null, notice: "Wages paid." };
}

export async function unlockWeek(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner"]);
  const reason = text(formData, "reason");
  if (!reason) return { error: "Say why the week is being unlocked.", notice: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("unlock_payroll_week", {
    p_week_id: text(formData, "week_id"),
    p_reason: reason,
  });
  if (error) return { error: error.message, notice: null };

  revalidatePath("/admin/payroll");
  return { error: null, notice: "Week unlocked." };
}

export async function giveCashAdvance(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);

  const amount = parsePesosToCentavos(text(formData, "amount"));
  if (amount === null || amount <= 0) {
    return { error: "Enter an amount above zero.", notice: null };
  }

  const source = text(formData, "source") as MoneySource;
  if (!MONEY_SOURCES.includes(source)) {
    return { error: "Choose where the money came from.", notice: null };
  }

  const plan = text(formData, "deduction_plan") || "decide_on_payday";
  if (!DEDUCTION_PLANS.includes(plan as never)) {
    return { error: "Choose a deduction plan.", notice: null };
  }

  const supabase = await createClient();
  const args = {
    p_staff_id: text(formData, "staff_id"),
    p_amount_centavos: amount,
    p_advanced_on: text(formData, "advanced_on") || new Date().toISOString().slice(0, 10),
    p_source: source,
    p_reason: opt(formData, "reason"),
    p_deduction_plan: plan,
  };

  const { error } = await supabase.rpc(
    "give_cash_advance",
    args as unknown as Database["public"]["Functions"]["give_cash_advance"]["Args"],
  );
  if (error) return { error: error.message, notice: null };

  revalidatePath("/admin/payroll");
  return { error: null, notice: "Advance given." };
}
