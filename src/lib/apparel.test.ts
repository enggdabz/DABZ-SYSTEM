import { describe, expect, it } from "vitest";

import {
  downPaymentAdvice,
  formatOrderNumber,
  isOpenOrder,
  lineTotal,
  orderTotals,
  orderWarnings,
  sizeExtra,
  splitPaymentByCategory,
  type OrderLine,
  type OrderPayment,
  type RosterEntry,
} from "./apparel";
import { parsePesos, sumCentavos } from "./money";

function line(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: "line-1",
    orderId: "order-1",
    name: "Sublimation jersey set",
    fabric: "Dri-fit",
    collar: "Round neck",
    unitPriceCentavos: parsePesos("650"),
    quantity: 1,
    incomeCategory: "sublimation_jerseys",
    ...overrides,
  };
}

function player(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    id: "r1",
    lineId: "line-1",
    playerName: "Dela Cruz",
    playerNumber: "7",
    size: "M",
    sizeExtraCentavos: 0,
    ...overrides,
  };
}

function payment(overrides: Partial<OrderPayment> = {}): OrderPayment {
  return {
    id: "p1",
    orderId: "order-1",
    amountCentavos: parsePesos("5000"),
    paidOn: "2026-09-18",
    source: "cash_drawer",
    kind: "down_payment",
    note: null,
    ...overrides,
  };
}

describe("sizeExtra", () => {
  const sizes = [
    { size: "M" as const, extraCentavos: 0 },
    { size: "2XL" as const, extraCentavos: parsePesos("50") },
    { size: "3XL" as const, extraCentavos: null },
  ];

  it("gives what the owner set", () => {
    expect(sizeExtra(sizes, "2XL")).toBe(parsePesos("50"));
    expect(sizeExtra(sizes, "M")).toBe(0);
  });

  it("returns null - not zero - when the owner has not said", () => {
    // Zero would be a promise that the size costs nothing extra.
    expect(sizeExtra(sizes, "3XL")).toBeNull();
    expect(sizeExtra(sizes, "5XL")).toBeNull();
  });
});

describe("lineTotal", () => {
  it("counts the roster as the quantity when there is one", () => {
    // Fifteen names means fifteen jerseys. A typed quantity beside them is a
    // second answer to the same question.
    const roster = Array.from({ length: 15 }, (_, i) =>
      player({ id: `r${i}`, playerNumber: String(i) }),
    );
    const result = lineTotal(line({ quantity: 99 }), roster);

    expect(result.quantity).toBe(15);
    expect(result.baseCentavos).toBe(parsePesos("9750"));
  });

  it("uses the typed quantity when there are no names", () => {
    const result = lineTotal(line({ name: "Plain shirt", quantity: 50 }), []);
    expect(result.quantity).toBe(50);
    expect(result.totalCentavos).toBe(parsePesos("32500"));
  });

  it("adds what the big sizes cost", () => {
    const roster = [
      player({ id: "a", size: "M", sizeExtraCentavos: 0 }),
      player({ id: "b", size: "2XL", sizeExtraCentavos: parsePesos("50") }),
      player({ id: "c", size: "3XL", sizeExtraCentavos: parsePesos("75") }),
    ];
    const result = lineTotal(line(), roster);

    expect(result.baseCentavos).toBe(parsePesos("1950"));
    expect(result.sizeExtrasCentavos).toBe(parsePesos("125"));
    expect(result.totalCentavos).toBe(parsePesos("2075"));
  });

  it("ignores names belonging to another line", () => {
    const roster = [
      player({ id: "a", lineId: "line-1" }),
      player({ id: "b", lineId: "line-2" }),
    ];
    expect(lineTotal(line(), roster).quantity).toBe(1);
  });

  it("is zero for an item nobody has priced yet", () => {
    const result = lineTotal(line({ unitPriceCentavos: 0, quantity: 10 }), []);
    expect(result.totalCentavos).toBe(0);
  });
});

