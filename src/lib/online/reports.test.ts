import { describe, expect, it } from "vitest";

import {
  bucketsFor,
  compareTo,
  figuresFor,
  monthToDateRanges,
  parseChartPeriod,
  salesByProduct,
  sharePercentLabel,
  targetMeter,
  type ReportOrder,
  type ReportPayment,
} from "./reports";
import type { OrderStatus } from "./types";

const today = { year: 2026, month: 9, day: 21 };

const order = (
  id: string,
  createdAt: string,
  totalCentavos: number,
  pieces = 1,
  status: OrderStatus = "new",
): ReportOrder => ({ id, status, createdAt, totalCentavos, pieces });

const september = { from: { year: 2026, month: 9, day: 1 }, to: today, label: "September" };

describe("figuresFor", () => {
  it("counts an order on the day it was ORDERED", () => {
    const figures = figuresFor(
      [order("a", "2026-09-10T03:00:00Z", 100000, 6)],
      [],
      september,
    );
    expect(figures.salesBookedCentavos).toBe(100000);
    expect(figures.ordersReceived).toBe(1);
    expect(figures.pieces).toBe(6);
  });

  it("leaves a cancelled order out - it was never a sale", () => {
    const figures = figuresFor(
      [
        order("a", "2026-09-10T03:00:00Z", 100000),
        order("b", "2026-09-11T03:00:00Z", 500000, 1, "cancelled"),
      ],
      [],
      september,
    );
    expect(figures.salesBookedCentavos).toBe(100000);
    expect(figures.ordersReceived).toBe(1);
  });

  it("counts a payment on the day it CAME IN, not on the day the order was placed", () => {
    /*
      A down payment in September on an August order lands in a different
      bucket of each figure, and that is correct - which is why the screen
      carries a footnote saying so.
    */
    const figures = figuresFor(
      [order("a", "2026-08-30T03:00:00Z", 100000)],
      [{ paidOn: "2026-09-02", amountCentavos: 50000, voidedAt: null }],
      september,
    );
    expect(figures.salesBookedCentavos).toBe(0);
    expect(figures.cashCollectedCentavos).toBe(50000);
  });

  it("skips a voided payment", () => {
    const payments: ReportPayment[] = [
      { paidOn: "2026-09-02", amountCentavos: 50000, voidedAt: null },
      { paidOn: "2026-09-03", amountCentavos: 50000, voidedAt: "2026-09-04T00:00:00Z" },
    ];
    expect(figuresFor([], payments, september).cashCollectedCentavos).toBe(50000);
  });

  it("buckets by the MANILA date, not the UTC one", () => {
    /*
      11pm on 31 August in UTC is 7am on 1 September in San Carlos City. An
      order taken that morning belongs to September, and a UTC comparison
      would put it in August every time.
    */
    const figures = figuresFor([order("a", "2026-08-31T16:30:00Z", 100000)], [], september);
    expect(figures.ordersReceived).toBe(1);
  });

  it("gives no average when no orders came in - dividing by nothing says nothing", () => {
    expect(figuresFor([], [], september).averageOrderCentavos).toBeNull();
  });

  it("averages to the centavo", () => {
    const figures = figuresFor(
      [order("a", "2026-09-01T03:00:00Z", 10000), order("b", "2026-09-02T03:00:00Z", 10001)],
      [],
      september,
    );
    expect(figures.averageOrderCentavos).toBe(10001);
  });
});

describe("compareTo", () => {
  it("says nothing rather than infinity when there was nothing before", () => {
    const comparison = compareTo(50000, 0, "last month");
    expect(comparison.percent).toBeNull();
    expect(comparison.direction).toBe("unknown");
  });

  it("reads up, down and flat", () => {
    expect(compareTo(150, 100, "x").direction).toBe("up");
    expect(compareTo(150, 100, "x").percent).toBe(50);
    expect(compareTo(50, 100, "x").direction).toBe("down");
    expect(compareTo(100, 100, "x").direction).toBe("flat");
  });
});

