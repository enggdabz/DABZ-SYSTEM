import "server-only";

/**
 * Reading the staff, attendance and payroll tables (spec 13).
 *
 * Everything goes through the ordinary server client, so Row Level Security
 * decides what comes back: an owner sees everyone, a staff member sees only
 * themselves, and the screens do not have to remember the difference.
 */
import { cache } from "react";

import { getSettings } from "@/lib/auth/dal";
import type { Centavos } from "@/lib/money";
import {
  describeAttendance,
  outstandingAdvance,
  suggestDayType,
  type AttendanceForDay,
  type DayType,
} from "@/lib/payroll";
import {
  civilDateToISO,
  manilaToday,
  parseISODate,
  scheduledHours,
  startOfWeek,
  weekDays,
  type CivilDate,
} from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface StaffMember {
  id: string;
  profileId: string | null;
  fullName: string;
  position: string | null;
  photoPath: string | null;
  contactNumber: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactNumber: string | null;
  startDate: CivilDate | null;
  /** Null when the owner has not set it yet. Payroll refuses to guess. */
  dailyRateCentavos: Centavos | null;
  divisions: string[];
  status: "active" | "inactive";
  note: string | null;
}

export const getStaff = cache(async (): Promise<StaffMember[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("staff")
    .select(
      "id, profile_id, full_name, position, photo_path, contact_number, address, emergency_contact_name, emergency_contact_number, start_date, daily_rate_centavos, divisions, status, note",
    )
    .order("status", { ascending: false })
    .order("full_name");

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    fullName: row.full_name,
    position: row.position,
    photoPath: row.photo_path,
    contactNumber: row.contact_number,
    address: row.address,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactNumber: row.emergency_contact_number,
    startDate: row.start_date ? parseISODate(row.start_date) : null,
    dailyRateCentavos:
      row.daily_rate_centavos === null ? null : Number(row.daily_rate_centavos),
    divisions: row.divisions ?? [],
    status: row.status === "inactive" ? "inactive" : "active",
    note: row.note,
  }));
});

export interface AttendanceRow {
  id: string;
  staffId: string;
  workDate: CivilDate;
  timeIn: string | null;
  timeOut: string | null;
  recordedBy: string | null;
  correctedBy: string | null;
  note: string | null;
}

/** Attendance for a range of days, newest first. */
export const getAttendance = cache(
  async (options: { from: CivilDate; to: CivilDate }): Promise<AttendanceRow[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("attendance_entries")
      .select("id, staff_id, work_date, time_in, time_out, recorded_by, corrected_by, note")
      .gte("work_date", civilDateToISO(options.from))
      .lte("work_date", civilDateToISO(options.to))
      .order("work_date", { ascending: false });

    if (error || !data) return [];

    return data.flatMap((row) => {
      const workDate = parseISODate(row.work_date);
      if (!workDate) return [];
      return [
        {
          id: row.id,
          staffId: row.staff_id,
          workDate,
          timeIn: row.time_in,
          timeOut: row.time_out,
          recordedBy: row.recorded_by,
          correctedBy: row.corrected_by,
          note: row.note,
        },
      ];
    });
  },
);

/** Today's attendance, for the time clock. */
export const getTodaysAttendance = cache(async (): Promise<AttendanceRow[]> => {
  const today = manilaToday();
  return getAttendance({ from: today, to: today });
});

export interface PayrollWeekRow {
  id: string;
  staffId: string;
  weekStart: CivilDate;
  dailyRateCentavos: Centavos;
  bonusCentavos: Centavos;
  advanceDeductionCentavos: Centavos;
  grossCentavos: Centavos;
  netCentavos: Centavos;
  status: "draft" | "paid";
  paidOn: CivilDate | null;
  paidSource: string | null;
  unlockReason: string | null;
}

export interface PayrollDayRow {
  id: string;
  payrollWeekId: string;
  workDate: CivilDate;
  dayType: DayType;
  overtimeHours: number;
  overtimePayCentavos: Centavos;
}

