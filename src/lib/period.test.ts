import { describe, expect, it } from "vitest";

import {
  addMonths,
  civilDateToISO,
  currentPeriod,
  dueDateInPeriod,
  daysBetween,
  daysInMonth,
  formatCivilDate,
  formatPeriod,
  manilaDayRangeUtc,
  manilaMonthRangeUtc,
  manilaToday,
  parseISODate,
  periodToMonthStartISO,
  parsePeriodKey,
  periodKey,
  formatWeekRange,
  scheduledHours,
  startOfWeek,
  weekDays,
  weekdayName,
} from "./period";

describe("manilaToday", () => {
  it("reads the date the shop is actually living in, not the UTC date", () => {
    // 17:30 UTC on 30 September is already 01:30 on 1 October in Manila.
    // A bill checked against the UTC date would look a day early, every month.
    expect(manilaToday(new Date("2026-09-30T17:30:00Z"))).toEqual({
      year: 2026,
      month: 10,
      day: 1,
    });
  });

  it("is still the previous day just before Manila midnight", () => {
    // 15:59 UTC is 23:59 the same day in Manila.
    expect(manilaToday(new Date("2026-09-30T15:59:00Z"))).toEqual({
      year: 2026,
      month: 9,
      day: 30,
    });
  });

  it("rolls the year over correctly", () => {
    expect(manilaToday(new Date("2026-12-31T16:00:00Z"))).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
  });

  it("agrees with currentPeriod", () => {
    const now = new Date("2026-09-18T05:00:00Z");
    expect(currentPeriod(now)).toEqual({ year: 2026, month: 9 });
  });
});

describe("addMonths", () => {
  it("moves forward and back inside a year", () => {
    expect(addMonths({ year: 2026, month: 9 }, 1)).toEqual({ year: 2026, month: 10 });
    expect(addMonths({ year: 2026, month: 9 }, -1)).toEqual({ year: 2026, month: 8 });
  });

  it("crosses December and January", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("handles jumps of more than a year", () => {
    expect(addMonths({ year: 2026, month: 9 }, 14)).toEqual({ year: 2027, month: 11 });
    expect(addMonths({ year: 2026, month: 3 }, -14)).toEqual({ year: 2025, month: 1 });
  });

  it("returns the same month for a zero move", () => {
    expect(addMonths({ year: 2026, month: 9 }, 0)).toEqual({ year: 2026, month: 9 });
  });
});

describe("daysInMonth", () => {
  it("knows the short months", () => {
    expect(daysInMonth({ year: 2026, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 2026, month: 4 })).toBe(30);
    expect(daysInMonth({ year: 2026, month: 12 })).toBe(31);
  });

  it("knows leap years", () => {
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2000, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 1900, month: 2 })).toBe(28);
  });
});

describe("dueDateInPeriod", () => {
  it("uses the due day as given when the month is long enough", () => {
    expect(dueDateInPeriod(15, { year: 2026, month: 9 })).toEqual({
      year: 2026,
      month: 9,
      day: 15,
    });
  });

  it("pulls a 31st due date back to the last day of a short month", () => {
    // A bill due on the 31st still has to fall due in February.
    expect(dueDateInPeriod(31, { year: 2026, month: 2 })).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
    expect(dueDateInPeriod(31, { year: 2028, month: 2 })).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
    expect(dueDateInPeriod(31, { year: 2026, month: 4 })).toEqual({
      year: 2026,
      month: 4,
      day: 30,
    });
  });

  it("never produces a day before the 1st", () => {
    expect(dueDateInPeriod(0, { year: 2026, month: 9 }).day).toBe(1);
    expect(dueDateInPeriod(-5, { year: 2026, month: 9 }).day).toBe(1);
  });
});

describe("daysBetween", () => {
  it("counts whole days forward and back", () => {
    const a = { year: 2026, month: 9, day: 18 };
    expect(daysBetween(a, { year: 2026, month: 9, day: 23 })).toBe(5);
    expect(daysBetween(a, { year: 2026, month: 9, day: 18 })).toBe(0);
    expect(daysBetween(a, { year: 2026, month: 9, day: 13 })).toBe(-5);
  });

  it("counts across month and year ends", () => {
    expect(
      daysBetween({ year: 2026, month: 9, day: 30 }, { year: 2026, month: 10, day: 1 }),
    ).toBe(1);
    expect(
      daysBetween({ year: 2026, month: 12, day: 31 }, { year: 2027, month: 1, day: 1 }),
    ).toBe(1);
    expect(
      daysBetween({ year: 2028, month: 2, day: 28 }, { year: 2028, month: 3, day: 1 }),
    ).toBe(2); // 2028 is a leap year
  });
});

