import { describe, expect, it } from "vitest";

import { parsePesos } from "./money";
import {
  bucketsForRange,
  buildSalesTrend,
  formatAxisPesos,
  niceAxisMax,
  niceAxisRange,
  overviewTrendHref,
  profitTrend,
  parseTrendView,
  trendBuckets,
  trendSummary,
  type TrendEntry,
} from "./sales-trend";
import { civilDateToISO } from "./period";

const TODAY = { year: 2026, month: 10, day: 2 }; // a Friday

function entry(overrides: Partial<TrendEntry> = {}): TrendEntry {
  return {
    occurredAt: "2026-10-02T02:00:00Z",
    direction: "in",
    category: "photocopy",
    amountCentavos: parsePesos("500"),
    voidedAt: null,
    ...overrides,
  };
}

describe("parseTrendView", () => {
  it("falls back to daily for anything it does not know", () => {
    expect(parseTrendView("weekly")).toBe("weekly");
    expect(parseTrendView(undefined)).toBe("daily");
    expect(parseTrendView("hourly")).toBe("daily");
  });
});

describe("trendBuckets", () => {
  it("gives 30 days ending today", () => {
    const buckets = trendBuckets("daily", TODAY, "monday");
    expect(buckets).toHaveLength(30);
    expect(civilDateToISO(buckets[0].start)).toBe("2026-09-03");
    expect(civilDateToISO(buckets[29].start)).toBe("2026-10-02");
    expect(buckets[29].current).toBe(true);
    expect(buckets.filter((b) => b.current)).toHaveLength(1);
  });

  it("starts weeks on the shop's own first day", () => {
    const monday = trendBuckets("weekly", TODAY, "monday");
    expect(monday).toHaveLength(12);
    expect(civilDateToISO(monday[11].start)).toBe("2026-09-28");
    expect(civilDateToISO(monday[11].end)).toBe("2026-10-05");
    expect(civilDateToISO(trendBuckets("weekly", TODAY, "sunday")[11].start)).toBe(
      "2026-09-27",
    );
  });

  it("crosses a year boundary for months", () => {
    const months = trendBuckets("monthly", TODAY, "monday");
    expect(months).toHaveLength(12);
    expect(civilDateToISO(months[0].start)).toBe("2025-11-01");
    expect(civilDateToISO(months[2].start)).toBe("2026-01-01");
    expect(civilDateToISO(months[11].end)).toBe("2026-11-01");
  });

  it("gives five whole years", () => {
    const years = trendBuckets("yearly", TODAY, "monday");
    expect(years.map((b) => b.shortLabel)).toEqual(["2022", "2023", "2024", "2025", "2026"]);
  });

  it("leaves no gap between buckets", () => {
    for (const view of ["daily", "weekly", "monthly", "yearly"] as const) {
      const buckets = trendBuckets(view, TODAY, "monday");
      for (let i = 1; i < buckets.length; i += 1) {
        expect(civilDateToISO(buckets[i].start)).toBe(civilDateToISO(buckets[i - 1].end));
      }
    }
  });
});

describe("buildSalesTrend", () => {
  const buckets = trendBuckets("daily", TODAY, "monday");
  const todayPoint = (entries: TrendEntry[]) => buildSalesTrend(entries, buckets)[29];

  it("adds up income exactly, in centavos", () => {
    const point = todayPoint([
      entry({ amountCentavos: parsePesos("12.50") }),
      entry({ amountCentavos: parsePesos("0.10") }),
      entry({ amountCentavos: parsePesos("0.20") }),
    ]);
    expect(point.centavos).toBe(1280);
  });

  it("skips voided entries, money out, loans and owner capital", () => {
    const point = todayPoint([
      entry(),
      entry({ voidedAt: "2026-10-02T03:00:00Z" }),
      entry({ direction: "out", category: "materials_supplies" }),
      entry({ category: "loan_proceeds" }),
      entry({ category: "owner_capital" }),
    ]);
    expect(point.centavos).toBe(parsePesos("500"));
  });

  it("places an entry on its Manila day, not its UTC day", () => {
    // 7am on 2 Oct in Manila is 11pm on 1 Oct in UTC.
    const points = buildSalesTrend(
      [entry({ occurredAt: "2026-10-01T23:00:00Z" })],
      buckets,
    );
    expect(points[29].centavos).toBe(parsePesos("500"));
    expect(points[28].centavos).toBe(0);
  });

  it("ignores entries outside the range", () => {
    const points = buildSalesTrend(
      [entry({ occurredAt: "2026-08-01T02:00:00Z" })],
      buckets,
    );
    expect(points.every((p) => p.centavos === 0)).toBe(true);
  });

  it("puts the whole range's money somewhere when bucketed by week", () => {
    const weeks = trendBuckets("weekly", TODAY, "monday");
    const entries = [
      entry({ occurredAt: "2026-09-27T15:59:00Z" }), // Sun 27 Sep 23:59 Manila
      entry({ occurredAt: "2026-09-27T16:00:00Z" }), // Mon 28 Sep 00:00 Manila
    ];
    const points = buildSalesTrend(entries, weeks);
    expect(points[10].centavos).toBe(parsePesos("500"));
    expect(points[11].centavos).toBe(parsePesos("500"));
  });
});