describe("orderTotals", () => {
  const lines = [
    line({ id: "line-1" }),
    line({
      id: "line-2",
      name: "Jacket",
      unitPriceCentavos: parsePesos("900"),
      quantity: 2,
      incomeCategory: "jackets",
    }),
  ];
  const roster = [
    player({ id: "a", lineId: "line-1", size: "M", sizeExtraCentavos: 0 }),
    player({
      id: "b",
      lineId: "line-1",
      size: "2XL",
      sizeExtraCentavos: parsePesos("50"),
    }),
  ];

  it("adds up its own rows", () => {
    const totals = orderTotals({ lines, roster, payments: [] });
    // 2 jerseys at ₱650 + ₱50 for the 2XL, plus 2 jackets at ₱900.
    expect(totals.totalCentavos).toBe(parsePesos("3150"));
    expect(totals.itemCount).toBe(4);
    expect(
      sumCentavos(totals.lines.map((entry) => entry.totalCentavos)),
    ).toBe(totals.totalCentavos);
  });

  it("works out the balance from the payments", () => {
    const totals = orderTotals({
      lines,
      roster,
      payments: [payment({ amountCentavos: parsePesos("1575") })],
    });
    expect(totals.paidCentavos).toBe(parsePesos("1575"));
    expect(totals.balanceCentavos).toBe(parsePesos("1575"));
    expect(totals.fullyPaid).toBe(false);
  });

  it("adds several payments together", () => {
    const totals = orderTotals({
      lines,
      roster,
      payments: [
        payment({ id: "p1", amountCentavos: parsePesos("1575") }),
        payment({ id: "p2", amountCentavos: parsePesos("1000"), kind: "balance" }),
      ],
    });
    expect(totals.balanceCentavos).toBe(parsePesos("575"));
  });

  it("never shows a negative balance, and says so when overpaid", () => {
    const totals = orderTotals({
      lines,
      roster,
      payments: [payment({ amountCentavos: parsePesos("4000") })],
    });
    expect(totals.balanceCentavos).toBe(0);
    expect(totals.overpaid).toBe(true);
    expect(totals.overpaidByCentavos).toBe(parsePesos("850"));
  });

  it("is not 'fully paid' when nothing has been ordered yet", () => {
    // An empty order with no payments is not a settled order.
    const totals = orderTotals({ lines: [], roster: [], payments: [] });
    expect(totals.totalCentavos).toBe(0);
    expect(totals.fullyPaid).toBe(false);
  });
});

describe("downPaymentAdvice", () => {
  it("asks for the policy share", () => {
    const advice = downPaymentAdvice({
      totalCentavos: parsePesos("10000"),
      paidCentavos: parsePesos("3000"),
      percent: 50,
    });
    expect(advice.expectedCentavos).toBe(parsePesos("5000"));
    expect(advice.short).toBe(true);
    expect(advice.shortByCentavos).toBe(parsePesos("2000"));
  });

  it("rounds up, so the shop is never a centavo short of its own rule", () => {
    // Half of ₱100.01 is ₱50.005.
    const advice = downPaymentAdvice({
      totalCentavos: parsePesos("100.01"),
      paidCentavos: 0,
      percent: 50,
    });
    expect(advice.expectedCentavos).toBe(parsePesos("50.01"));
  });

  it("is satisfied by an exact payment", () => {
    const advice = downPaymentAdvice({
      totalCentavos: parsePesos("10000"),
      paidCentavos: parsePesos("5000"),
      percent: 50,
    });
    expect(advice.short).toBe(false);
    expect(advice.shortByCentavos).toBe(0);
  });

  it("asks for nothing while no policy is set, and says so", () => {
    // 17.10 suggests 50% as an example. That is not the owner saying so.
    const advice = downPaymentAdvice({
      totalCentavos: parsePesos("10000"),
      paidCentavos: 0,
      percent: null,
    });
    expect(advice.policyMissing).toBe(true);
    expect(advice.expectedCentavos).toBeNull();
    expect(advice.short).toBe(false);
  });

  it("asks for nothing on a zero-total order", () => {
    const advice = downPaymentAdvice({
      totalCentavos: 0,
      paidCentavos: 0,
      percent: 50,
    });
    expect(advice.expectedCentavos).toBe(0);
    expect(advice.short).toBe(false);
  });
});

describe("splitPaymentByCategory", () => {
  const lines = orderTotals({
    lines: [
      line({ id: "line-1", quantity: 10 }),
      line({
        id: "line-2",
        unitPriceCentavos: parsePesos("900"),
        quantity: 10,
        incomeCategory: "jackets",
      }),
    ],
    roster: [],
    payments: [],
  }).lines;

  it("shares a payment in proportion to the order", () => {
    // ₱6,500 of jerseys and ₱9,000 of jackets, so a ₱1,550 payment splits
    // ₱650 / ₱900.
    const split = splitPaymentByCategory({
      lines,
      amountCentavos: parsePesos("1550"),
    });
    expect(split).toEqual([
      { category: "sublimation_jerseys", amountCentavos: parsePesos("650") },
      { category: "jackets", amountCentavos: parsePesos("900") },
    ]);
  });

  it("adds back up to the payment exactly, whatever the rounding", () => {
    for (const amount of ["1", "0.03", "333.33", "7777.77", "10000"]) {
      const split = splitPaymentByCategory({
        lines,
        amountCentavos: parsePesos(amount),
      });
      expect(
        sumCentavos(split.map((part) => part.amountCentavos)),
        amount,
      ).toBe(parsePesos(amount));
    }
  });

  it("puts everything in one category when that is all there is", () => {
    const single = orderTotals({
      lines: [line({ quantity: 5 })],
      roster: [],
      payments: [],
    }).lines;

    expect(
      splitPaymentByCategory({ lines: single, amountCentavos: parsePesos("100") }),
    ).toEqual([
      { category: "sublimation_jerseys", amountCentavos: parsePesos("100") },
    ]);
  });

  it("still lands the money somewhere when nothing is priced", () => {
    // The customer handed over real money; it cannot vanish because the owner
    // has not set a price yet.
    const unpriced = orderTotals({
      lines: [line({ unitPriceCentavos: 0, quantity: 5 })],
      roster: [],
      payments: [],
    }).lines;

    const split = splitPaymentByCategory({
      lines: unpriced,
      amountCentavos: parsePesos("500"),
    });
    expect(sumCentavos(split.map((part) => part.amountCentavos))).toBe(
      parsePesos("500"),
    );
  });

  it("splits nothing into nothing", () => {
    expect(splitPaymentByCategory({ lines, amountCentavos: 0 })).toEqual([
      { category: "sublimation_jerseys", amountCentavos: 0 },
      { category: "jackets", amountCentavos: 0 },
    ]);
  });
});

