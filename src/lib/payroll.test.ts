import { describe, expect, it } from "vitest";

import { parsePesos } from "./money";
import {
  computeWeeklyPayroll,
  dayPay,
  describeAttendance,
  formatHours,
  manilaMinutesOfDay,
  outstandingAdvance,
  suggestDayType,
  type PayrollDayInput,
} from "./payroll";
import { weekDays } from "./period";

const RATE = parsePesos("500"); // PHP 500 a day
const WEEK = weekDays({ year: 2026, month: 9, day: 14 }); // Mon 14 - Sun 20

function day(overrides: Partial<PayrollDayInput> = {}): PayrollDayInput {
  return {
    date: WEEK[0],
    timeIn: "2026-09-14T00:00:00Z", // 08:00 Manila
    timeOut: "2026-09-14T09:00:00Z", // 17:00 Manila
    hoursWorked: 9,
    late: false,
    forgotTimeOut: false,
    dayType: "full",
    overtimeHours: 0,
    overtimePayCentavos: 0,
    ...overrides,
  };
}

describe("dayPay", () => {
  it("pays the full daily rate for a full day", () => {
    expect(dayPay(RATE, "full")).toBe(parsePesos("500"));
  });

  it("pays HALF the daily rate for a half day", () => {
    // The owner's answer to open decision 17.6.
    expect(dayPay(RATE, "half")).toBe(parsePesos("250"));
    expect(dayPay(parsePesos("450"), "half")).toBe(parsePesos("225"));
    expect(dayPay(parsePesos("375"), "half")).toBe(parsePesos("187.50"));
  });

  it("pays nothing for an absence", () => {
    expect(dayPay(RATE, "absent")).toBe(0);
  });

  it("always returns whole centavos, even on an odd rate", () => {
    // PHP 333.33 halved is PHP 166.665, which is not a real amount of money.
    const half = dayPay(parsePesos("333.33"), "half");
    expect(Number.isInteger(half)).toBe(true);
    expect(half).toBe(16667); // rounded to the nearest centavo
  });

  it("refuses a negative daily rate", () => {
    expect(() => dayPay(-100, "full")).toThrow();
  });
});

describe("suggestDayType", () => {
  const scheduled = 9;

  it("suggests absent when nobody timed in", () => {
    expect(
      suggestDayType(
        { date: WEEK[0], timeIn: null, timeOut: null, hoursWorked: null, late: false, forgotTimeOut: false },
        scheduled,
      ),
    ).toBe("absent");
  });

  it("suggests a full day for a normal day", () => {
    expect(
      suggestDayType(
        { date: WEEK[0], timeIn: "x", timeOut: "y", hoursWorked: 9, late: false, forgotTimeOut: false },
        scheduled,
      ),
    ).toBe("full");
  });

  it("suggests a half day when under half the scheduled hours", () => {
    expect(
      suggestDayType(
        { date: WEEK[0], timeIn: "x", timeOut: "y", hoursWorked: 4, late: false, forgotTimeOut: false },
        scheduled,
      ),
    ).toBe("half");
  });

  it("treats exactly half the scheduled hours as a full day", () => {
    // 4.5 of 9 hours is not "less than half", so it stays a full day and the
    // owner can knock it down if they disagree.
    expect(
      suggestDayType(
        { date: WEEK[0], timeIn: "x", timeOut: "y", hoursWorked: 4.5, late: false, forgotTimeOut: false },
        scheduled,
      ),
    ).toBe("full");
  });

  it("assumes a full day when someone forgot to time out", () => {
    // Nobody knows how long they stayed, so do not quietly halve their wage;
    // the missing time-out is flagged for the owner to correct.
    expect(
      suggestDayType(
        { date: WEEK[0], timeIn: "x", timeOut: null, hoursWorked: null, late: false, forgotTimeOut: true },
        scheduled,
      ),
    ).toBe("full");
  });
});

