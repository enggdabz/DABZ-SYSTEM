import { describe, expect, it } from "vitest";

import {
  UNIT_INCOME_CATEGORY,
  formatTicketNumber,
  isAwaitingCollection,
  isOpenTicket,
  splitTicketPayment,
  ticketLineTotal,
  ticketTotals,
  ticketWarnings,
  unclaimedStatus,
  warrantyStatus,
  type TicketLine,
  type TicketPayment,
} from "./repairs";
import { parsePesos, sumCentavos } from "./money";
import { splitAmountByCategory } from "./ledger";

function line(overrides: Partial<TicketLine> = {}): TicketLine {
  return {
    id: "l1",
    ticketId: "t1",
    kind: "service",
    name: "Printer head cleaning",
    unitPriceCentavos: parsePesos("500"),
    quantity: 1,
    incomeCategory: "epson_printer_repair",
    stockItemId: null,
    ...overrides,
  };
}

function payment(overrides: Partial<TicketPayment> = {}): TicketPayment {
  return {
    id: "p1",
    ticketId: "t1",
    amountCentavos: parsePesos("300"),
    paidOn: "2026-09-18",
    source: "cash_drawer",
    note: null,
    ...overrides,
  };
}

describe("ticketLineTotal", () => {
  it("multiplies the price by the quantity", () => {
    expect(
      ticketLineTotal(line({ unitPriceCentavos: parsePesos("250"), quantity: 3 }))
        .totalCentavos,
    ).toBe(parsePesos("750"));
  });

  it("is zero for a line nobody has priced", () => {
    expect(ticketLineTotal(line({ unitPriceCentavos: 0 })).totalCentavos).toBe(0);
  });
});

describe("ticketTotals", () => {
  const lines = [
    line({ id: "l1", kind: "checking_fee", name: "Checking fee", unitPriceCentavos: parsePesos("150"), incomeCategory: "checking_fee" }),
    line({ id: "l2", kind: "service", unitPriceCentavos: parsePesos("500") }),
    line({ id: "l3", kind: "part", name: "Ink pad", unitPriceCentavos: parsePesos("120"), quantity: 2, incomeCategory: "parts_sold" }),
  ];

  it("adds up its own rows", () => {
    const totals = ticketTotals({ lines, payments: [] });
    expect(totals.totalCentavos).toBe(parsePesos("890"));
    expect(
      sumCentavos(totals.lines.map((entry) => entry.totalCentavos)),
    ).toBe(totals.totalCentavos);
  });

  it("keeps the checking fee separate, because it is charged even on a no", () => {
    const totals = ticketTotals({ lines, payments: [] });
    expect(totals.checkingFeeCentavos).toBe(parsePesos("150"));
    expect(totals.labourCentavos).toBe(parsePesos("500"));
    expect(totals.partsCentavos).toBe(parsePesos("240"));
  });

  it("works out the balance from the payments", () => {
    const totals = ticketTotals({
      lines,
      payments: [payment({ amountCentavos: parsePesos("300") })],
    });
    expect(totals.balanceCentavos).toBe(parsePesos("590"));
  });

  it("never shows a negative balance, and says so when overpaid", () => {
    const totals = ticketTotals({
      lines,
      payments: [payment({ amountCentavos: parsePesos("1000") })],
    });
    expect(totals.balanceCentavos).toBe(0);
    expect(totals.overpaid).toBe(true);
    expect(totals.overpaidByCentavos).toBe(parsePesos("110"));
  });

  it("counts the lines nobody has priced", () => {
    const totals = ticketTotals({
      lines: [...lines, line({ id: "l4", unitPriceCentavos: 0 })],
      payments: [],
    });
    expect(totals.unpricedCount).toBe(1);
    // And they add nothing, rather than being guessed at.
    expect(totals.totalCentavos).toBe(parsePesos("890"));
  });

  it("is zero for an empty ticket", () => {
    const totals = ticketTotals({ lines: [], payments: [] });
    expect(totals.totalCentavos).toBe(0);
    expect(totals.balanceCentavos).toBe(0);
  });
});