describe("period keys and formatting", () => {
  it("makes a sortable key", () => {
    expect(periodKey({ year: 2026, month: 9 })).toBe("2026-09");
    expect(periodKey({ year: 2026, month: 12 })).toBe("2026-12");
  });

  it("reads a key back, and refuses a bad one", () => {
    expect(parsePeriodKey("2026-09")).toEqual({ year: 2026, month: 9 });
    for (const bad of ["2026-13", "2026-00", "26-09", "2026-9", "", "abcd-ef"]) {
      expect(parsePeriodKey(bad), bad).toBeNull();
    }
  });

  it("writes a month the way a person reads it", () => {
    expect(formatPeriod({ year: 2026, month: 9 })).toBe("September 2026");
    expect(formatPeriod({ year: 2027, month: 1 })).toBe("January 2027");
  });

  it("writes a date the way a person reads it", () => {
    // Month first, which is how dates are normally written in the Philippines
    // and what the en-PH locale produces. The whole app formats dates through
    // this locale, so bills, receipts and payslips all agree.
    expect(formatCivilDate({ year: 2026, month: 9, day: 18 })).toBe("Sep 18, 2026");
  });
});

describe("ISO dates", () => {
  it("writes the form PostgreSQL wants", () => {
    expect(civilDateToISO({ year: 2026, month: 9, day: 5 })).toBe("2026-09-05");
  });

  it("reads a date back, including from a full timestamp", () => {
    expect(parseISODate("2026-09-18")).toEqual({ year: 2026, month: 9, day: 18 });
    expect(parseISODate("2026-09-18T05:00:00Z")).toEqual({
      year: 2026,
      month: 9,
      day: 18,
    });
  });

  it("refuses a date that does not exist", () => {
    expect(parseISODate("2026-02-30")).toBeNull();
    expect(parseISODate("2026-13-01")).toBeNull();
    expect(parseISODate("not-a-date")).toBeNull();
  });

  it("survives a round trip", () => {
    const date = { year: 2026, month: 2, day: 29 };
    // 2026 is not a leap year, so this date is rejected rather than shifted.
    expect(parseISODate(civilDateToISO(date))).toBeNull();
    const leap = { year: 2028, month: 2, day: 29 };
    expect(parseISODate(civilDateToISO(leap))).toEqual(leap);
  });
});

describe("manilaDayRangeUtc", () => {
  it("brackets a Manila day in UTC", () => {
    // Manila is UTC+8, so 18 September starts at 16:00 UTC on the 17th.
    const range = manilaDayRangeUtc({ year: 2026, month: 9, day: 18 });
    expect(range.from).toBe("2026-09-17T16:00:00.000Z");
    expect(range.to).toBe("2026-09-18T16:00:00.000Z");
  });

  it("covers exactly 24 hours", () => {
    const range = manilaDayRangeUtc({ year: 2026, month: 9, day: 18 });
    const hours =
      (new Date(range.to).getTime() - new Date(range.from).getTime()) / 3_600_000;
    expect(hours).toBe(24);
  });

  it("includes a sale rung up at 8am Manila and excludes yesterday's", () => {
    const range = manilaDayRangeUtc({ year: 2026, month: 9, day: 18 });
    const eightAmManila = new Date("2026-09-18T00:00:00Z"); // 08:00 in Manila
    const lateYesterday = new Date("2026-09-17T15:00:00Z"); // 23:00 on the 17th

    expect(eightAmManila >= new Date(range.from)).toBe(true);
    expect(eightAmManila < new Date(range.to)).toBe(true);
    expect(lateYesterday < new Date(range.from)).toBe(true);
  });
});