export const getPayrollWeeks = cache(
  async (options?: { staffId?: string; limit?: number }): Promise<PayrollWeekRow[]> => {
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("payroll_weeks")
      .select(
        "id, staff_id, week_start, daily_rate_centavos, bonus_centavos, advance_deduction_centavos, gross_centavos, net_centavos, status, paid_on, paid_source, unlock_reason",
      )
      .order("week_start", { ascending: false })
      .limit(options?.limit ?? 60);

    if (options?.staffId) query = query.eq("staff_id", options.staffId);

    const { data, error } = await query;
    if (error || !data) return [];

    return data.flatMap((row) => {
      const weekStart = parseISODate(row.week_start);
      if (!weekStart) return [];
      return [
        {
          id: row.id,
          staffId: row.staff_id,
          weekStart,
          dailyRateCentavos: Number(row.daily_rate_centavos),
          bonusCentavos: Number(row.bonus_centavos),
          advanceDeductionCentavos: Number(row.advance_deduction_centavos),
          grossCentavos: Number(row.gross_centavos),
          netCentavos: Number(row.net_centavos),
          status: row.status === "paid" ? "paid" : "draft",
          paidOn: row.paid_on ? parseISODate(row.paid_on) : null,
          paidSource: row.paid_source,
          unlockReason: row.unlock_reason,
        },
      ];
    });
  },
);

export const getPayrollDays = cache(
  async (weekId: string): Promise<PayrollDayRow[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("payroll_days")
      .select("id, payroll_week_id, work_date, day_type, overtime_hours, overtime_pay_centavos")
      .eq("payroll_week_id", weekId)
      .order("work_date");

    if (error || !data) return [];

    return data.flatMap((row) => {
      const workDate = parseISODate(row.work_date);
      if (!workDate) return [];
      return [
        {
          id: row.id,
          payrollWeekId: row.payroll_week_id,
          workDate,
          dayType: row.day_type as DayType,
          overtimeHours: Number(row.overtime_hours),
          overtimePayCentavos: Number(row.overtime_pay_centavos),
        },
      ];
    });
  },
);

export interface CashAdvanceRow {
  id: string;
  staffId: string;
  amountCentavos: Centavos;
  advancedOn: CivilDate;
  source: string;
  reason: string | null;
  deductionPlan: "next_payday" | "in_parts" | "decide_on_payday";
}

export const getCashAdvances = cache(async (): Promise<CashAdvanceRow[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_advances")
    .select("id, staff_id, amount_centavos, advanced_on, source, reason, deduction_plan")
    .order("advanced_on", { ascending: false })
    .limit(300);

  if (error || !data) return [];

  return data.flatMap((row) => {
    const advancedOn = parseISODate(row.advanced_on);
    if (!advancedOn) return [];
    return [
      {
        id: row.id,
        staffId: row.staff_id,
        amountCentavos: Number(row.amount_centavos),
        advancedOn,
        source: row.source,
        reason: row.reason,
        deductionPlan: row.deduction_plan as CashAdvanceRow["deductionPlan"],
      },
    ];
  });
});

export interface AdvanceDeductionRow {
  id: string;
  staffId: string;
  payrollWeekId: string | null;
  amountCentavos: Centavos;
}

export const getAdvanceDeductions = cache(
  async (): Promise<AdvanceDeductionRow[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("advance_deductions")
      .select("id, staff_id, payroll_week_id, amount_centavos")
      .limit(500);

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      staffId: row.staff_id,
      payrollWeekId: row.payroll_week_id,
      amountCentavos: Number(row.amount_centavos),
    }));
  },
);

/** What each staff member still owes in cash advances (spec 13.4). */
export const getAdvanceBalances = cache(
  async (): Promise<Map<string, Centavos>> => {
    const [advances, deductions] = await Promise.all([
      getCashAdvances(),
      getAdvanceDeductions(),
    ]);

    const balances = new Map<string, Centavos>();
    const staffIds = new Set([
      ...advances.map((advance) => advance.staffId),
      ...deductions.map((deduction) => deduction.staffId),
    ]);

    for (const staffId of staffIds) {
      balances.set(
        staffId,
        outstandingAdvance(
          advances.filter((advance) => advance.staffId === staffId),
          deductions.filter((deduction) => deduction.staffId === staffId),
        ),
      );
    }

    return balances;
  },
);

/**
 * The seven days of a payroll week for one person, with attendance worked out
 * and a suggested day type for any day the owner has not decided yet.
 */
