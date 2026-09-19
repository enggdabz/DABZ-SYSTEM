/**
 * A payroll summary for any run of dates (spec 13.3).
 *
 * WHY THIS FILE EXISTS
 * A payslip answers "what does this person get this week?". The owner also has
 * to answer "what did wages cost me in September?", and that question does not
 * line up with payroll weeks: a week starting 28 September is paid partly out
 * of September and partly out of October.
 *
 * So this file adds a summary up from the SAVED DAYS rather than from the
 * stored week totals, exactly as a payslip adds up its own rows. A stored
 * weekly total cannot be cut in half honestly; seven saved days can.
 *
 * THE SPLIT-WEEK RULE, which is the whole difficulty here:
 *
 *   - Day pay and overtime are counted DAY BY DAY. Only the days inside the
 *     range count, so 28-30 September falls in September and 1-4 October falls
 *     in October.
 *   - A week's bonus and its cash advance deduction belong to whichever range
 *     contains the week's FIRST DAY. They are single figures for the whole
 *     week, and there is no honest way to split them across a month boundary.
 *     Attaching them to the first day means that two consecutive summaries
 *     count each one EXACTLY ONCE - never twice, and never not at all.
 *
 * Nothing here reads the database or knows about React. Everything it needs is
 * passed in, so every rule below is tested in `payroll-summary.test.ts`.
 */
import { sumCentavos, type Centavos } from "./money";
import { dayPay, type DayType } from "./payroll";
import {
  addDays,
  addMonths,
  civilDateToISO,
  daysBetween,
  daysInMonth,
  parseISODate,
  startOfWeek,
  type CivilDate,
  type WeekStart,
} from "./period";

/** Manila calendar dates, inclusive at BOTH ends. */
export interface DateRange {
  fromISO: string;
  toISO: string;
}

// ---------------------------------------------------------------------------
// Which dates
// ---------------------------------------------------------------------------

export const SUMMARY_PRESETS = [
  "this_week",
  "last_week",
  "this_month",
  "last_month",
] as const;

export type SummaryPreset = (typeof SUMMARY_PRESETS)[number];

export const SUMMARY_PRESET_LABELS: Record<SummaryPreset, string> = {
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
  last_month: "Last month",
};

function monthRange(year: number, month: number): DateRange {
  const period = { year, month };
  return {
    fromISO: civilDateToISO({ year, month, day: 1 }),
    toISO: civilDateToISO({ year, month, day: daysInMonth(period) }),
  };
}

/**
 * The dates behind a quick pick.
 *
 * A week here is a WHOLE payroll week - seven days, per the shop's week-start
 * setting - and a month is a whole calendar month, not "so far". This is a
 * wage sheet for a pay period, and a pay period does not stop at today; days
 * that have not happened yet simply have nothing saved against them.
 */
export function rangeForSummaryPreset(
  preset: SummaryPreset,
  today: CivilDate,
  weekStartsOn: WeekStart,
): DateRange {
  switch (preset) {
    case "this_week": {
      const start = startOfWeek(today, weekStartsOn);
      return { fromISO: civilDateToISO(start), toISO: civilDateToISO(addDays(start, 6)) };
    }
    case "last_week": {
      const start = addDays(startOfWeek(today, weekStartsOn), -7);
      return { fromISO: civilDateToISO(start), toISO: civilDateToISO(addDays(start, 6)) };
    }
    case "this_month":
      return monthRange(today.year, today.month);
    case "last_month": {
      const previous = addMonths({ year: today.year, month: today.month }, -1);
      return monthRange(previous.year, previous.month);
    }
  }
}

/**
 * The longest range a summary will add up.
 *
 * Not a technical limit - it is a guard against a typo. "2026" typed into a
 * year box gives a range of two thousand years, and the sheet that came back
 * would be a wall of nothing rather than an obvious mistake. Just over a year
 * covers any real payroll question the shop has.
 */