describe("monthToDateRanges", () => {
  it("compares the same days of the month before", () => {
    // Eleven days against thirty always reads as a collapse.
    const { thisMonth, lastMonth } = monthToDateRanges(today);
    expect(thisMonth.from).toEqual({ year: 2026, month: 9, day: 1 });
    expect(thisMonth.to).toEqual(today);
    expect(lastMonth.from).toEqual({ year: 2026, month: 8, day: 1 });
    expect(lastMonth.to).toEqual({ year: 2026, month: 8, day: 21 });
    expect(lastMonth.label).toContain("21 days");
  });

  it("does not ask February for a 31st it has not got", () => {
    const { lastMonth } = monthToDateRanges({ year: 2026, month: 3, day: 31 });
    expect(lastMonth.to).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it("steps back across a year end", () => {
    const { lastMonth } = monthToDateRanges({ year: 2026, month: 1, day: 5 });
    expect(lastMonth.from).toEqual({ year: 2025, month: 12, day: 1 });
  });
});

describe("bucketsFor", () => {
  it("makes eight weekly buckets, all starting on a Monday, oldest first", () => {
    const buckets = bucketsFor("8_weeks", today); // 21 Sep 2026 is a Monday
    expect(buckets).toHaveLength(8);
    expect(buckets[7].from).toEqual(today);
    expect(buckets[0].from).toEqual({ year: 2026, month: 8, day: 3 });
    for (const bucket of buckets) {
      const weekday = new Date(
        Date.UTC(bucket.from.year, bucket.from.month - 1, bucket.from.day),
      ).getUTCDay();
      expect(weekday).toBe(1);
    }
  });

  it("includes the week we are in, part week and all", () => {
    const buckets = bucketsFor("12_weeks", { year: 2026, month: 9, day: 23 });
    expect(buckets).toHaveLength(12);
    expect(buckets[11].from).toEqual({ year: 2026, month: 9, day: 21 });
    expect(buckets[11].to).toEqual({ year: 2026, month: 9, day: 27 });
  });

  it("makes six monthly buckets ending with this month", () => {
    const buckets = bucketsFor("6_months", today);
    expect(buckets).toHaveLength(6);
    expect(buckets[0].key).toBe("2026-04");
    expect(buckets[5].key).toBe("2026-09");
    expect(buckets[5].to).toEqual({ year: 2026, month: 9, day: 30 });
  });
});

describe("parseChartPeriod", () => {
  it("falls back rather than trusting the URL", () => {
    expect(parseChartPeriod("nonsense")).toBe("8_weeks");
    expect(parseChartPeriod("6_months")).toBe("6_months");
  });
});

describe("salesByProduct", () => {
  const item = (
    productName: string,
    qty: number,
    unitPriceCentavos: number | null,
  ) => ({
    productName,
    pricingMode: unitPriceCentavos === null ? ("quote" as const) : ("fixed" as const),
    unitPriceCentavos,
    qty,
  });

  it("adds up what each product brought in, biggest first", () => {
    const lines = salesByProduct(
      [
        {
          ...order("a", "2026-09-10T03:00:00Z", 314000, 8),
          quoteAmountCentavos: null,
          items: [item("Jersey", 6, 45000), item("Shirt", 2, 22000)],
        },
      ],
      september,
    );
    expect(lines).toEqual([
      { productName: "Jersey", centavos: 270000, pieces: 6 },
      { productName: "Shirt", centavos: 44000, pieces: 2 },
    ]);
  });

  it("splits one quote across the quote items by pieces, exactly", () => {
    const lines = salesByProduct(
      [
        {
          ...order("a", "2026-09-10T03:00:00Z", 90000, 3),
          quoteAmountCentavos: 90000,
          items: [item("Jacket", 2, null), item("Cap", 1, null)],
        },
      ],
      september,
    );
    expect(lines).toEqual([
      { productName: "Jacket", centavos: 60000, pieces: 2 },
      { productName: "Cap", centavos: 30000, pieces: 1 },
    ]);
    expect(lines.reduce((total, line) => total + line.centavos, 0)).toBe(90000);
  });

  it("still counts the pieces of an item nobody has quoted yet", () => {
    const lines = salesByProduct(
      [
        {
          ...order("a", "2026-09-10T03:00:00Z", 0, 2),
          quoteAmountCentavos: null,
          items: [item("Jacket", 2, null)],
        },
      ],
      september,
    );
    expect(lines).toEqual([{ productName: "Jacket", centavos: 0, pieces: 2 }]);
  });

  it("leaves a cancelled order out", () => {
    const lines = salesByProduct(
      [
        {
          ...order("a", "2026-09-10T03:00:00Z", 100000, 1, "cancelled"),
          quoteAmountCentavos: null,
          items: [item("Jersey", 1, 100000)],
        },
      ],
      september,
    );
    expect(lines).toEqual([]);
  });
});

describe("sharePercentLabel", () => {
  it("never prints 0% beside money that was actually taken", () => {
    expect(sharePercentLabel(100, 1000000)).toBe("<1%");
  });

  it("rounds an ordinary share", () => {
    expect(sharePercentLabel(250000, 1000000)).toBe("25%");
  });

  it("has nothing to say about a share of nothing", () => {
    expect(sharePercentLabel(0, 0)).toBe("—");
  });
});

describe("targetMeter", () => {
  it("has no meter at all until the owner sets a target", () => {
    /*
      The most confidently wrong thing this screen could print is a full bar on
      the first of the month. A target of nothing is "not known", never
      "reached".
    */
    const meter = targetMeter(8786000, null);
    expect(meter.targetCentavos).toBeNull();
    expect(meter.percent).toBeNull();
    expect(meter.reached).toBe(false);
  });

  it("works out how far there is to go", () => {
    const meter = targetMeter(8786000, 10000000);
    expect(meter.percent).toBe(88);
    expect(meter.remainingCentavos).toBe(1214000);
    expect(meter.reached).toBe(false);
  });

  it("says a target that is met is reached, and asks for nothing more", () => {
    const meter = targetMeter(12000000, 10000000);
    expect(meter.reached).toBe(true);
    expect(meter.remainingCentavos).toBe(0);
  });
});
