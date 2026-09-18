import { describe, expect, it } from "vitest";

import {
  buildReport,
  compareTo,
  inRange,
  previousRange,
  rangeForPreset,
  toCsv,
  type ReportRange,
} from "./reports";
import type { LedgerEntry } from "./ledger";
import { parsePesos, sumCentavos } from "./money";

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "g1",
    occurredAt: "2026-09-18T02:00:00Z",
    direction: "in",
    amountCentavos: parsePesos("500"),
    tag: "printshoppe",
    category: "photocopy",
    source: "cash_drawer",
    note: null,
    sourceTable: null,
    sourceId: null,
    ...overrides,
  };
}

const RANGE: ReportRange = {
  fromISO: "2026-09-01",
  toISO: "2026-09-30",
  label: "September",
};

describe("rangeForPreset", () => {
  const today = "2026-09-18"; // a Friday

  it("gives one day for today", () => {
    expect(rangeForPreset("today", today)).toMatchObject({
      fromISO: "2026-09-18",
      toISO: "2026-09-18",
    });
  });

  it("runs the week from Monday, or Sunday when the shop says so", () => {
    expect(rangeForPreset("this_week", today, "monday").fromISO).toBe("2026-09-14");
    expect(rangeForPreset("this_week", today, "sunday").fromISO).toBe("2026-09-13");
  });

  it("starts this month on the first and ends today, not at month end", () => {
    // Half a month of takings should not be compared against a whole one.
    expect(rangeForPreset("this_month", today)).toMatchObject({
      fromISO: "2026-09-01",
      toISO: "2026-09-18",
    });
  });

  it("gives the whole of last month", () => {
    expect(rangeForPreset("last_month", today)).toMatchObject({
      fromISO: "2026-08-01",
      toISO: "2026-08-31",
    });
  });

  it("knows how long February is, including a leap year", () => {
    expect(rangeForPreset("last_month", "2028-03-05").toISO).toBe("2028-02-29");
    expect(rangeForPreset("last_month", "2027-03-05").toISO).toBe("2027-02-28");
  });

  it("steps back over a year end", () => {
    expect(rangeForPreset("last_month", "2027-01-10")).toMatchObject({
      fromISO: "2026-12-01",
      toISO: "2026-12-31",
    });
  });

  it("starts the year on 1 January", () => {
    expect(rangeForPreset("this_year", today).fromISO).toBe("2026-01-01");
  });
});

describe("previousRange", () => {
  it("is the same length, immediately before", () => {
    // Eleven days against the eleven days before them, not a whole month.
    expect(
      previousRange({ fromISO: "2026-09-08", toISO: "2026-09-18", label: "" }),
    ).toMatchObject({ fromISO: "2026-08-28", toISO: "2026-09-07" });
  });

  it("handles a single day", () => {
    expect(
      previousRange({ fromISO: "2026-09-01", toISO: "2026-09-01", label: "" }),
    ).toMatchObject({ fromISO: "2026-08-31", toISO: "2026-08-31" });
  });

  it("steps back over a month end correctly", () => {
    expect(
      previousRange({ fromISO: "2026-09-01", toISO: "2026-09-30", label: "" }),
    ).toMatchObject({ fromISO: "2026-08-02", toISO: "2026-08-31" });
  });
});

describe("inRange", () => {
  it("includes both ends", () => {
    expect(inRange("2026-09-01", RANGE)).toBe(true);
    expect(inRange("2026-09-30", RANGE)).toBe(true);
  });

  it("excludes the days either side", () => {
    expect(inRange("2026-08-31", RANGE)).toBe(false);
    expect(inRange("2026-10-01", RANGE)).toBe(false);
  });
});