export const MAX_RANGE_DAYS = 400;

export type RangeProblem = "unreadable" | "too_long";

export interface ResolvedRange extends DateRange {
  /** Whole days covered, both ends included. */
  days: number;
  /** True when the two dates arrived the wrong way round and were swapped. */
  swapped: boolean;
}

export type RangeOutcome =
  | { ok: true; range: ResolvedRange }
  | { ok: false; problem: RangeProblem; title: string; detail: string };

/**
 * Turns whatever is in the address bar into a range, or says why it cannot.
 *
 * The wording of a refusal lives here rather than on the screen, so the screen
 * and the tests cannot drift apart - the same reason `deletable.ts` exists.
 */
export function resolveRange(input: {
  from?: string | null;
  to?: string | null;
  /** Used for whichever end was not given. */
  fallback: DateRange;
}): RangeOutcome {
  const rawFrom = (input.from ?? "").trim();
  const rawTo = (input.to ?? "").trim();

  const from = parseISODate(rawFrom === "" ? input.fallback.fromISO : rawFrom);
  const to = parseISODate(rawTo === "" ? input.fallback.toISO : rawTo);

  if (!from || !to) {
    return {
      ok: false,
      problem: "unreadable",
      title: "Those dates could not be read",
      detail:
        "A date is written like 2026-09-01. Nothing is added up rather than guessing which days were meant.",
    };
  }

  // Wrong way round is a slip, not a mistake worth refusing: swap them and say
  // so, because silently swapping would leave the owner unsure what was added.
  const swapped = daysBetween(from, to) < 0;
  const [start, end] = swapped ? [to, from] : [from, to];
  const days = daysBetween(start, end) + 1;

  if (days > MAX_RANGE_DAYS) {
    return {
      ok: false,
      problem: "too_long",
      title: `That is ${days.toLocaleString("en-PH")} days, and a summary covers at most ${MAX_RANGE_DAYS}`,
      detail:
        "Usually a year or more here means a mistyped year. Pick a shorter run of dates, or print one summary per month.",
    };
  }

  return {
    ok: true,
    range: {
      fromISO: civilDateToISO(start),
      toISO: civilDateToISO(end),
      days,
      swapped,
    },
  };
}

// ---------------------------------------------------------------------------
// What goes in
// ---------------------------------------------------------------------------

export interface SummaryStaff {
  id: string;
  fullName: string;
  position: string | null;
  /** Null when the owner has not set one. Payroll never guesses a wage. */
  dailyRateCentavos: Centavos | null;
  status: "active" | "inactive";
}

export interface SummaryWeek {
  id: string;
  staffId: string;
  weekStartISO: string;
  /** Copied onto the week when it was saved, never read live from staff. */
  dailyRateCentavos: Centavos;
  bonusCentavos: Centavos;
  advanceDeductionCentavos: Centavos;
  /** What the week says it comes to. Compared against, never trusted. */
  storedGrossCentavos: Centavos;
  storedNetCentavos: Centavos;
  status: "draft" | "paid";
}

export interface SummaryDay {
  payrollWeekId: string;
  workDateISO: string;
  dayType: DayType;
  overtimeHours: number;
  overtimePayCentavos: Centavos;
}

// ---------------------------------------------------------------------------
// What comes out
// ---------------------------------------------------------------------------

/** Whether the weeks behind a row have actually been handed over. */
export type PaidStatus = "paid" | "partly" | "unpaid";

export const PAID_STATUS_LABELS: Record<PaidStatus, string> = {
  paid: "✓ Paid",
  partly: "Partly paid",
  unpaid: "Not yet paid",
};