describe("computeWeeklyPayroll", () => {
  it("pays six full days at the daily rate", () => {
    const result = computeWeeklyPayroll({
      dailyRateCentavos: RATE,
      days: WEEK.slice(0, 6).map((date) => day({ date })),
      bonusCentavos: 0,
      requestedAdvanceDeductionCentavos: 0,
      outstandingAdvanceCentavos: 0,
    });

    expect(result.dayPayTotalCentavos).toBe(parsePesos("3000"));
    expect(result.grossCentavos).toBe(parsePesos("3000"));
    expect(result.netCentavos).toBe(parsePesos("3000"));
    expect(result.fullDays).toBe(6);
  });

  it("mixes full days, half days and absences correctly", () => {
    const result = computeWeeklyPayroll({
      dailyRateCentavos: RATE,
      days: [
        day({ date: WEEK[0], dayType: "full" }),
        day({ date: WEEK[1], dayType: "full" }),
        day({ date: WEEK[2], dayType: "half" }),
        day({ date: WEEK[3], dayType: "absent" }),
        day({ date: WEEK[4], dayType: "full" }),
        day({ date: WEEK[5], dayType: "half" }),
      ],
      bonusCentavos: 0,
      requestedAdvanceDeductionCentavos: 0,
      outstandingAdvanceCentavos: 0,
    });

    // 3 full (1,500) + 2 half (500) + 1 absent (0) = 2,000
    expect(result.dayPayTotalCentavos).toBe(parsePesos("2000"));
    expect(result.fullDays).toBe(3);
    expect(result.halfDays).toBe(2);
    expect(result.absences).toBe(1);
  });

  it("adds the overtime the owner chose to pay", () => {
    const result = computeWeeklyPayroll({
      dailyRateCentavos: RATE,
      days: [
        day({ date: WEEK[0], overtimeHours: 2, overtimePayCentavos: parsePesos("150") }),
        // Overtime worked but not paid: the owner's choice (spec 13.3).
        day({ date: WEEK[1], overtimeHours: 3, overtimePayCentavos: 0 }),
        day({ date: WEEK[2] }),
      ],
      bonusCentavos: 0,
      requestedAdvanceDeductionCentavos: 0,
      outstandingAdvanceCentavos: 0,
    });

    expect(result.overtimePayTotalCentavos).toBe(parsePesos("150"));
    // The hours are recorded either way, so the owner can see what happened.
    expect(result.overtimeHoursTotal).toBe(5);
    expect(result.grossCentavos).toBe(parsePesos("1650"));
  });

  it("adds a bonus", () => {
    const result = computeWeeklyPayroll({
      dailyRateCentavos: RATE,
      days: [day()],
      bonusCentavos: parsePesos("200"),
      requestedAdvanceDeductionCentavos: 0,
      outstandingAdvanceCentavos: 0,
    });
    expect(result.grossCentavos).toBe(parsePesos("700"));
  });

  it("takes a cash advance off the net pay", () => {
    const result = computeWeeklyPayroll({
      dailyRateCentavos: RATE,
      days: WEEK.slice(0, 6).map((date) => day({ date })),
      bonusCentavos: 0,
      requestedAdvanceDeductionCentavos: parsePesos("1000"),
      outstandingAdvanceCentavos: parsePesos("1000"),
    });

    expect(result.grossCentavos).toBe(parsePesos("3000"));
    expect(result.advanceDeductionCentavos).toBe(parsePesos("1000"));
    expect(result.netCentavos).toBe(parsePesos("2000"));
    expect(result.remainingAdvanceCentavos).toBe(0);
    expect(result.deductionExceededGross).toBe(false);
  });

  it("never pushes net pay below zero, and carries the rest over", () => {
    // A week of two days earns PHP 1,000 but the owner asks to take PHP 1,500.
    const result = computeWeeklyPayroll({
      dailyRateCentavos: RATE,
      days: [day({ date: WEEK[0] }), day({ date: WEEK[1] })],
      bonusCentavos: 0,
      requestedAdvanceDeductionCentavos: parsePesos("1500"),
      outstandingAdvanceCentavos: parsePesos("1500"),
    });

    expect(result.grossCentavos).toBe(parsePesos("1000"));
    expect(result.advanceDeductionCentavos).toBe(parsePesos("1000"));
    expect(result.netCentavos).toBe(0);
    // The PHP 500 that would not fit stays owed.
    expect(result.deductionCarriedOverCentavos).toBe(parsePesos("500"));
    expect(result.remainingAdvanceCentavos).toBe(parsePesos("500"));
    // And the owner is warned that they asked for more than was earned.
    expect(result.deductionExceededGross).toBe(true);
  });

  it("never deducts more than is actually owed", () => {
    // The owner types PHP 2,000 but only PHP 300 is outstanding.
    const result = computeWeeklyPayroll({
      dailyRateCentavos: RATE,
      days: WEEK.slice(0, 6).map((date) => day({ date })),
      bonusCentavos: 0,
      requestedAdvanceDeductionCentavos: parsePesos("2000"),
      outstandingAdvanceCentavos: parsePesos("300"),
    });

    expect(result.advanceDeductionCentavos).toBe(parsePesos("300"));
    expect(result.netCentavos).toBe(parsePesos("2700"));
    expect(result.remainingAdvanceCentavos).toBe(0);
    expect(result.deductionExceededGross).toBe(false);
  });

  it("handles a week with no deduction chosen, leaving the balance alone", () => {
    const result = computeWeeklyPayroll({
      dailyRateCentavos: RATE,
      days: WEEK.slice(0, 6).map((date) => day({ date })),
      bonusCentavos: 0,
      requestedAdvanceDeductionCentavos: 0,
      outstandingAdvanceCentavos: parsePesos("1200"),
    });

    expect(result.advanceDeductionCentavos).toBe(0);
    expect(result.netCentavos).toBe(parsePesos("3000"));
    expect(result.remainingAdvanceCentavos).toBe(parsePesos("1200"));
  });

  it("pays nothing for a week of absences", () => {
    const result = computeWeeklyPayroll({
      dailyRateCentavos: RATE,
      days: WEEK.map((date) => day({ date, dayType: "absent" })),
      bonusCentavos: 0,
      requestedAdvanceDeductionCentavos: 0,
      outstandingAdvanceCentavos: 0,
    });
    expect(result.grossCentavos).toBe(0);
    expect(result.netCentavos).toBe(0);
    expect(result.absences).toBe(7);
  });

  it("counts late days and missing time-outs for the owner", () => {
    const result = computeWeeklyPayroll({
      dailyRateCentavos: RATE,
      days: [
        day({ date: WEEK[0], late: true }),
        day({ date: WEEK[1], forgotTimeOut: true, timeOut: null, hoursWorked: null }),
        day({ date: WEEK[2], late: true, forgotTimeOut: true }),
      ],
      bonusCentavos: 0,
      requestedAdvanceDeductionCentavos: 0,
      outstandingAdvanceCentavos: 0,
    });
    expect(result.lateDays).toBe(2);
    expect(result.daysMissingTimeOut).toBe(2);
    // Being late does not reduce the day's pay by itself - the daily rate is
    // the daily rate unless the owner marks it a half day.
    expect(result.grossCentavos).toBe(parsePesos("1500"));
  });

  it("always returns whole centavos", () => {
    const result = computeWeeklyPayroll({
      dailyRateCentavos: parsePesos("333.33"),
      days: [
        day({ date: WEEK[0], dayType: "half" }),
        day({ date: WEEK[1], dayType: "half" }),
        day({ date: WEEK[2], dayType: "full" }),
      ],
      bonusCentavos: 0,
      requestedAdvanceDeductionCentavos: 0,
      outstandingAdvanceCentavos: 0,
    });

    for (const value of [
      result.dayPayTotalCentavos,
      result.grossCentavos,
      result.netCentavos,
      result.advanceDeductionCentavos,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    // 166.67 + 166.67 + 333.33 = 666.67
    expect(result.grossCentavos).toBe(parsePesos("666.67"));
  });

  it("keeps gross, deduction and net consistent with each other", () => {
    for (const requested of [0, 50, 100_000, 300_000, 1_000_000]) {
      const result = computeWeeklyPayroll({
        dailyRateCentavos: RATE,
        days: WEEK.slice(0, 5).map((date) => day({ date })),
        bonusCentavos: 0,
        requestedAdvanceDeductionCentavos: requested,
        outstandingAdvanceCentavos: 1_000_000,
      });

      expect(result.netCentavos).toBe(
        result.grossCentavos - result.advanceDeductionCentavos,
      );
      expect(result.netCentavos).toBeGreaterThanOrEqual(0);
      expect(result.advanceDeductionCentavos).toBeLessThanOrEqual(result.grossCentavos);
    }
  });

  it("refuses nonsense inputs rather than paying a strange amount", () => {
    const base = {
      days: [day()],
      bonusCentavos: 0,
      requestedAdvanceDeductionCentavos: 0,
      outstandingAdvanceCentavos: 0,
    };
    expect(() => computeWeeklyPayroll({ ...base, dailyRateCentavos: -1 })).toThrow();
    expect(() => computeWeeklyPayroll({ ...base, dailyRateCentavos: 500.5 })).toThrow();
    expect(() =>
      computeWeeklyPayroll({ ...base, dailyRateCentavos: RATE, bonusCentavos: -1 }),
    ).toThrow();
    expect(() =>
      computeWeeklyPayroll({
        ...base,
        dailyRateCentavos: RATE,
        requestedAdvanceDeductionCentavos: -1,
      }),
    ).toThrow();
  });
});

describe("describeAttendance", () => {
  const common = {
    date: WEEK[0],
    workDayStart: "08:00",
    scheduledHoursPerDay: 9,
  };

  it("records an ordinary day", () => {
    const result = describeAttendance({
      ...common,
      timeIn: "2026-09-14T00:00:00Z", // 08:00 Manila
      timeOut: "2026-09-14T09:00:00Z", // 17:00 Manila
    });

    expect(result.hoursWorked).toBe(9);
    expect(result.late).toBe(false);
    expect(result.forgotTimeOut).toBe(false);
    expect(result.overtimeHours).toBe(0);
  });

  it("marks someone late against the Manila clock", () => {
    // 08:30 Manila is 00:30 UTC. Judging this in UTC would call it 00:30,
    // hours before opening, and nobody would ever be late.
    const result = describeAttendance({
      ...common,
      timeIn: "2026-09-14T00:30:00Z",
      timeOut: "2026-09-14T09:00:00Z",
    });
    expect(result.late).toBe(true);
  });

  it("is not late when they arrive early", () => {
    const result = describeAttendance({
      ...common,
      timeIn: "2026-09-13T23:30:00Z", // 07:30 Manila on the 14th
      timeOut: "2026-09-14T09:00:00Z",
    });
    expect(result.late).toBe(false);
  });

  it("allows a grace period if the owner sets one", () => {
    const options = {
      ...common,
      timeIn: "2026-09-14T00:10:00Z", // 08:10 Manila
      timeOut: "2026-09-14T09:00:00Z",
    };
    expect(describeAttendance(options).late).toBe(true);
    expect(describeAttendance({ ...options, lateGraceMinutes: 15 }).late).toBe(false);
  });

  it("works out overtime beyond the scheduled day", () => {
    const result = describeAttendance({
      ...common,
      timeIn: "2026-09-14T00:00:00Z", // 08:00
      timeOut: "2026-09-14T11:30:00Z", // 19:30 - two and a half hours over
    });
    expect(result.hoursWorked).toBe(11.5);
    expect(result.overtimeHours).toBe(2.5);
  });

  it("rounds overtime to a quarter of an hour", () => {
    const result = describeAttendance({
      ...common,
      timeIn: "2026-09-14T00:00:00Z",
      timeOut: "2026-09-14T09:50:00Z", // 9h50m -> 50 minutes over -> 0.75h
    });
    expect(result.overtimeHours).toBe(0.75);
  });

  it("flags a missing time-out instead of guessing the hours", () => {
    const result = describeAttendance({
      ...common,
      timeIn: "2026-09-14T00:00:00Z",
      timeOut: null,
    });
    expect(result.forgotTimeOut).toBe(true);
    expect(result.hoursWorked).toBeNull();
    expect(result.overtimeHours).toBe(0);
  });

  it("records an absence when nobody timed in", () => {
    const result = describeAttendance({ ...common, timeIn: null, timeOut: null });
    expect(result).toMatchObject({
      hoursWorked: null,
      late: false,
      forgotTimeOut: false,
      overtimeHours: 0,
    });
  });

  it("never reports negative hours from a bad correction", () => {
    const result = describeAttendance({
      ...common,
      timeIn: "2026-09-14T09:00:00Z",
      timeOut: "2026-09-14T00:00:00Z", // out before in
    });
    expect(result.hoursWorked).toBe(0);
  });
});

describe("manilaMinutesOfDay", () => {
  it("reads the clock the staff are working to", () => {
    expect(manilaMinutesOfDay(new Date("2026-09-14T00:00:00Z"))).toBe(8 * 60);
    expect(manilaMinutesOfDay(new Date("2026-09-14T09:30:00Z"))).toBe(17 * 60 + 30);
    // Just before Manila midnight.
    expect(manilaMinutesOfDay(new Date("2026-09-14T15:59:00Z"))).toBe(23 * 60 + 59);
  });
});

describe("formatHours", () => {
  it("reads the way a payslip should", () => {
    expect(formatHours(9)).toBe("9h");
    expect(formatHours(8.5)).toBe("8h 30m");
    expect(formatHours(0.75)).toBe("45m");
    expect(formatHours(null)).toBe("—");
    expect(formatHours(0)).toBe("0h");
  });
});

describe("outstandingAdvance", () => {
  it("is everything advanced less everything deducted", () => {
    expect(
      outstandingAdvance(
        [{ amountCentavos: parsePesos("1000") }, { amountCentavos: parsePesos("500") }],
        [{ amountCentavos: parsePesos("400") }],
      ),
    ).toBe(parsePesos("1100"));
  });

  it("is zero when nothing was advanced", () => {
    expect(outstandingAdvance([], [])).toBe(0);
  });

  it("never goes negative if more was deducted than advanced", () => {
    expect(
      outstandingAdvance(
        [{ amountCentavos: parsePesos("500") }],
        [{ amountCentavos: parsePesos("800") }],
      ),
    ).toBe(0);
  });
});