describe("manilaMonthRangeUtc", () => {
  it("brackets a Manila month in UTC", () => {
    const range = manilaMonthRangeUtc({ year: 2026, month: 9 });
    expect(range.from).toBe("2026-08-31T16:00:00.000Z");
    expect(range.to).toBe("2026-09-30T16:00:00.000Z");
  });

  it("rolls over the year end", () => {
    const range = manilaMonthRangeUtc({ year: 2026, month: 12 });
    expect(range.from).toBe("2026-11-30T16:00:00.000Z");
    expect(range.to).toBe("2026-12-31T16:00:00.000Z");
  });
});

describe("periodToMonthStartISO", () => {
  it("writes the first of the month, as the database stores it", () => {
    expect(periodToMonthStartISO({ year: 2026, month: 9 })).toBe("2026-09-01");
    expect(periodToMonthStartISO({ year: 2026, month: 12 })).toBe("2026-12-01");
  });
});

describe("startOfWeek", () => {
  it("finds Monday for a Monday-start week", () => {
    // 18 September 2026 is a Friday.
    expect(startOfWeek({ year: 2026, month: 9, day: 18 }, "monday")).toEqual({
      year: 2026,
      month: 9,
      day: 14,
    });
  });

  it("puts Sunday at the END of a Monday-start week", () => {
    // 20 September 2026 is a Sunday. Its week began on Monday the 14th, not
    // the 20th - getting this wrong would move a day's wages into the wrong
    // week.
    expect(startOfWeek({ year: 2026, month: 9, day: 20 }, "monday")).toEqual({
      year: 2026,
      month: 9,
      day: 14,
    });
  });

  it("finds Sunday for a Sunday-start week", () => {
    expect(startOfWeek({ year: 2026, month: 9, day: 18 }, "sunday")).toEqual({
      year: 2026,
      month: 9,
      day: 13,
    });
    expect(startOfWeek({ year: 2026, month: 9, day: 20 }, "sunday")).toEqual({
      year: 2026,
      month: 9,
      day: 20,
    });
  });

  it("is unchanged when the date is already the first day", () => {
    expect(startOfWeek({ year: 2026, month: 9, day: 14 }, "monday")).toEqual({
      year: 2026,
      month: 9,
      day: 14,
    });
  });

  it("reaches back into the previous month and year", () => {
    // 1 September 2026 is a Tuesday, so its week began on 31 August.
    expect(startOfWeek({ year: 2026, month: 9, day: 1 }, "monday")).toEqual({
      year: 2026,
      month: 8,
      day: 31,
    });
    // 1 January 2027 is a Friday, so its week began on 28 December 2026.
    expect(startOfWeek({ year: 2027, month: 1, day: 1 }, "monday")).toEqual({
      year: 2026,
      month: 12,
      day: 28,
    });
  });
});

describe("weekDays", () => {
  it("gives seven days in order", () => {
    const days = weekDays({ year: 2026, month: 9, day: 14 });
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ year: 2026, month: 9, day: 14 });
    expect(days[6]).toEqual({ year: 2026, month: 9, day: 20 });
  });

  it("crosses a month boundary", () => {
    const days = weekDays({ year: 2026, month: 9, day: 28 });
    expect(days[6]).toEqual({ year: 2026, month: 10, day: 4 });
  });

  it("names the weekdays for the payroll table", () => {
    const days = weekDays({ year: 2026, month: 9, day: 14 });
    expect(days.map(weekdayName)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
  });
});

describe("formatWeekRange", () => {
  it("shortens a week inside one month", () => {
    expect(formatWeekRange({ year: 2026, month: 9, day: 14 })).toBe(
      "14–20 Sep 2026",
    );
  });

  it("spells out a week spanning two months", () => {
    expect(formatWeekRange({ year: 2026, month: 9, day: 28 })).toBe(
      "28 Sep – 4 Oct 2026",
    );
  });

  it("spells out a week spanning two years", () => {
    expect(formatWeekRange({ year: 2026, month: 12, day: 28 })).toBe(
      "28 Dec 2026 – 3 Jan 2027",
    );
  });
});

describe("scheduledHours", () => {
  it("measures the working day from the settings", () => {
    expect(scheduledHours("08:00", "17:00")).toBe(9);
    expect(scheduledHours("08:30", "17:00")).toBe(8.5);
    expect(scheduledHours("09:00", "18:00")).toBe(9);
  });

  it("never returns a negative day", () => {
    expect(scheduledHours("17:00", "08:00")).toBe(0);
  });
});