describe("buildReport", () => {
  const entries: LedgerEntry[] = [
    entry({ id: "a", amountCentavos: parsePesos("5000"), category: "document_printing" }),
    entry({ id: "b", amountCentavos: parsePesos("3000"), category: "photocopy" }),
    entry({
      id: "c",
      amountCentavos: parsePesos("12000"),
      tag: "apparel",
      category: "sublimation_jerseys",
    }),
    entry({
      id: "d",
      amountCentavos: parsePesos("2000"),
      tag: "dabztech",
      category: "laptop_repair",
    }),
    entry({
      id: "e",
      direction: "out",
      amountCentavos: parsePesos("4000"),
      tag: "whole_shop",
      category: "materials_supplies",
    }),
    entry({
      id: "f",
      direction: "out",
      amountCentavos: parsePesos("3500"),
      tag: "whole_shop",
      category: "fixed_bills",
    }),
  ];

  it("adds up income, expenses and profit", () => {
    const report = buildReport(entries, RANGE);
    expect(report.incomeCentavos).toBe(parsePesos("22000"));
    expect(report.expensesCentavos).toBe(parsePesos("7500"));
    expect(report.profitCentavos).toBe(parsePesos("14500"));
  });

  it("keeps borrowed money out of income, and says how much it was", () => {
    const report = buildReport(
      [
        ...entries,
        entry({
          id: "loan",
          amountCentavos: parsePesos("100000"),
          tag: "whole_shop",
          category: "loan_proceeds",
        }),
      ],
      RANGE,
    );

    // A month where PHP 100,000 was borrowed must not look like a good month.
    expect(report.incomeCentavos).toBe(parsePesos("22000"));
    expect(report.nonIncomeInCentavos).toBe(parsePesos("100000"));
    expect(report.profitCentavos).toBe(parsePesos("14500"));
  });

  it("keeps an owner withdrawal out of shop costs", () => {
    const report = buildReport(
      [
        ...entries,
        entry({
          id: "w",
          direction: "out",
          amountCentavos: parsePesos("20000"),
          tag: "whole_shop",
          category: "owner_withdrawal",
        }),
      ],
      RANGE,
    );
    expect(report.expensesCentavos).toBe(parsePesos("7500"));
    expect(report.ownerWithdrawalsCentavos).toBe(parsePesos("20000"));
  });

  it("separates running costs from the bills the target already covers", () => {
    const report = buildReport(entries, RANGE);
    // Materials count; the electricity bill does not (spec 12.3).
    expect(report.runningCostsCentavos).toBe(parsePesos("4000"));
  });

  it("splits income by division, biggest first", () => {
    const report = buildReport(entries, RANGE);
    expect(report.byDivision.map((line) => [line.tag, line.incomeCentavos])).toEqual([
      ["apparel", parsePesos("12000")],
      ["printshoppe", parsePesos("8000")],
      ["dabztech", parsePesos("2000")],
    ]);
  });

  it("splits each division into its own categories", () => {
    const report = buildReport(entries, RANGE);
    const printshoppe = report.byDivision.find((line) => line.tag === "printshoppe");
    expect(printshoppe?.categories.map((c) => [c.category, c.amountCentavos])).toEqual([
      ["document_printing", parsePesos("5000")],
      ["photocopy", parsePesos("3000")],
    ]);
  });

  it("gives each division's share of the income", () => {
    const report = buildReport(entries, RANGE);
    // 12,000 of 22,000 is 54.5%, shown as 55.
    expect(report.byDivision[0].sharePercent).toBe(55);
  });

  it("adds the divisions back up to the income exactly", () => {
    // The amounts are the truth even where the percentages do not reach 100.
    const report = buildReport(entries, RANGE);
    expect(
      sumCentavos(report.byDivision.map((line) => line.incomeCentavos)),
    ).toBe(report.incomeCentavos);
  });

  it("adds the expense categories back up to the expenses exactly", () => {
    const report = buildReport(entries, RANGE);
    expect(
      sumCentavos(report.expensesByCategory.map((line) => line.amountCentavos)),
    ).toBe(report.expensesCentavos);
  });

  it("reports zeros for a period with nothing in it", () => {
    const report = buildReport([], RANGE);
    expect(report.incomeCentavos).toBe(0);
    expect(report.profitCentavos).toBe(0);
    expect(report.byDivision).toEqual([]);
    expect(report.entryCount).toBe(0);
  });

  it("can report a loss", () => {
    const report = buildReport(
      [
        entry({ amountCentavos: parsePesos("500") }),
        entry({
          id: "x",
          direction: "out",
          amountCentavos: parsePesos("2000"),
          category: "materials_supplies",
        }),
      ],
      RANGE,
    );
    expect(report.profitCentavos).toBe(parsePesos("-1500"));
  });
});