describe("niceAxisMax", () => {
  it("rounds up to a figure a person would write on an axis", () => {
    expect(niceAxisMax(parsePesos("4968"))).toBe(parsePesos("5000"));
    expect(niceAxisMax(parsePesos("5028.01"))).toBe(parsePesos("10000"));
    expect(niceAxisMax(parsePesos("1800"))).toBe(parsePesos("2000"));
    expect(niceAxisMax(parsePesos("2100"))).toBe(parsePesos("2500"));
    expect(niceAxisMax(parsePesos("1000"))).toBe(parsePesos("1000"));
  });

  it("never returns zero, so an empty line still has an axis", () => {
    expect(niceAxisMax(0)).toBe(100);
  });
});

describe("trendSummary", () => {
  it("totals the points and names the best one", () => {
    const points = buildSalesTrend(
      [
        entry({ occurredAt: "2026-10-01T02:00:00Z", amountCentavos: parsePesos("900") }),
        entry({ amountCentavos: parsePesos("100.25") }),
      ],
      trendBuckets("daily", TODAY, "monday"),
    );
    const summary = trendSummary(points);
    expect(summary.totalCentavos).toBe(parsePesos("1000.25"));
    expect(summary.best?.shortLabel).toBe(points[28].shortLabel);
  });

  it("names no best point when nothing came in", () => {
    expect(trendSummary(buildSalesTrend([], trendBuckets("daily", TODAY, "monday"))).best).toBeNull();
  });
});

describe("formatAxisPesos", () => {
  it("shortens big figures for the axis", () => {
    expect(formatAxisPesos(0)).toBe("₱0");
    expect(formatAxisPesos(parsePesos("500"))).toBe("₱500");
    expect(formatAxisPesos(parsePesos("2500"))).toBe("₱2.5K");
    expect(formatAxisPesos(parsePesos("1250000"))).toBe("₱1.25M");
    expect(formatAxisPesos(-parsePesos("2000"))).toBe("-₱2K");
  });
});

describe("expenses", () => {
  const buckets = trendBuckets("daily", TODAY, "monday");

  it("adds up shop costs and leaves out money in and owner withdrawals", () => {
    const points = buildSalesTrend(
      [
        entry({ direction: "out", category: "materials_supplies", amountCentavos: parsePesos("60") }),
        entry({ direction: "out", category: "fixed_bills", amountCentavos: parsePesos("0.25") }),
        entry({ direction: "out", category: "owner_withdrawal" }),
        entry({ direction: "out", category: "materials_supplies", voidedAt: "2026-10-02T03:00:00Z" }),
        entry(),
      ],
      buckets,
      "expenses",
    );
    expect(points[29].centavos).toBe(parsePesos("60.25"));
  });

  it("still defaults to sales", () => {
    const points = buildSalesTrend(
      [entry(), entry({ direction: "out", category: "materials_supplies" })],
      buckets,
    );
    expect(points[29].centavos).toBe(parsePesos("500"));
  });
});

describe("overviewTrendHref", () => {
  it("keeps each graph's own view and leaves daily out", () => {
    expect(overviewTrendHref({ money: "daily", profit: "daily" })).toBe("/overview");
    expect(overviewTrendHref({ money: "weekly", profit: "daily" })).toBe("/overview?money=weekly");
    expect(overviewTrendHref({ money: "daily", profit: "yearly" })).toBe("/overview?profit=yearly");
    expect(overviewTrendHref({ money: "monthly", profit: "weekly" })).toBe(
      "/overview?money=monthly&profit=weekly",
    );
  });
});

