import { describe, expect, it } from "vitest";

import { parsePesos } from "./money";
import {
  MAX_RANGE_DAYS,
  buildPayrollSummary,
  describeDayCounts,
  formatDaysPaid,
  rangeForSummaryPreset,
  resolveRange,
  type SummaryDay,
  type SummaryStaff,
  type SummaryWeek,
} from "./payroll-summary";

/*
  The fixtures below all use Monday weeks, because the shop's default week
  starts on Monday. 7, 14, 21 and 28 September 2026 are Mondays, which makes
  the week of the 28th run into October - the split week every test about the
  month boundary is built on.
*/

const RATE = parsePesos("500"); // PHP 500 a day, so a half day is PHP 250.

function member(overrides: Partial<SummaryStaff> = {}): SummaryStaff {
  return {
    id: "s1",
    fullName: "Ana Cruz",
    position: "Printer operator",
    dailyRateCentavos: RATE,
    status: "active",
    ...overrides,
  };
}

function week(overrides: Partial<SummaryWeek> = {}): SummaryWeek {
  return {
    id: "w1",
    staffId: "s1",
    weekStartISO: "2026-09-07",
    dailyRateCentavos: RATE,
    bonusCentavos: 0,
    advanceDeductionCentavos: 0,
    storedGrossCentavos: 0,
    storedNetCentavos: 0,
    status: "draft",
    ...overrides,
  };
}

/** Full days from a week's Monday onward, which is how a normal week looks. */
function workdays(
  weekId: string,
  weekStartISO: string,
  count: number,
  overrides: Partial<SummaryDay> = {},
): SummaryDay[] {
  const [year, month, day] = weekStartISO.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day + index));
    return {
      payrollWeekId: weekId,
      workDateISO: date.toISOString().slice(0, 10),
      dayType: "full" as const,
      overtimeHours: 0,
      overtimePayCentavos: 0,
      ...overrides,
    };
  });
}

describe("rangeForSummaryPreset", () => {
  const today = { year: 2026, month: 9, day: 18 }; // a Friday

  it("gives the whole payroll week, not just the days so far", () => {
    // A wage sheet covers a pay period. Stopping at today would drop the
    // Saturday from a week that is still being worked.
    expect(rangeForSummaryPreset("this_week", today, "monday")).toEqual({
      fromISO: "2026-09-14",
      toISO: "2026-09-20",
    });
  });

  it("follows the shop's week-start setting", () => {
    expect(rangeForSummaryPreset("this_week", today, "sunday")).toEqual({
      fromISO: "2026-09-13",
      toISO: "2026-09-19",
    });
  });

  it("steps back a whole week for last week", () => {
    expect(rangeForSummaryPreset("last_week", today, "monday")).toEqual({
      fromISO: "2026-09-07",
      toISO: "2026-09-13",
    });
  });

  it("gives a whole calendar month either side of today", () => {
    expect(rangeForSummaryPreset("this_month", today, "monday")).toEqual({
      fromISO: "2026-09-01",
      toISO: "2026-09-30",
    });
    expect(rangeForSummaryPreset("last_month", today, "monday")).toEqual({
      fromISO: "2026-08-01",
      toISO: "2026-08-31",
    });
  });

  it("steps back over a year end without a special case", () => {
    expect(
      rangeForSummaryPreset("last_month", { year: 2027, month: 1, day: 9 }, "monday"),
    ).toEqual({ fromISO: "2026-12-01", toISO: "2026-12-31" });
  });
});