export interface SummaryRow {
  staffId: string;
  fullName: string;
  position: string | null;
  /** Every rate that was actually used, in week order. Usually just one. */
  ratesCentavos: Centavos[];
  fullDays: number;
  halfDays: number;
  /** Full days plus half of the half days, e.g. 5.5. */
  daysPaid: number;
  dayPayCentavos: Centavos;
  overtimeHours: number;
  overtimePayCentavos: Centavos;
  /** Hours that were logged and not paid for. */
  overtimeUnpaidHours: number;
  bonusCentavos: Centavos;
  grossCentavos: Centavos;
  advanceDeductionCentavos: Centavos;
  netCentavos: Centavos;
  paidNetCentavos: Centavos;
  unpaidNetCentavos: Centavos;
  status: PaidStatus;
  /** One of this row's weeks runs past an end of the range. */
  includesPartWeek: boolean;
  /** A whole week's saved days do not add up to what the week stores. */
  needsSaving: boolean;
  weekCount: number;
}

export interface SummaryTotals {
  staffCount: number;
  fullDays: number;
  halfDays: number;
  daysPaid: number;
  dayPayCentavos: Centavos;
  overtimePayCentavos: Centavos;
  bonusCentavos: Centavos;
  grossCentavos: Centavos;
  advanceDeductionCentavos: Centavos;
  netCentavos: Centavos;
  paidNetCentavos: Centavos;
  unpaidNetCentavos: Centavos;
}

export interface PayrollSummary {
  fromISO: string;
  toISO: string;
  rows: SummaryRow[];
  totals: SummaryTotals;
  /** Active staff with a rate who have nothing saved in these dates. */
  missingNames: string[];
  anyPartWeek: boolean;
  anyNeedsSaving: boolean;
}

/** The one wording of the split-week rule, printed under the table. */
export const PART_WEEK_NOTE =
  "A payroll week that runs past these dates is counted day by day: only the days inside the range are paid here. The week's bonus and cash advance deduction are counted whole, in the summary that contains the week's first day, so two summaries side by side count each one exactly once.";

// ---------------------------------------------------------------------------
// The calculation
// ---------------------------------------------------------------------------

interface WeekContribution {
  dayPayCentavos: Centavos;
  overtimeHours: number;
  overtimePayCentavos: Centavos;
  overtimeUnpaidHours: number;
  bonusCentavos: Centavos;
  advanceDeductionCentavos: Centavos;
  grossCentavos: Centavos;
  netCentavos: Centavos;
  fullDays: number;
  halfDays: number;
  rateCentavos: Centavos;
  wholeWeek: boolean;
  mismatched: boolean;
  paid: boolean;
}

