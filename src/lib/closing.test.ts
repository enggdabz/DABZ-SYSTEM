import { describe, expect, it } from "vitest";

import { computeClosing } from "./closing";
import { breakdownCollections, type CollectionRow } from "./collections";
import { parsePesos, sumCentavos } from "./money";

const base = {
  cashSalesCentavos: parsePesos("5000"),
  cashPaidOutCentavos: parsePesos("500"),
  countedCashCentavos: parsePesos("4500"),
  gcashCentavos: parsePesos("1200"),
  mayaCentavos: 0,
  bankCentavos: 0,
  ownersPocketCentavos: 0,
  targetCentavos: parsePesos("5427.97"),
};

describe("computeClosing", () => {
  it("expects cash sales less what was paid out of the drawer", () => {
    const result = computeClosing(base);
    expect(result.expectedCashCentavos).toBe(parsePesos("4500"));
    expect(result.differenceCentavos).toBe(0);
    expect(result.balanced).toBe(true);
  });

  it("shows a short drawer as a negative difference", () => {
    const result = computeClosing({
      ...base,
      countedCashCentavos: parsePesos("4300"),
    });
    expect(result.differenceCentavos).toBe(parsePesos("-200"));
    expect(result.short).toBe(true);
    expect(result.over).toBe(false);
    expect(result.balanced).toBe(false);
  });

  it("shows an over drawer as a positive difference", () => {
    const result = computeClosing({
      ...base,
      countedCashCentavos: parsePesos("4650"),
    });
    expect(result.differenceCentavos).toBe(parsePesos("150"));
    expect(result.over).toBe(true);
    expect(result.short).toBe(false);
  });

  it("counts every payment method in the day's sales", () => {
    const result = computeClosing({
      ...base,
      gcashCentavos: parsePesos("1200"),
      mayaCentavos: parsePesos("300"),
      bankCentavos: parsePesos("2000"),
    });
    // 5,000 cash + 1,200 GCash + 300 Maya + 2,000 bank
    expect(result.totalSalesCentavos).toBe(parsePesos("8500"));
  });

  it("says whether the day's target was reached", () => {
    expect(computeClosing(base).targetReached).toBe(true); // 6,200 of 5,427.97
    expect(
      computeClosing({ ...base, cashSalesCentavos: parsePesos("1000"), gcashCentavos: 0 })
        .targetReached,
    ).toBe(false);
  });

  /*
    A shop with no bills entered has a target of zero, and closing the day
    would otherwise write "target reached" into the permanent record of every
    one of those days - a row nobody would ever go back and correct. Zero means
    not known, so the answer is no.
  */
  it("does not record a day as reaching a target that was never set", () => {
    expect(computeClosing({ ...base, targetCentavos: 0 }).targetReached).toBe(false);
    expect(
      computeClosing({
        ...base,
        targetCentavos: 0,
        cashSalesCentavos: 0,
        gcashCentavos: 0,
        mayaCentavos: 0,
        bankCentavos: 0,
      }).targetReached,
    ).toBe(false);
  });

  it("handles a day where more left the drawer than came in", () => {
    // A quiet morning plus a cash advance: the drawer is legitimately negative
    // against the float, and the figure has to say so rather than clamp to zero.
    const result = computeClosing({
      ...base,
      cashSalesCentavos: parsePesos("200"),
      cashPaidOutCentavos: parsePesos("1500"),
      countedCashCentavos: 0,
    });
    expect(result.expectedCashCentavos).toBe(parsePesos("-1300"));
    expect(result.differenceCentavos).toBe(parsePesos("1300"));
  });

  it("handles a day with nothing at all", () => {
    const result = computeClosing({
      cashSalesCentavos: 0,
      cashPaidOutCentavos: 0,
      countedCashCentavos: 0,
      gcashCentavos: 0,
      mayaCentavos: 0,
      bankCentavos: 0,
      ownersPocketCentavos: 0,
      targetCentavos: parsePesos("5427.97"),
    });
    expect(result.balanced).toBe(true);
    expect(result.totalSalesCentavos).toBe(0);
    expect(result.targetReached).toBe(false);
  });

  it("always works in whole centavos", () => {
    const result = computeClosing({
      ...base,
      cashSalesCentavos: parsePesos("4999.99"),
      cashPaidOutCentavos: parsePesos("499.99"),
      countedCashCentavos: parsePesos("4500.01"),
    });
    for (const value of [
      result.expectedCashCentavos,
      result.differenceCentavos,
      result.totalSalesCentavos,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(result.differenceCentavos).toBe(parsePesos("0.01"));
  });
});

// ---------------------------------------------------------------------------
// The owner's pocket (Phase 10)
// ---------------------------------------------------------------------------

describe("takings that never reached the drawer", () => {
  it("counts them in the day's total, because the shop did collect them", () => {
    const result = computeClosing({
      ...base,
      ownersPocketCentavos: parsePesos("400"),
    });
    // 5,000 cash + 1,200 GCash + 400 to the owner.
    expect(result.totalSalesCentavos).toBe(parsePesos("6600"));
  });

  it("leaves them out of the drawer, so an honest drawer never reads as short", () => {
    const withPocket = computeClosing({
      ...base,
      ownersPocketCentavos: parsePesos("400"),
    });
    const without = computeClosing(base);

    expect(withPocket.expectedCashCentavos).toBe(without.expectedCashCentavos);
    expect(withPocket.differenceCentavos).toBe(without.differenceCentavos);
    expect(withPocket.balanced).toBe(true);
  });

  it("can be the only thing that carries a day past its target", () => {
    const quiet = { ...base, cashSalesCentavos: parsePesos("5000"), gcashCentavos: 0 };
    // 5,000 on its own is short of the 5,427.97 target.
    expect(computeClosing(quiet).targetReached).toBe(false);
    expect(
      computeClosing({ ...quiet, ownersPocketCentavos: parsePesos("500") })
        .targetReached,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The breakdown's bottom row has to be the day (spec 3.3)
// ---------------------------------------------------------------------------

/**
 * The per-division table and `readDayTotals` are two readings of the same day
 * - the feed and the ledger - and the screen puts them one above the other. If
 * they ever part company, one of them is lying to whoever is counting the
 * drawer, so the shapes are pinned together here as well as in SQL.
 */
describe("the end-of-day breakdown against the day's totals", () => {
  function row(over: Partial<CollectionRow>): CollectionRow {
    return {
      id: over.id ?? "r",
      kind: over.kind ?? "counter_sale",
      division: over.division ?? "printshoppe",
      paymentKind: over.paymentKind === undefined ? "sale" : over.paymentKind,
      reference: over.reference ?? "S-260921-001",
      customerName: null,
      amountCentavos: over.amountCentavos ?? 0,
      source: over.source ?? "cash_drawer",
      referenceNumber: null,
      takenAt: "2026-09-21T02:00:00.000Z",
      recordedForISO: "2026-09-21",
      takenBy: null,
      voidedAt: over.voidedAt ?? null,
      href: "/sales",
    };
  }

  const rows: CollectionRow[] = [
    row({ id: "a", amountCentavos: parsePesos("5000"), source: "cash_drawer" }),
    row({
      id: "b",
      kind: "apparel_payment",
      division: "apparel",
      paymentKind: "down_payment",
      amountCentavos: parsePesos("1200"),
      source: "gcash",
    }),
    row({
      id: "c",
      kind: "repair_payment",
      division: "dabztech",
      paymentKind: "balance",
      amountCentavos: parsePesos("400"),
      source: "owners_pocket",
    }),
    // Voided, so it must appear in neither reading.
    row({
      id: "d",
      kind: "apparel_payment",
      division: "apparel",
      paymentKind: "balance",
      amountCentavos: parsePesos("9999"),
      source: "bank",
      voidedAt: "2026-09-21T06:00:00.000Z",
    }),
  ];

  const breakdown = breakdownCollections(rows);

  /* What `readDayTotals` would return for the same day, read from the ledger
     those four rows wrote to. Cash paid out is a ledger-only idea and plays no
     part in either total. */
  const dayTotals = {
    cashSalesCentavos: parsePesos("5000"),
    cashPaidOutCentavos: parsePesos("500"),
    countedCashCentavos: parsePesos("4500"),
    gcashCentavos: parsePesos("1200"),
    mayaCentavos: 0,
    bankCentavos: 0,
    ownersPocketCentavos: parsePesos("400"),
    targetCentavos: parsePesos("5427.97"),
  };

  it("matches the day's total, to the centavo", () => {
    expect(breakdown.totalCentavos).toBe(
      computeClosing(dayTotals).totalSalesCentavos,
    );
  });

  it("matches the day's figures method by method", () => {
    expect(breakdown.totalBySource.cash_drawer).toBe(dayTotals.cashSalesCentavos);
    expect(breakdown.totalBySource.gcash).toBe(dayTotals.gcashCentavos);
    expect(breakdown.totalBySource.maya).toBe(dayTotals.mayaCentavos);
    expect(breakdown.totalBySource.bank).toBe(dayTotals.bankCentavos);
    expect(breakdown.totalBySource.owners_pocket).toBe(
      dayTotals.ownersPocketCentavos,
    );
  });

  it("agrees that the voided apparel balance happened to neither of them", () => {
    expect(breakdown.voidedCentavos).toBe(parsePesos("9999"));
    expect(breakdown.totalBySource.bank).toBe(0);
    expect(
      sumCentavos(breakdown.divisions.map((entry) => entry.totalCentavos)),
    ).toBe(parsePesos("6600"));
  });
});