describe("resolveRange", () => {
  const fallback = { fromISO: "2026-09-14", toISO: "2026-09-20" };

  it("falls back to the current payroll week when no dates are given", () => {
    const outcome = resolveRange({ fallback });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.range).toMatchObject({ ...fallback, days: 7, swapped: false });
  });

  it("swaps dates entered the wrong way round, and says it did", () => {
    const outcome = resolveRange({
      from: "2026-09-30",
      to: "2026-09-01",
      fallback,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.range).toMatchObject({
      fromISO: "2026-09-01",
      toISO: "2026-09-30",
      days: 30,
      swapped: true,
    });
  });

  it("counts a single day as one day, not none", () => {
    const outcome = resolveRange({
      from: "2026-09-18",
      to: "2026-09-18",
      fallback,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.range).toMatchObject({ days: 1, swapped: false });
  });

  it("refuses a date it cannot read rather than guessing", () => {
    for (const bad of ["not-a-date", "2026-13-01", "2026-02-30", "18/09/2026"]) {
      const outcome = resolveRange({ from: bad, to: "2026-09-18", fallback });
      expect(outcome.ok, bad).toBe(false);
      if (outcome.ok) continue;
      expect(outcome.problem).toBe("unreadable");
      expect(outcome.title).not.toBe("");
    }
  });

  it("accepts exactly the longest range and refuses one day more", () => {
    const atTheLimit = resolveRange({
      from: "2026-01-01",
      to: "2027-02-04",
      fallback,
    });
    expect(atTheLimit.ok).toBe(true);
    if (atTheLimit.ok) expect(atTheLimit.range.days).toBe(MAX_RANGE_DAYS);

    const overIt = resolveRange({ from: "2026-01-01", to: "2027-02-05", fallback });
    expect(overIt.ok).toBe(false);
    if (!overIt.ok) expect(overIt.problem).toBe("too_long");
  });

  it("measures the length after swapping, not before", () => {
    const outcome = resolveRange({ from: "2030-01-01", to: "2026-01-01", fallback });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.problem).toBe("too_long");
  });
});