export async function buildWeekView(options: {
  staffId: string;
  weekStart: CivilDate;
  existingDays: readonly PayrollDayRow[];
}) {
  const settings = await getSettings();
  const perDay = scheduledHours(settings.workDayStart, settings.workDayEnd);
  const days = weekDays(options.weekStart);

  const attendance = await getAttendance({
    from: days[0],
    to: days[6],
  });

  return days.map((date) => {
    const iso = civilDateToISO(date);
    const entry = attendance.find(
      (row) => row.staffId === options.staffId && civilDateToISO(row.workDate) === iso,
    );

    const described = describeAttendance({
      date,
      timeIn: entry?.timeIn ?? null,
      timeOut: entry?.timeOut ?? null,
      workDayStart: settings.workDayStart,
      scheduledHoursPerDay: perDay,
    });

    const stored = options.existingDays.find(
      (day) => civilDateToISO(day.workDate) === iso,
    );

    const attendanceOnly: AttendanceForDay = {
      date,
      timeIn: described.timeIn,
      timeOut: described.timeOut,
      hoursWorked: described.hoursWorked,
      late: described.late,
      forgotTimeOut: described.forgotTimeOut,
    };

    return {
      date,
      attendance: attendanceOnly,
      /** What the system would guess, shown only as a hint. */
      suggestedDayType: suggestDayType(attendanceOnly, perDay),
      /** The owner's stored choice, if they have made one. */
      storedDayType: stored?.dayType ?? null,
      dayType: stored?.dayType ?? suggestDayType(attendanceOnly, perDay),
      overtimeHours: stored?.overtimeHours ?? described.overtimeHours,
      overtimePayCentavos: stored?.overtimePayCentavos ?? 0,
      attendanceId: entry?.id ?? null,
    };
  });
}

/** The payroll week that today falls in, per the week-start setting. */
export async function currentWeekStart(): Promise<CivilDate> {
  const settings = await getSettings();
  return startOfWeek(manilaToday(), settings.weekStartsOn);
}

/**
 * Estimated monthly payroll, for the daily target (spec 12.3).
 *
 * Each active staff member's daily rate times the shop's working days per
 * month. Returns null when nobody has a rate yet, so the Overview can say the
 * target is incomplete rather than quietly pretending wages are zero.
 */
export const getEstimatedMonthlyPayroll = cache(
  async (): Promise<{
    centavos: Centavos | null;
    staffWithRates: number;
    staffWithoutRates: number;
  }> => {
    const [staff, settings] = await Promise.all([getStaff(), getSettings()]);
    const active = staff.filter((member) => member.status === "active");

    const withRates = active.filter((member) => member.dailyRateCentavos !== null);
    const withoutRates = active.length - withRates.length;

    if (withRates.length === 0) {
      return { centavos: null, staffWithRates: 0, staffWithoutRates: withoutRates };
    }

    const centavos = withRates.reduce(
      (total, member) =>
        total + (member.dailyRateCentavos ?? 0) * settings.workingDaysPerMonth,
      0,
    );

    return {
      centavos,
      staffWithRates: withRates.length,
      staffWithoutRates: withoutRates,
    };
  },
);

/**
 * Login accounts, for the "link a login" dropdown on the Staff screen.
 *
 * Tolerant of failure like the rest of this file: if the query cannot run, the
 * dropdown is simply empty rather than the whole screen erroring. Everything
 * else on the page still works.
 */
export const getAccountOptions = cache(
  async (): Promise<{ id: string; label: string }[]> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, role")
        .order("username");

      if (error || !data) return [];

      return data.map((profile) => ({
        id: profile.id,
        label: `${profile.full_name} (${profile.username}) · ${profile.role}`,
      }));
    } catch {
      return [];
    }
  },
);

/**
 * Login accounts with their permissions, for the Accounts screen.
 *
 * Tolerant of failure like the rest of this file: a screen should show what it
 * can rather than erroring out completely if one query fails.
 */
export interface AccountRow {
  id: string;
  username: string;
  fullName: string;
  role: string;
  status: "active" | "inactive";
  mustChangePassword: boolean;
  createdAt: string;
  permissions: string[];
}

export const getAccounts = cache(
  async (): Promise<{ accounts: AccountRow[]; error: string | null }> => {
    try {
      const supabase = await createSupabaseServerClient();

      const [{ data, error }, { data: permissionRows }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, full_name, role, status, must_change_password, created_at")
          .order("role")
          .order("username"),
        supabase.from("user_permissions").select("user_id, permission"),
      ]);

      if (error || !data) {
        return { accounts: [], error: error?.message ?? "Could not load the accounts." };
      }

      const byUser = new Map<string, string[]>();
      for (const row of permissionRows ?? []) {
        const list = byUser.get(row.user_id) ?? [];
        list.push(row.permission);
        byUser.set(row.user_id, list);
      }

      return {
        accounts: data.map((row) => ({
          id: row.id,
          username: row.username,
          fullName: row.full_name,
          role: row.role,
          status: row.status === "inactive" ? "inactive" : "active",
          mustChangePassword: row.must_change_password,
          createdAt: row.created_at,
          permissions: byUser.get(row.id) ?? [],
        })),
        error: null,
      };
    } catch (caught) {
      return {
        accounts: [],
        error:
          caught instanceof Error
            ? caught.message
            : "Could not reach the database.",
      };
    }
  },
);