describe("profitTrend", () => {
  const buckets = trendBuckets("daily", TODAY, "monday");
  const entries = [
    entry({ amountCentavos: parsePesos("1000.10") }),
    entry({ direction: "out", category: "materials_supplies", amountCentavos: parsePesos("250.05") }),
    entry({ occurredAt: "2026-10-01T02:00:00Z", direction: "out", category: "fixed_bills", amountCentavos: parsePesos("300") }),
    // Not a shop cost, so it does not come off profit.
    entry({ direction: "out", category: "owner_withdrawal", amountCentavos: parsePesos("5000") }),
    // Not earnings, so it does not add to profit.
    entry({ category: "loan_proceeds", amountCentavos: parsePesos("9000") }),
  ];
  const sales = buildSalesTrend(entries, buckets, "sales");
  const expenses = buildSalesTrend(entries, buckets, "expenses");
  const profit = profitTrend(sales, expenses);

  it("is sales less expenses, to the centavo", () => {
    expect(profit[29].centavos).toBe(parsePesos("750.05"));
  });

  it("goes below zero on a day with costs and no sales", () => {
    expect(profit[28].centavos).toBe(-parsePesos("300"));
  });

  it("adds up to total sales less total expenses", () => {
    expect(trendSummary(profit).totalCentavos).toBe(
      trendSummary(sales).totalCentavos - trendSummary(expenses).totalCentavos,
    );
  });

  it("refuses lists that do not cover the same periods", () => {
    expect(() => profitTrend(sales, expenses.slice(1))).toThrow();
  });
});

describe("niceAxisRange", () => {
  it("starts at zero when nothing is negative", () => {
    expect(niceAxisRange([parsePesos("4968"), 0])).toEqual({ min: 0, max: parsePesos("5000") });
  });

  it("keeps zero on the scale when everything is a loss", () => {
    expect(niceAxisRange([-parsePesos("300"), -parsePesos("1800")])).toEqual({
      min: -parsePesos("2000"),
      max: 0,
    });
  });

  it("rounds each end out on its own", () => {
    expect(niceAxisRange([-parsePesos("300"), parsePesos("4968")])).toEqual({
      min: -parsePesos("500"),
      max: parsePesos("5000"),
    });
  });

  it("still has a scale when every point is zero", () => {
    expect(niceAxisRange([0, 0])).toEqual({ min: 0, max: 100 });
  });
});

describe("bucketsForRange", () => {
  const d = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return { year, month, day };
  };

  it("gives a point per day for this week, ending on today", () => {
    const buckets = bucketsForRange(d("2026-09-28"), d("2026-10-02"), TODAY);
    expect(buckets.map((b) => civilDateToISO(b.start))).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(buckets.filter((b) => b.current).map((b) => civilDateToISO(b.start))).toEqual([
      "2026-10-02",
    ]);
  });

  it("marks nothing as still filling up in a period that has ended", () => {
    const lastMonth = bucketsForRange(d("2026-09-01"), d("2026-09-30"), TODAY);
    expect(lastMonth).toHaveLength(30);
    expect(lastMonth.some((b) => b.current)).toBe(false);
  });

  it("goes a month at a time for this year", () => {
    const buckets = bucketsForRange(d("2026-01-01"), d("2026-10-02"), TODAY);
    expect(buckets.map((b) => b.shortLabel)).toHaveLength(10);
    expect(civilDateToISO(buckets[0].start)).toBe("2026-01-01");
    expect(civilDateToISO(buckets[9].start)).toBe("2026-10-01");
    expect(buckets[9].current).toBe(true);
  });

  it("switches from days to months past two months", () => {
    expect(bucketsForRange(d("2026-08-02"), d("2026-10-02"), TODAY)).toHaveLength(62);
    expect(bucketsForRange(d("2026-08-01"), d("2026-10-02"), TODAY)).toHaveLength(3);
  });

  it("puts every centavo of the range in some bucket", () => {
    const buckets = bucketsForRange(d("2026-01-01"), d("2026-10-02"), TODAY);
    const entries = [
      entry({ occurredAt: "2025-12-31T16:00:00Z" }), // 1 Jan, 00:00 Manila
      entry({ occurredAt: "2026-06-15T02:00:00Z", amountCentavos: 1 }),
      entry(),
    ];
    const total = trendSummary(buildSalesTrend(entries, buckets)).totalCentavos;
    expect(total).toBe(parsePesos("1000") + 1);
  });

  it("gives one point for a single day", () => {
    expect(bucketsForRange(TODAY, TODAY, TODAY)).toHaveLength(1);
  });
});