describe("buildPayrollSummary", () => {
  it("adds up one whole week from its saved days", () => {
    const summary = buildPayrollSummary({
      range: { fromISO: "2026-09-07", toISO: "2026-09-13" },
      staff: [member()],
      weeks: [
        week({ storedGrossCentavos: RATE * 5, storedNetCentavos: RATE * 5 }),
      ],
      days: workdays("w1", "2026-09-07", 5),
    });

    expect(summary.rows).toHaveLength(1);
    const row = summary.rows[0];
    expect(row.fullName).toBe("Ana Cruz");
    expect(row.fullDays).toBe(5);
    expect(row.halfDays).toBe(0);
    expect(row.daysPaid).toBe(5);
    expect(row.dayPayCentavos).toBe(parsePesos("2500"));
    expect(row.grossCentavos).toBe(parsePesos("2500"));
    expect(row.netCentavos).toBe(parsePesos("2500"));
    expect(row.includesPartWeek).toBe(false);
    expect(row.needsSaving).toBe(false);
    expect(row.weekCount).toBe(1);
  });

  it("counts a half day as half the daily rate", () => {
    const summary = buildPayrollSummary({
      range: { fromISO: "2026-09-07", toISO: "2026-09-13" },
      staff: [member()],
      weeks: [
        week({
          storedGrossCentavos: parsePesos("2250"),
          storedNetCentavos: parsePesos("2250"),
        }),
      ],
      days: [
        ...workdays("w1", "2026-09-07", 4),
        ...workdays("w1", "2026-09-11", 1, { dayType: "half" }),
      ],
    });

    const row = summary.rows[0];
    expect(row.fullDays).toBe(4);
    expect(row.halfDays).toBe(1);
    expect(row.daysPaid).toBe(4.5);
    expect(row.dayPayCentavos).toBe(parsePesos("2250"));
    expect(row.needsSaving).toBe(false);
  });

  it("adds overtime and a bonus, then takes the advance off", () => {
    const summary = buildPayrollSummary({
      range: { fromISO: "2026-09-07", toISO: "2026-09-13" },
      staff: [member()],
      weeks: [
        week({
          bonusCentavos: parsePesos("200"),
          advanceDeductionCentavos: parsePesos("300"),
          storedGrossCentavos: parsePesos("2800"),
          storedNetCentavos: parsePesos("2500"),
        }),
      ],
      days: [
        ...workdays("w1", "2026-09-07", 4),
        ...workdays("w1", "2026-09-11", 1, {
          overtimeHours: 2,
          overtimePayCentavos: parsePesos("100"),
        }),
      ],
    });

    const row = summary.rows[0];
    expect(row.overtimeHours).toBe(2);
    expect(row.overtimePayCentavos).toBe(parsePesos("100"));
    expect(row.overtimeUnpaidHours).toBe(0);
    expect(row.bonusCentavos).toBe(parsePesos("200"));
    // 2,500 day pay + 100 overtime + 200 bonus
    expect(row.grossCentavos).toBe(parsePesos("2800"));
    expect(row.advanceDeductionCentavos).toBe(parsePesos("300"));
    expect(row.netCentavos).toBe(parsePesos("2500"));
    expect(row.needsSaving).toBe(false);
  });

  it("notices overtime hours that were logged but not paid", () => {
    const summary = buildPayrollSummary({
      range: { fromISO: "2026-09-07", toISO: "2026-09-13" },
      staff: [member()],
      weeks: [
        week({
          storedGrossCentavos: parsePesos("2500"),
          storedNetCentavos: parsePesos("2500"),
        }),
      ],
      days: [
        ...workdays("w1", "2026-09-07", 4),
        ...workdays("w1", "2026-09-11", 1, { overtimeHours: 1.5 }),
      ],
    });

    const row = summary.rows[0];
    expect(row.overtimeHours).toBe(1.5);
    expect(row.overtimePayCentavos).toBe(0);
    expect(row.overtimeUnpaidHours).toBe(1.5);
  });

  it("never lets net pay go below zero", () => {
    const summary = buildPayrollSummary({
      range: { fromISO: "2026-09-07", toISO: "2026-09-13" },
      staff: [member()],
      weeks: [
        week({
          advanceDeductionCentavos: parsePesos("1000"),
          storedGrossCentavos: parsePesos("250"),
          storedNetCentavos: 0,
        }),
      ],
      days: workdays("w1", "2026-09-07", 1, { dayType: "half" }),
    });

    const row = summary.rows[0];
    expect(row.grossCentavos).toBe(parsePesos("250"));
    expect(row.netCentavos).toBe(0);
    expect(row.netCentavos).toBeGreaterThanOrEqual(0);
  });

  it("adds several weeks into one row per person", () => {
    const summary = buildPayrollSummary({
      range: { fromISO: "2026-09-07", toISO: "2026-09-20" },
      staff: [member()],
      weeks: [
        week({
          id: "w1",
          weekStartISO: "2026-09-07",
          storedGrossCentavos: parsePesos("2500"),
          storedNetCentavos: parsePesos("2500"),
        }),
        week({
          id: "w2",
          weekStartISO: "2026-09-14",
          storedGrossCentavos: parsePesos("2500"),
          storedNetCentavos: parsePesos("2500"),
        }),
      ],
      days: [
        ...workdays("w1", "2026-09-07", 5),
        ...workdays("w2", "2026-09-14", 5),
      ],
    });

    expect(summary.rows).toHaveLength(1);
    const row = summary.rows[0];
    expect(row.weekCount).toBe(2);
    expect(row.daysPaid).toBe(10);
    expect(row.grossCentavos).toBe(parsePesos("5000"));
    expect(row.includesPartWeek).toBe(false);
  });

  it("shows every rate that was used when a raise lands mid-range", () => {
    const summary = buildPayrollSummary({
      range: { fromISO: "2026-09-07", toISO: "2026-09-20" },
      staff: [member({ dailyRateCentavos: parsePesos("550") })],
      weeks: [
        week({
          id: "w1",
          weekStartISO: "2026-09-07",
          dailyRateCentavos: parsePesos("500"),
          storedGrossCentavos: parsePesos("2500"),
          storedNetCentavos: parsePesos("2500"),
        }),
        week({
          id: "w2",
          weekStartISO: "2026-09-14",
          dailyRateCentavos: parsePesos("550"),
          storedGrossCentavos: parsePesos("2750"),
          storedNetCentavos: parsePesos("2750"),
        }),
      ],
      days: [
        ...workdays("w1", "2026-09-07", 5),
        ...workdays("w2", "2026-09-14", 5),
      ],
    });

    const row = summary.rows[0];
    // The rate copied onto each week, not the one on the staff record today.
    expect(row.ratesCentavos).toEqual([parsePesos("500"), parsePesos("550")]);
    expect(row.dayPayCentavos).toBe(parsePesos("5250"));
    expect(row.needsSaving).toBe(false);
  });

  it("calls a row paid, partly paid or not yet paid", () => {
    const base = {
      range: { fromISO: "2026-09-07", toISO: "2026-09-20" },
      staff: [member()],
      days: [
        ...workdays("w1", "2026-09-07", 5),
        ...workdays("w2", "2026-09-14", 5),
      ],
    };
    const paidWeek = week({
      id: "w1",
      weekStartISO: "2026-09-07",
      status: "paid",
      storedGrossCentavos: parsePesos("2500"),
      storedNetCentavos: parsePesos("2500"),
    });
    const draftWeek = week({
      id: "w2",
      weekStartISO: "2026-09-14",
      storedGrossCentavos: parsePesos("2500"),
      storedNetCentavos: parsePesos("2500"),
    });

    const partly = buildPayrollSummary({ ...base, weeks: [paidWeek, draftWeek] });
    expect(partly.rows[0].status).toBe("partly");
    expect(partly.rows[0].paidNetCentavos).toBe(parsePesos("2500"));
    expect(partly.rows[0].unpaidNetCentavos).toBe(parsePesos("2500"));

    const allPaid = buildPayrollSummary({
      ...base,
      weeks: [paidWeek, { ...draftWeek, status: "paid" as const }],
    });
    expect(allPaid.rows[0].status).toBe("paid");
    expect(allPaid.rows[0].unpaidNetCentavos).toBe(0);

    const nonePaid = buildPayrollSummary({
      ...base,
      weeks: [{ ...paidWeek, status: "draft" as const }, draftWeek],
    });
    expect(nonePaid.rows[0].status).toBe("unpaid");
    expect(nonePaid.rows[0].paidNetCentavos).toBe(0);
  });

  it("adds the rows up, and paid plus unpaid comes back to the total", () => {
    const summary = buildPayrollSummary({
      range: { fromISO: "2026-09-07", toISO: "2026-09-13" },
      staff: [
        member({ id: "s1", fullName: "Ana Cruz" }),
        member({ id: "s2", fullName: "Ben Reyes" }),
      ],
      weeks: [
        week({
          id: "w1",
          staffId: "s1",
          status: "paid",
          bonusCentavos: parsePesos("200"),
          advanceDeductionCentavos: parsePesos("300"),
          storedGrossCentavos: parsePesos("2700"),
          storedNetCentavos: parsePesos("2400"),
        }),
        week({
          id: "w2",
          staffId: "s2",
          storedGrossCentavos: parsePesos("2600"),
          storedNetCentavos: parsePesos("2600"),
        }),
      ],
      days: [
        ...workdays("w1", "2026-09-07", 5),
        ...workdays("w2", "2026-09-07", 4),
        ...workdays("w2", "2026-09-11", 1, {
          overtimeHours: 2,
          overtimePayCentavos: parsePesos("100"),
        }),
      ],
    });

    const { totals, rows } = summary;
    expect(rows.map((row) => row.fullName)).toEqual(["Ana Cruz", "Ben Reyes"]);
    expect(totals.staffCount).toBe(2);
    expect(totals.grossCentavos).toBe(parsePesos("5300"));
    expect(totals.bonusCentavos).toBe(parsePesos("200"));
    expect(totals.overtimePayCentavos).toBe(parsePesos("100"));
    expect(totals.advanceDeductionCentavos).toBe(parsePesos("300"));
    expect(totals.netCentavos).toBe(parsePesos("5000"));
    // The three figures printed below the table have to agree with each other.
    expect(totals.paidNetCentavos + totals.unpaidNetCentavos).toBe(
      totals.netCentavos,
    );
    expect(totals.paidNetCentavos).toBe(parsePesos("2400"));
    expect(totals.unpaidNetCentavos).toBe(parsePesos("2600"));
    expect(totals.grossCentavos).toBe(
      rows.reduce((sum, row) => sum + row.grossCentavos, 0),
    );
  });

  it("sorts the rows by name", () => {
    const summary = buildPayrollSummary({
      range: { fromISO: "2026-09-07", toISO: "2026-09-13" },
      staff: [
        member({ id: "s1", fullName: "Zeny Lim" }),
        member({ id: "s2", fullName: "Ana Cruz" }),
      ],
      weeks: [
        week({ id: "w1", staffId: "s1", storedGrossCentavos: parsePesos("2500"), storedNetCentavos: parsePesos("2500") }),
        week({ id: "w2", staffId: "s2", storedGrossCentavos: parsePesos("2500"), storedNetCentavos: parsePesos("2500") }),
      ],
      days: [
        ...workdays("w1", "2026-09-07", 5),
        ...workdays("w2", "2026-09-07", 5),
      ],
    });

    expect(summary.rows.map((row) => row.fullName)).toEqual([
      "Ana Cruz",
      "Zeny Lim",
    ]);
  });

  it("includes both end dates of the range", () => {
    const summary = buildPayrollSummary({
      // Monday to Friday of a week whose Saturday was also worked.
      range: { fromISO: "2026-09-07", toISO: "2026-09-11" },
      staff: [member()],
      weeks: [
        week({
          storedGrossCentavos: parsePesos("3000"),
          storedNetCentavos: parsePesos("3000"),
        }),
      ],
      days: workdays("w1", "2026-09-07", 6),
    });

    const row = summary.rows[0];
    // Monday the 7th and Friday the 11th both count; Saturday the 12th does not.
    expect(row.fullDays).toBe(5);
    expect(row.dayPayCentavos).toBe(parsePesos("2500"));
  });

  it("leaves out a week with nothing inside the range", () => {
    const summary = buildPayrollSummary({
      range: { fromISO: "2026-09-21", toISO: "2026-09-27" },
      staff: [member()],
      weeks: [
        week({
          weekStartISO: "2026-09-07",
          storedGrossCentavos: parsePesos("2500"),
          storedNetCentavos: parsePesos("2500"),
        }),
      ],
      days: workdays("w1", "2026-09-07", 5),
    });

    expect(summary.rows).toEqual([]);
    expect(summary.totals.netCentavos).toBe(0);
  });

  it("names an active staff member with a rate who is not on the sheet", () => {
    const summary = buildPayrollSummary({
      range: { fromISO: "2026-09-07", toISO: "2026-09-13" },
      staff: [
        member({ id: "s1", fullName: "Ana Cruz" }),
        member({ id: "s2", fullName: "Ben Reyes" }),
        // No rate set, so there is nothing payroll could have saved.
        member({ id: "s3", fullName: "Carlo Uy", dailyRateCentavos: null }),
        // Left the shop; last month's sheet should not ask after them.
        member({ id: "s4", fullName: "Dina Ong", status: "inactive" }),
      ],
      weeks: [
        week({ storedGrossCentavos: parsePesos("2500"), storedNetCentavos: parsePesos("2500") }),
      ],
      days: workdays("w1", "2026-09-07", 5),
    });

    expect(summary.missingNames).toEqual(["Ben Reyes"]);
  });

  it("flags a whole week whose saved days do not add up to what it stores", () => {
    const summary = buildPayrollSummary({
      range: { fromISO: "2026-09-07", toISO: "2026-09-13" },
      staff: [member()],
      weeks: [
        week({
          // The week says PHP 3,000 but only four days were ever saved.
          storedGrossCentavos: parsePesos("3000"),
          storedNetCentavos: parsePesos("3000"),
        }),
      ],
      days: workdays("w1", "2026-09-07", 4),
    });

    const row = summary.rows[0];
    expect(row.grossCentavos).toBe(parsePesos("2000"));
    expect(row.needsSaving).toBe(true);
    expect(summary.anyNeedsSaving).toBe(true);
  });

  describe("a week split across September and October", () => {
    /*
      The week of Monday 28 September 2026 runs to Sunday 4 October. Five days
      were worked at PHP 500, with a PHP 200 bonus and PHP 100 taken off for a
      cash advance - so the whole week is PHP 2,700 gross and PHP 2,600 net.

      A September sheet and an October sheet, side by side, have to come back
      to exactly that: never twice, never not at all.
    */
    const splitWeek = week({
      id: "w-split",
      weekStartISO: "2026-09-28",
      bonusCentavos: parsePesos("200"),
      advanceDeductionCentavos: parsePesos("100"),
      storedGrossCentavos: parsePesos("2700"),
      storedNetCentavos: parsePesos("2600"),
    });
    const splitDays = [
      ...workdays("w-split", "2026-09-28", 3), // Mon 28, Tue 29, Wed 30 Sep
      ...workdays("w-split", "2026-10-01", 2), // Thu 1, Fri 2 Oct
    ];
    const staff = [member()];

    const september = buildPayrollSummary({
      range: { fromISO: "2026-09-01", toISO: "2026-09-30" },
      staff,
      weeks: [splitWeek],
      days: splitDays,
    });
    const october = buildPayrollSummary({
      range: { fromISO: "2026-10-01", toISO: "2026-10-31" },
      staff,
      weeks: [splitWeek],
      days: splitDays,
    });

    it("pays September only for the days worked in September", () => {
      const row = september.rows[0];
      expect(row.fullDays).toBe(3);
      expect(row.dayPayCentavos).toBe(parsePesos("1500"));
    });

    it("pays October only for the days worked in October", () => {
      const row = october.rows[0];
      expect(row.fullDays).toBe(2);
      expect(row.dayPayCentavos).toBe(parsePesos("1000"));
    });

    it("counts the bonus and the advance once, in the month the week starts", () => {
      expect(september.rows[0].bonusCentavos).toBe(parsePesos("200"));
      expect(september.rows[0].advanceDeductionCentavos).toBe(parsePesos("100"));
      expect(october.rows[0].bonusCentavos).toBe(0);
      expect(october.rows[0].advanceDeductionCentavos).toBe(0);
    });

    it("comes back to the week's real total across the two sheets", () => {
      expect(
        september.rows[0].grossCentavos + october.rows[0].grossCentavos,
      ).toBe(splitWeek.storedGrossCentavos);
      expect(september.rows[0].netCentavos + october.rows[0].netCentavos).toBe(
        splitWeek.storedNetCentavos,
      );
    });

    it("marks both rows as holding part of a week", () => {
      expect(september.rows[0].includesPartWeek).toBe(true);
      expect(october.rows[0].includesPartWeek).toBe(true);
      expect(september.anyPartWeek).toBe(true);
      expect(october.anyPartWeek).toBe(true);
    });

    it("never calls a cut week a mismatch", () => {
      // Half a week SHOULD come to less than the stored total. Warning about
      // that would put a scary notice on every month boundary.
      expect(september.rows[0].needsSaving).toBe(false);
      expect(october.rows[0].needsSaving).toBe(false);
      expect(september.anyNeedsSaving).toBe(false);
      expect(october.anyNeedsSaving).toBe(false);
    });
  });
});

describe("formatDaysPaid", () => {
  it("writes a half day as ½ rather than .5", () => {
    expect(formatDaysPaid(5, 1)).toBe("5½");
    expect(formatDaysPaid(0, 1)).toBe("½");
  });

  it("makes two half days a whole one", () => {
    expect(formatDaysPaid(5, 2)).toBe("6");
    expect(formatDaysPaid(0, 3)).toBe("1½");
  });

  it("leaves a whole number alone", () => {
    expect(formatDaysPaid(6, 0)).toBe("6");
    expect(formatDaysPaid(0, 0)).toBe("0");
  });
});

describe("describeDayCounts", () => {
  it("says what the days-paid figure is made of", () => {
    expect(describeDayCounts(5, 1)).toBe("5 full, 1 half");
  });
});