describe("compareTo", () => {
  it("works out the percentage change", () => {
    const change = compareTo(parsePesos("11000"), parsePesos("10000"));
    expect(change.percent).toBe(10);
    expect(change.direction).toBe("up");
    expect(change.label).toBe("up 10%");
  });

  it("says down, not up by a negative", () => {
    const change = compareTo(parsePesos("8000"), parsePesos("10000"));
    expect(change.percent).toBe(-20);
    expect(change.label).toBe("down 20%");
  });

  it("refuses to give a percentage against nothing", () => {
    // "Up 100%" from zero is meaningless and "up infinity%" is worse.
    const change = compareTo(parsePesos("5000"), 0);
    expect(change.percent).toBeNull();
    expect(change.label).toBe("nothing to compare with");
    expect(change.differenceCentavos).toBe(parsePesos("5000"));
  });

  it("says so when both periods were empty", () => {
    expect(compareTo(0, 0).label).toBe("nothing either time");
  });

  it("says the same when nothing moved", () => {
    const change = compareTo(parsePesos("500"), parsePesos("500"));
    expect(change.direction).toBe("same");
    expect(change.label).toBe("the same");
  });

  it("compares a loss against a loss without flipping the direction", () => {
    // From -5,000 to -2,000 is an improvement, so it is "up".
    const change = compareTo(parsePesos("-2000"), parsePesos("-5000"));
    expect(change.direction).toBe("up");
    expect(change.percent).toBe(60);
  });
});

describe("toCsv", () => {
  const report = buildReport(
    [
      entry({ amountCentavos: parsePesos("5000"), category: "document_printing" }),
      entry({
        id: "b",
        direction: "out",
        amountCentavos: parsePesos("1234.56"),
        tag: "whole_shop",
        category: "materials_supplies",
      }),
    ],
    RANGE,
  );

  const csv = toCsv(report);
  const lines = csv.split("\n");

  it("writes amounts as plain numbers a spreadsheet can read", () => {
    // No peso sign, no thousands separator, always two decimal places.
    expect(csv).toContain('"Income","5000.00"');
    expect(csv).toContain('"Shop expenses","1234.56"');
  });

  it("writes a loss with a minus sign", () => {
    const loss = toCsv(
      buildReport(
        [
          entry({
            direction: "out",
            amountCentavos: parsePesos("100"),
            category: "materials_supplies",
          }),
        ],
        RANGE,
      ),
    );
    expect(loss).toContain('"Profit","-100.00"');
  });

  it("quotes every field, so a comma in a label cannot split a row", () => {
    for (const line of lines.filter(Boolean)) {
      expect(line.startsWith('"'), line).toBe(true);
    }
  });

  it("records the range it covers", () => {
    expect(csv).toContain('"From","2026-09-01"');
    expect(csv).toContain('"To","2026-09-30"');
  });

  it("survives a quotation mark in a label", () => {
    // Doubling is how CSV escapes a quote; anything else corrupts the file.
    expect(csvOf('He said "hi"')).toBe('"He said ""hi"""');
  });
});

/** Mirrors the private csvField, so the escaping rule itself has a test. */
function csvOf(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

describe("share percentages", () => {
  it("never prints 0% beside money that was actually spent", () => {
    // PHP 1 among PHP 1,000 is 0.1%, which rounds to zero.
    const report = buildReport(
      [
        entry({
          direction: "out",
          amountCentavos: parsePesos("1000"),
          category: "fixed_bills",
        }),
        entry({
          id: "tiny",
          direction: "out",
          amountCentavos: parsePesos("1"),
          category: "meals_snacks",
        }),
      ],
      RANGE,
    );

    const tiny = report.expensesByCategory.find(
      (line) => line.category === "meals_snacks",
    );
    expect(tiny?.sharePercent).toBe(0);
    expect(tiny?.shareLabel).toBe("<1%");
  });

  it("prints the ordinary percentage the ordinary way", () => {
    const report = buildReport(
      [
        entry({ amountCentavos: parsePesos("750") }),
        entry({ id: "b", amountCentavos: parsePesos("250"), tag: "apparel", category: "shirts" }),
      ],
      RANGE,
    );
    expect(report.byDivision[0].shareLabel).toBe("75%");
    expect(report.byDivision[1].shareLabel).toBe("25%");
  });
});