describe("splitTicketPayment", () => {
  const lines = ticketTotals({
    lines: [
      line({ id: "l1", kind: "checking_fee", unitPriceCentavos: parsePesos("150"), incomeCategory: "checking_fee" }),
      line({ id: "l2", kind: "service", unitPriceCentavos: parsePesos("500") }),
      line({ id: "l3", kind: "part", unitPriceCentavos: parsePesos("240"), incomeCategory: "parts_sold" }),
    ],
    payments: [],
  }).lines;

  it("shares a payment across the fee, the labour and the parts", () => {
    const split = splitTicketPayment({
      lines,
      amountCentavos: parsePesos("890"),
      unitKind: "epson_printer",
    });
    expect(split).toEqual([
      { category: "checking_fee", amountCentavos: parsePesos("150") },
      { category: "epson_printer_repair", amountCentavos: parsePesos("500") },
      { category: "parts_sold", amountCentavos: parsePesos("240") },
    ]);
  });

  it("adds back up to the payment exactly, whatever the rounding", () => {
    for (const amount of ["1", "0.07", "333.33", "12345.67"]) {
      const split = splitTicketPayment({
        lines,
        amountCentavos: parsePesos(amount),
        unitKind: "laptop",
      });
      expect(
        sumCentavos(split.map((part) => part.amountCentavos)),
        amount,
      ).toBe(parsePesos(amount));
    }
  });

  it("lands the money on the unit's own category when nothing is priced", () => {
    const unpriced = ticketTotals({
      lines: [line({ unitPriceCentavos: 0 })],
      payments: [],
    }).lines;

    expect(
      splitTicketPayment({
        lines: unpriced,
        amountCentavos: parsePesos("500"),
        unitKind: "laptop",
      }),
    ).toEqual([
      { category: UNIT_INCOME_CATEGORY.laptop, amountCentavos: parsePesos("500") },
    ]);
  });
});

describe("splitAmountByCategory", () => {
  it("adds the weights of a repeated category together", () => {
    const split = splitAmountByCategory({
      weights: [
        { category: "parts_sold", weightCentavos: parsePesos("100") },
        { category: "parts_sold", weightCentavos: parsePesos("300") },
      ],
      amountCentavos: parsePesos("400"),
      fallbackCategory: "laptop_repair",
    });
    expect(split).toEqual([
      { category: "parts_sold", amountCentavos: parsePesos("400") },
    ]);
  });

  it("ignores a category worth nothing", () => {
    const split = splitAmountByCategory({
      weights: [
        { category: "checking_fee", weightCentavos: parsePesos("150") },
        { category: "parts_sold", weightCentavos: 0 },
      ],
      amountCentavos: parsePesos("150"),
      fallbackCategory: "laptop_repair",
    });
    expect(split).toEqual([
      { category: "checking_fee", amountCentavos: parsePesos("150") },
    ]);
  });

  it("splits nothing into nothing when there is nothing to weigh", () => {
    expect(
      splitAmountByCategory({
        weights: [],
        amountCentavos: 0,
        fallbackCategory: "laptop_repair",
      }),
    ).toEqual([]);
  });
});

describe("warrantyStatus", () => {
  const today = "2026-09-18";

  it("says nothing before the unit goes back", () => {
    expect(
      warrantyStatus({ releasedOn: null, warrantyDays: 30, today }).kind,
    ).toBe("not_released");
  });

  it("counts the days left", () => {
    const status = warrantyStatus({
      releasedOn: "2026-09-01",
      warrantyDays: 30,
      today,
    });
    expect(status.kind).toBe("under_warranty");
    expect(status.untilISO).toBe("2026-10-01");
    expect(status.daysLeft).toBe(13);
  });

  it("counts the last day as still covered", () => {
    const status = warrantyStatus({
      releasedOn: "2026-08-19",
      warrantyDays: 30,
      today,
    });
    expect(status.kind).toBe("under_warranty");
    expect(status.label).toBe("Warranty ends today");
  });

  it("says how long ago it ended", () => {
    const status = warrantyStatus({
      releasedOn: "2026-08-01",
      warrantyDays: 30,
      today,
    });
    expect(status.kind).toBe("expired");
    // 1 Aug + 30 days is 31 Aug; 18 Sep is 18 days after that.
    expect(status.label).toBe("Warranty ended 18 days ago");
  });

  it("says so rather than assuming one when no period was recorded", () => {
    expect(
      warrantyStatus({ releasedOn: "2026-09-01", warrantyDays: null, today }).kind,
    ).toBe("no_warranty");
    expect(
      warrantyStatus({ releasedOn: "2026-09-01", warrantyDays: 0, today }).kind,
    ).toBe("no_warranty");
  });

  it("counts correctly across a month end", () => {
    expect(
      warrantyStatus({ releasedOn: "2026-12-20", warrantyDays: 30, today: "2026-12-25" })
        .untilISO,
    ).toBe("2027-01-19");
  });
});