describe("formatOrderNumber", () => {
  it("writes the date and the count for the day", () => {
    expect(
      formatOrderNumber({ year: 2026, month: 9, day: 18, sequence: 3 }),
    ).toBe("A-260918-003");
  });

  it("pads a single-digit month and day", () => {
    expect(
      formatOrderNumber({ year: 2026, month: 1, day: 5, sequence: 12 }),
    ).toBe("A-260105-012");
  });
});

describe("isOpenOrder", () => {
  it("counts everything before release as open", () => {
    expect(isOpenOrder("quoted")).toBe(true);
    expect(isOpenOrder("in_production")).toBe(true);
    expect(isOpenOrder("ready")).toBe(true);
  });

  it("closes on release or cancellation", () => {
    expect(isOpenOrder("released")).toBe(false);
    expect(isOpenOrder("cancelled")).toBe(false);
  });
});

describe("orderWarnings", () => {
  const today = "2026-09-18";
  const totals = orderTotals({
    lines: [line({ quantity: 10 })],
    roster: [],
    payments: [],
  });

  it("counts the days past a promised date", () => {
    const warnings = orderWarnings({
      status: "in_production",
      promisedOn: "2026-09-15",
      today,
      totals,
    });
    expect(warnings[0]).toEqual({
      kind: "overdue",
      label: "3 days past the promised date",
    });
  });

  it("says one day, not 1 days", () => {
    expect(
      orderWarnings({ status: "ready", promisedOn: "2026-09-19", today, totals })[0]
        .label,
    ).toBe("Promised in 1 day");
  });

  it("warns as the promised date approaches", () => {
    expect(
      orderWarnings({ status: "ready", promisedOn: "2026-09-20", today, totals })[0]
        .kind,
    ).toBe("due_soon");
    expect(
      orderWarnings({ status: "ready", promisedOn: "2026-09-18", today, totals })[0]
        .label,
    ).toBe("Promised today");
  });

  it("is quiet about a date still comfortably ahead", () => {
    expect(
      orderWarnings({ status: "ready", promisedOn: "2026-10-01", today, totals }),
    ).toEqual([]);
  });

  it("says when no promised date was set rather than assuming one", () => {
    expect(
      orderWarnings({ status: "quoted", promisedOn: null, today, totals })[0].kind,
    ).toBe("no_promised_date");
  });

  it("stops chasing the date once a settled order is released", () => {
    const settled = orderTotals({
      lines: [line({ quantity: 10 })],
      roster: [],
      payments: [payment({ amountCentavos: parsePesos("6500") })],
    });
    expect(
      orderWarnings({
        status: "released",
        promisedOn: "2026-01-01",
        today,
        totals: settled,
      }),
    ).toEqual([]);
  });

  it("keeps chasing the money on a released order", () => {
    // The jerseys have gone; the only thing left to chase is the balance.
    const owing = orderTotals({
      lines: [line({ quantity: 10 })],
      roster: [],
      payments: [payment({ amountCentavos: parsePesos("1000") })],
    });
    const warnings = orderWarnings({
      status: "released",
      promisedOn: "2026-09-01",
      today,
      totals: owing,
    });
    expect(warnings.map((warning) => warning.kind)).toEqual([
      "released_with_balance",
    ]);
  });

  it("flags an item nobody has priced", () => {
    const unpriced = orderTotals({
      lines: [line({ unitPriceCentavos: 0, quantity: 5 })],
      roster: [],
      payments: [],
    });
    const warnings = orderWarnings({
      status: "quoted",
      promisedOn: "2026-10-01",
      today,
      totals: unpriced,
    });
    expect(warnings[0]).toEqual({
      kind: "unpriced_line",
      label: "1 item with no price",
    });
  });
});
