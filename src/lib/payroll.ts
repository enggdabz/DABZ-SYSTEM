/**
 * Weekly payroll at a daily rate (spec 13.3).
 *
 * This file decides what a person is paid. Every rule in it came from the
 * owner, and every one is tested:
 *
 *   - A day with a time-in pays the full daily rate. No time-in on a working
 *     day pays nothing.
 *   - A HALF DAY PAYS HALF THE DAILY RATE (open decision 17.6, answered).
 *   - Overtime is the owner's choice, per day: either no OT pay, or an amount
 *     they type in. The hours are recorded either way.
 *   - A cash advance deduction can never push net pay below zero; whatever
 *     will not fit carries over to the next payday.
 *
 * Whether a day counts as a half day is the OWNER'S choice, not the system's.
 * The system can suggest it - someone who worked two hours of a nine-hour day
 * probably did half a day - but it never decides, because a wrongly guessed
 * half day is a wrong wage.
 */
import { sumCentavos, type Centavos } from "./money";
import type { CivilDate } from "./period";

/** What the owner decided this day is worth (spec 13.3). */
export type DayType = "full" | "half" | "absent";

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  full: "Full day",
  half: "Half day",
  absent: "Absent",
};

export interface AttendanceForDay {
  date: CivilDate;
  /** Stored timestamps, or null. */
  timeIn: string | null;
  timeOut: string | null;
  /** Worked out from time in and out. Null when either is missing. */
  hoursWorked: number | null;
  /** Timed in after the shop's start time (spec 13.2). */
  late: boolean;
  /** Timed in but never out, so the owner has to correct it (spec 13.2). */
  forgotTimeOut: boolean;
}

export interface PayrollDayInput extends AttendanceForDay {
  /** The owner's choice for this day. */
  dayType: DayType;
  /** Hours beyond the scheduled day. Recorded whether or not they are paid. */
  overtimeHours: number;
  /**
   * What the owner chose to pay for those hours. Zero means "no OT pay",
   * which is an explicit choice, not a missing value (spec 13.3).
   */
  overtimePayCentavos: Centavos;
}

/** What a single day pays, before overtime. */
export function dayPay(dailyRateCentavos: Centavos, dayType: DayType): Centavos {
  if (dailyRateCentavos < 0) {
    throw new Error("A daily rate cannot be negative");
  }

  switch (dayType) {
    case "full":
      return dailyRateCentavos;
    case "half":
      // Half the daily rate, rounded to the nearest centavo. On a whole-peso
      // rate the halves are exact; an odd-centavo rate can differ from a true
      // half by one centavo.
      return Math.round(dailyRateCentavos / 2);
    case "absent":
      return 0;
  }
}

/**
 * Suggests what kind of day this was, from the attendance alone.
 *
 * Only ever a suggestion. The owner's stored choice always wins.
 */
export function suggestDayType(
  attendance: AttendanceForDay,
  scheduledHoursPerDay: number,
): DayType {
  if (attendance.timeIn === null) return "absent";

  // Timed in but no time-out: nobody knows how long they stayed, so treat it
  // as a full day and let the owner correct the missing time-out.
  if (attendance.hoursWorked === null) return "full";

  if (
    scheduledHoursPerDay > 0 &&
    attendance.hoursWorked < scheduledHoursPerDay / 2
  ) {
    return "half";
  }

  return "full";
}

export interface WeeklyPayrollInput {
  dailyRateCentavos: Centavos;
  days: readonly PayrollDayInput[];
  /** An optional extra line the owner can add (spec 13.3). */
  bonusCentavos: Centavos;
  /** What the owner chose to take off this payday for a cash advance. */
  requestedAdvanceDeductionCentavos: Centavos;
  /** What the person still owes in advances, before this deduction. */
  outstandingAdvanceCentavos: Centavos;
}

export interface WeeklyPayroll {
  dayPayTotalCentavos: Centavos;
  overtimePayTotalCentavos: Centavos;
  bonusCentavos: Centavos;
  grossCentavos: Centavos;
  /** What was actually taken off, which may be less than asked for. */
  advanceDeductionCentavos: Centavos;
  netCentavos: Centavos;
  /** The part of the requested deduction that would not fit. */
  deductionCarriedOverCentavos: Centavos;
  /** What is still owed in advances after this payday. */
  remainingAdvanceCentavos: Centavos;
  /** True when the owner asked to deduct more than the person earned. */
  deductionExceededGross: boolean;
  fullDays: number;
  halfDays: number;
  absences: number;
  overtimeHoursTotal: number;
  lateDays: number;
  daysMissingTimeOut: number;
}