describe("unclaimedStatus", () => {
  const today = "2026-09-18";

  it("counts from the day it was ready, not the day it came in", () => {
    const status = unclaimedStatus({
      status: "ready",
      readyOn: "2026-09-10",
      unclaimedAfterDays: 30,
      today,
    });
    expect(status.daysWaiting).toBe(8);
    expect(status.unclaimed).toBe(false);
  });

  it("flags a unit at the limit, not a day after", () => {
    expect(
      unclaimedStatus({
        status: "ready",
        readyOn: "2026-08-19",
        unclaimedAfterDays: 30,
        today,
      }).unclaimed,
    ).toBe(true);
  });

  it("counts declined and unrepairable units too", () => {
    // That is exactly the pile that grows in the corner of a repair shop.
    for (const status of ["declined", "unrepairable"] as const) {
      expect(
        unclaimedStatus({
          status,
          readyOn: "2026-06-01",
          unclaimedAfterDays: 30,
          today,
        }).unclaimed,
        status,
      ).toBe(true);
    }
  });

  it("says nothing about a unit still being worked on", () => {
    expect(
      unclaimedStatus({
        status: "repairing",
        readyOn: null,
        unclaimedAfterDays: 30,
        today,
      }).waiting,
    ).toBe(false);
  });

  it("says nothing once the unit has gone home", () => {
    expect(
      unclaimedStatus({
        status: "released",
        readyOn: "2026-01-01",
        unclaimedAfterDays: 30,
        today,
      }).waiting,
    ).toBe(false);
  });
});

describe("isOpenTicket / isAwaitingCollection", () => {
  it("treats everything but a released ticket as still in the shop", () => {
    expect(isOpenTicket("received")).toBe(true);
    expect(isOpenTicket("declined")).toBe(true);
    expect(isOpenTicket("released")).toBe(false);
  });

  it("counts ready, declined and unrepairable as waiting for collection", () => {
    expect(isAwaitingCollection("ready")).toBe(true);
    expect(isAwaitingCollection("declined")).toBe(true);
    expect(isAwaitingCollection("unrepairable")).toBe(true);
    expect(isAwaitingCollection("repairing")).toBe(false);
  });
});

describe("ticketWarnings", () => {
  const today = "2026-09-18";
  const totals = ticketTotals({ lines: [line()], payments: [] });

  it("says a quoted ticket is waiting on the customer", () => {
    const warnings = ticketWarnings({
      status: "quoted",
      promisedOn: "2026-09-30",
      readyOn: null,
      today,
      unclaimedAfterDays: 30,
      totals,
    });
    expect(warnings.map((w) => w.kind)).toContain("waiting_on_customer");
  });

  it("counts the days past a promised date", () => {
    const warnings = ticketWarnings({
      status: "repairing",
      promisedOn: "2026-09-15",
      readyOn: null,
      today,
      unclaimedAfterDays: 30,
      totals,
    });
    expect(warnings[0].label).toBe("3 days past the promised date");
  });

  it("flags a unit nobody has collected", () => {
    const warnings = ticketWarnings({
      status: "ready",
      promisedOn: "2026-08-01",
      readyOn: "2026-08-01",
      today,
      unclaimedAfterDays: 30,
      totals,
    });
    expect(warnings.map((w) => w.kind)).toContain("unclaimed");
  });

  it("does not ask a declined unit for a promised date", () => {
    // Nothing is being made, so there is nothing to promise.
    const warnings = ticketWarnings({
      status: "declined",
      promisedOn: null,
      readyOn: "2026-09-17",
      today,
      unclaimedAfterDays: 30,
      totals,
    });
    expect(warnings.map((w) => w.kind)).not.toContain("no_promised_date");
  });

  it("keeps chasing the money on a released ticket", () => {
    const owing = ticketTotals({
      lines: [line()],
      payments: [payment({ amountCentavos: parsePesos("100") })],
    });
    const warnings = ticketWarnings({
      status: "released",
      promisedOn: "2026-01-01",
      readyOn: "2026-01-01",
      today,
      unclaimedAfterDays: 30,
      totals: owing,
    });
    expect(warnings.map((w) => w.kind)).toEqual(["released_with_balance"]);
  });

  it("is quiet about a settled, released ticket", () => {
    const settled = ticketTotals({
      lines: [line()],
      payments: [payment({ amountCentavos: parsePesos("500") })],
    });
    expect(
      ticketWarnings({
        status: "released",
        promisedOn: "2026-01-01",
        readyOn: "2026-01-01",
        today,
        unclaimedAfterDays: 30,
        totals: settled,
      }),
    ).toEqual([]);
  });
});

describe("formatTicketNumber", () => {
  it("writes the date and the count for the day", () => {
    expect(
      formatTicketNumber({ year: 2026, month: 9, day: 18, sequence: 3 }),
    ).toBe("T-260918-003");
  });
});

describe("plain language", () => {
  const today = "2026-09-18";
  const totals = ticketTotals({ lines: [line()], payments: [] });

  it("says one day, not 1 days", () => {
    const soon = ticketWarnings({
      status: "repairing",
      promisedOn: "2026-09-19",
      readyOn: null,
      today,
      unclaimedAfterDays: 30,
      totals,
    });
    expect(soon.find((w) => w.kind === "due_soon")?.label).toBe(
      "Promised in 1 day",
    );

    const late = ticketWarnings({
      status: "repairing",
      promisedOn: "2026-09-17",
      readyOn: null,
      today,
      unclaimedAfterDays: 30,
      totals,
    });
    expect(late[0].label).toBe("1 day past the promised date");
  });
});