export function buildPayrollSummary(input: {
  range: DateRange;
  staff: readonly SummaryStaff[];
  weeks: readonly SummaryWeek[];
  days: readonly SummaryDay[];
}): PayrollSummary {
  const { fromISO, toISO } = input.range;

  const daysByWeek = new Map<string, SummaryDay[]>();
  for (const day of input.days) {
    const list = daysByWeek.get(day.payrollWeekId);
    if (list) list.push(day);
    else daysByWeek.set(day.payrollWeekId, [day]);
  }

  const staffById = new Map(input.staff.map((member) => [member.id, member]));

  const weeksByStaff = new Map<string, SummaryWeek[]>();
  // Week order decides the order the rates are printed in, so sort once here
  // rather than hoping the caller did.
  const orderedWeeks = [...input.weeks].sort((a, b) =>
    a.weekStartISO.localeCompare(b.weekStartISO),
  );
  for (const week of orderedWeeks) {
    const list = weeksByStaff.get(week.staffId);
    if (list) list.push(week);
    else weeksByStaff.set(week.staffId, [week]);
  }

  const rows: SummaryRow[] = [];

  for (const [staffId, weeks] of weeksByStaff) {
    const member = staffById.get(staffId);
    // A week whose person cannot be read is left out: there is no name to
    // print it against. Row Level Security can hide a staff row this way.
    if (!member) continue;

    const contributions: WeekContribution[] = [];

    for (const week of weeks) {
      const weekStart = parseISODate(week.weekStartISO);
      if (!weekStart) continue;

      const weekEndISO = civilDateToISO(addDays(weekStart, 6));
      const startsInRange =
        week.weekStartISO >= fromISO && week.weekStartISO <= toISO;
      const wholeWeek = startsInRange && weekEndISO <= toISO;

      const daysInRange = (daysByWeek.get(week.id) ?? []).filter(
        (day) => day.workDateISO >= fromISO && day.workDateISO <= toISO,
      );

      // A bonus and an advance deduction are single figures for a whole week,
      // so they go to the range holding the week's first day - see the note at
      // the top of this file.
      const bonusCentavos = startsInRange ? week.bonusCentavos : 0;
      const advanceDeductionCentavos = startsInRange
        ? week.advanceDeductionCentavos
        : 0;

      /*
        A week with nothing inside the range is left out entirely.

        The stored totals count as "something" when the week's first day is in
        range: a week that claims a gross with no saved days under it is
        exactly the "needs saving again" case, and dropping it would hide the
        one thing the owner most needs to be told about.
      */
      const hasFigures =
        daysInRange.length > 0 ||
        (startsInRange &&
          (bonusCentavos !== 0 ||
            advanceDeductionCentavos !== 0 ||
            week.storedGrossCentavos !== 0 ||
            week.storedNetCentavos !== 0));
      if (!hasFigures) continue;

      const dayPayCentavos = sumCentavos(
        daysInRange.map((day) => dayPay(week.dailyRateCentavos, day.dayType)),
      );
      const overtimePayCentavos = sumCentavos(
        daysInRange.map((day) => day.overtimePayCentavos),
      );
      const overtimeHours = daysInRange.reduce(
        (total, day) => total + day.overtimeHours,
        0,
      );
      const overtimeUnpaidHours = daysInRange.reduce(
        (total, day) =>
          day.overtimePayCentavos === 0 ? total + day.overtimeHours : total,
        0,
      );

      const grossCentavos =
        dayPayCentavos + overtimePayCentavos + bonusCentavos;
      // Net pay can never be negative: a deduction that does not fit carries
      // over instead (spec 13.4).
      const netCentavos = Math.max(0, grossCentavos - advanceDeductionCentavos);

      contributions.push({
        dayPayCentavos,
        overtimeHours,
        overtimePayCentavos,
        overtimeUnpaidHours,
        bonusCentavos,
        advanceDeductionCentavos,
        grossCentavos,
        netCentavos,
        fullDays: daysInRange.filter((day) => day.dayType === "full").length,
        halfDays: daysInRange.filter((day) => day.dayType === "half").length,
        rateCentavos: week.dailyRateCentavos,
        wholeWeek,
        /*
          Only a week that lies wholly inside the range can be compared with
          what it stores. Half a week SHOULD come to less than the stored
          total, so checking a cut week would raise a warning on every month
          boundary and teach the owner to ignore it.
        */
        mismatched:
          wholeWeek &&
          (grossCentavos !== week.storedGrossCentavos ||
            netCentavos !== week.storedNetCentavos),
        paid: week.status === "paid",
      });
    }

    if (contributions.length === 0) continue;

    const ratesCentavos: Centavos[] = [];
    for (const contribution of contributions) {
      if (!ratesCentavos.includes(contribution.rateCentavos)) {
        ratesCentavos.push(contribution.rateCentavos);
      }
    }

    const fullDays = contributions.reduce((total, c) => total + c.fullDays, 0);
    const halfDays = contributions.reduce((total, c) => total + c.halfDays, 0);
    const paidCount = contributions.filter((c) => c.paid).length;

    rows.push({
      staffId,
      fullName: member.fullName,
      position: member.position,
      ratesCentavos,
      fullDays,
      halfDays,
      daysPaid: fullDays + halfDays / 2,
      dayPayCentavos: sumCentavos(contributions.map((c) => c.dayPayCentavos)),
      overtimeHours: contributions.reduce((total, c) => total + c.overtimeHours, 0),
      overtimePayCentavos: sumCentavos(
        contributions.map((c) => c.overtimePayCentavos),
      ),
      overtimeUnpaidHours: contributions.reduce(
        (total, c) => total + c.overtimeUnpaidHours,
        0,
      ),
      bonusCentavos: sumCentavos(contributions.map((c) => c.bonusCentavos)),
      grossCentavos: sumCentavos(contributions.map((c) => c.grossCentavos)),
      advanceDeductionCentavos: sumCentavos(
        contributions.map((c) => c.advanceDeductionCentavos),
      ),
      netCentavos: sumCentavos(contributions.map((c) => c.netCentavos)),
      paidNetCentavos: sumCentavos(
        contributions.filter((c) => c.paid).map((c) => c.netCentavos),
      ),
      unpaidNetCentavos: sumCentavos(
        contributions.filter((c) => !c.paid).map((c) => c.netCentavos),
      ),
      status:
        paidCount === contributions.length
          ? "paid"
          : paidCount === 0
            ? "unpaid"
            : "partly",
      includesPartWeek: contributions.some((c) => !c.wholeWeek),
      needsSaving: contributions.some((c) => c.mismatched),
      weekCount: contributions.length,
    });
  }

  rows.sort((a, b) => a.fullName.localeCompare(b.fullName));

  const onTheSheet = new Set(rows.map((row) => row.staffId));
  const missingNames = input.staff
    .filter(
      (member) =>
        member.status === "active" &&
        member.dailyRateCentavos !== null &&
        !onTheSheet.has(member.id),
    )
    .map((member) => member.fullName)
    .sort((a, b) => a.localeCompare(b));

  const totals: SummaryTotals = {
    staffCount: rows.length,
    fullDays: rows.reduce((total, row) => total + row.fullDays, 0),
    halfDays: rows.reduce((total, row) => total + row.halfDays, 0),
    daysPaid: rows.reduce((total, row) => total + row.daysPaid, 0),
    dayPayCentavos: sumCentavos(rows.map((row) => row.dayPayCentavos)),
    overtimePayCentavos: sumCentavos(rows.map((row) => row.overtimePayCentavos)),
    bonusCentavos: sumCentavos(rows.map((row) => row.bonusCentavos)),
    grossCentavos: sumCentavos(rows.map((row) => row.grossCentavos)),
    advanceDeductionCentavos: sumCentavos(
      rows.map((row) => row.advanceDeductionCentavos),
    ),
    netCentavos: sumCentavos(rows.map((row) => row.netCentavos)),
    paidNetCentavos: sumCentavos(rows.map((row) => row.paidNetCentavos)),
    unpaidNetCentavos: sumCentavos(rows.map((row) => row.unpaidNetCentavos)),
  };

  return {
    fromISO,
    toISO,
    rows,
    totals,
    missingNames,
    anyPartWeek: rows.some((row) => row.includesPartWeek),
    anyNeedsSaving: rows.some((row) => row.needsSaving),
  };
}

// ---------------------------------------------------------------------------
// Printing the figures
// ---------------------------------------------------------------------------

/**
 * "5½" - days paid, written the way a wage sheet writes them.
 *
 * Two half days make a whole one, so three halves is 1½ rather than "3 half
 * days". The decimal is never printed: nobody writes 5.5 days on a payslip.
 */
export function formatDaysPaid(fullDays: number, halfDays: number): string {
  const whole = fullDays + Math.floor(halfDays / 2);
  const hasHalf = halfDays % 2 === 1;
  if (!hasHalf) return String(whole);
  return whole === 0 ? "½" : `${whole}½`;
}

/** "3 full, 1 half" - what the days-paid figure is made of. */
export function describeDayCounts(fullDays: number, halfDays: number): string {
  return `${fullDays} full, ${halfDays} half`;
}