export function computeWeeklyPayroll(input: WeeklyPayrollInput): WeeklyPayroll {
  const {
    dailyRateCentavos,
    days,
    bonusCentavos,
    requestedAdvanceDeductionCentavos,
    outstandingAdvanceCentavos,
  } = input;

  if (!Number.isInteger(dailyRateCentavos) || dailyRateCentavos < 0) {
    throw new Error("The daily rate must be a whole number of centavos, and not negative");
  }
  if (!Number.isInteger(bonusCentavos) || bonusCentavos < 0) {
    throw new Error("A bonus must be a whole number of centavos, and not negative");
  }
  if (
    !Number.isInteger(requestedAdvanceDeductionCentavos) ||
    requestedAdvanceDeductionCentavos < 0
  ) {
    throw new Error("A deduction must be a whole number of centavos, and not negative");
  }

  const dayPayTotalCentavos = sumCentavos(
    days.map((day) => dayPay(dailyRateCentavos, day.dayType)),
  );
  const overtimePayTotalCentavos = sumCentavos(
    days.map((day) => day.overtimePayCentavos),
  );

  const grossCentavos =
    dayPayTotalCentavos + overtimePayTotalCentavos + bonusCentavos;

  // Never deduct more than the person actually earned, or more than they owe.
  const deductible = Math.min(
    requestedAdvanceDeductionCentavos,
    outstandingAdvanceCentavos,
  );
  const advanceDeductionCentavos = Math.min(deductible, grossCentavos);

  return {
    dayPayTotalCentavos,
    overtimePayTotalCentavos,
    bonusCentavos,
    grossCentavos,
    advanceDeductionCentavos,
    netCentavos: grossCentavos - advanceDeductionCentavos,
    deductionCarriedOverCentavos: deductible - advanceDeductionCentavos,
    remainingAdvanceCentavos:
      outstandingAdvanceCentavos - advanceDeductionCentavos,
    deductionExceededGross: deductible > grossCentavos,
    fullDays: days.filter((day) => day.dayType === "full").length,
    halfDays: days.filter((day) => day.dayType === "half").length,
    absences: days.filter((day) => day.dayType === "absent").length,
    overtimeHoursTotal: days.reduce((total, day) => total + day.overtimeHours, 0),
    lateDays: days.filter((day) => day.late).length,
    daysMissingTimeOut: days.filter((day) => day.forgotTimeOut).length,
  };
}

// ---------------------------------------------------------------------------
// Attendance (spec 13.2)
// ---------------------------------------------------------------------------

/**
 * Turns a time-in and time-out into hours, lateness and overtime.
 *
 * Both times are stored as UTC timestamps; the comparison against the shop's
 * opening time is done on the Manila clock, because that is the clock the staff
 * are working to.
 */
export function describeAttendance(options: {
  date: CivilDate;
  timeIn: string | null;
  timeOut: string | null;
  /** From settings, e.g. "08:00". */
  workDayStart: string;
  scheduledHoursPerDay: number;
  /** Minutes of grace before someone counts as late. */
  lateGraceMinutes?: number;
}): AttendanceForDay & { overtimeHours: number } {
  const {
    date,
    timeIn,
    timeOut,
    workDayStart,
    scheduledHoursPerDay,
    lateGraceMinutes = 0,
  } = options;

  if (timeIn === null) {
    return {
      date,
      timeIn: null,
      timeOut: null,
      hoursWorked: null,
      late: false,
      forgotTimeOut: false,
      overtimeHours: 0,
    };
  }

  const inAt = new Date(timeIn);
  const outAt = timeOut === null ? null : new Date(timeOut);

  const hoursWorked =
    outAt === null
      ? null
      : Math.max(0, (outAt.getTime() - inAt.getTime()) / 3_600_000);

  // Minutes past midnight, Manila time.
  const manilaMinutes = manilaMinutesOfDay(inAt);
  const [startHour, startMinute] = workDayStart.split(":").map(Number);
  const startMinutes = startHour * 60 + startMinute;

  const overtimeHours =
    hoursWorked === null || scheduledHoursPerDay <= 0
      ? 0
      : // Rounded to a quarter of an hour: the shop is not going to argue over
        // ninety seconds, and a tidy figure is easier to check by hand.
        Math.max(0, Math.round((hoursWorked - scheduledHoursPerDay) * 4) / 4);

  return {
    date,
    timeIn,
    timeOut,
    hoursWorked,
    late: manilaMinutes > startMinutes + lateGraceMinutes,
    forgotTimeOut: timeOut === null,
    overtimeHours,
  };
}

/** Minutes past midnight in Manila for a stored timestamp. */
export function manilaMinutesOfDay(value: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return get("hour") * 60 + get("minute");
}

/** "8h 30m" - easier to read on a payslip than "8.5". */
export function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (minutes === 0) return `${wholeHours}h`;
  if (wholeHours === 0) return `${minutes}m`;
  return `${wholeHours}h ${minutes}m`;
}

// ---------------------------------------------------------------------------
// Cash advances (spec 13.4)
// ---------------------------------------------------------------------------

export interface CashAdvanceRecord {
  amountCentavos: Centavos;
}

export interface AdvanceDeductionRecord {
  amountCentavos: Centavos;
}

/** What a person still owes: everything advanced, less everything deducted. */
export function outstandingAdvance(
  advances: readonly CashAdvanceRecord[],
  deductions: readonly AdvanceDeductionRecord[],
): Centavos {
  const advanced = sumCentavos(advances.map((advance) => advance.amountCentavos));
  const deducted = sumCentavos(
    deductions.map((deduction) => deduction.amountCentavos),
  );
  // Cannot be owed backwards; an over-deduction simply clears the balance.
  return Math.max(0, advanced - deducted);
}
