import { describe, expect, it } from "vitest";

import {
  balanceLabel,
  lineTotalLabel,
  orderTotals,
  splitQuoteByPieces,
  summaryAwaitingQuote,
  summaryTotalLabel,
  totalLabel,
} from "./totals";

const fixed = (unit: number, qty: number) => ({
  pricingMode: "fixed" as const,
  unitPriceCentavos: unit,
  qty,
});

const quote = (qty: number) => ({
  pricingMode: "quote" as const,
  unitPriceCentavos: null,
  qty,
});

describe("orderTotals", () => {
  it("adds up the fixed lines", () => {
    const totals = orderTotals([fixed(45000, 6), fixed(22000, 2)], null);
    expect(totals.fixedTotalCentavos).toBe(314000);
    expect(totals.totalCentavos).toBe(314000);
    expect(totals.pieces).toBe(8);
    expect(totals.awaitingQuote).toBe(false);
  });

  it("does not count a quote item as zero", () => {
    /*
      The rule the module exists for. An unpriced jacket has NO price, and an
      order that printed PHP 2,700 while a jacket sat in it unpriced would be a
      bill for the wrong amount.
    */
    const totals = orderTotals([fixed(45000, 6), quote(1)], null);
    expect(totals.fixedTotalCentavos).toBe(270000);
    expect(totals.totalCentavos).toBe(270000);
    expect(totals.hasQuoteItems).toBe(true);
    expect(totals.awaitingQuote).toBe(true);
    expect(totalLabel(totals)).toBe("₱2,700.00 + quote");
    expect(balanceLabel(totals)).toBeNull();
  });

  it("says To be quoted when nothing in the order has a price", () => {
    const totals = orderTotals([quote(2)], null);
    expect(totalLabel(totals)).toBe("To be quoted");
    expect(balanceLabel(totals)).toBeNull();
  });

  it("adds the quote in once it is given, and the balance appears", () => {
    const totals = orderTotals([fixed(45000, 6), quote(1)], 800000, [
      { amountCentavos: 500000, voidedAt: null },
    ]);
    expect(totals.totalCentavos).toBe(1070000);
    expect(totals.paidCentavos).toBe(500000);
    expect(totals.balanceCentavos).toBe(570000);
    expect(totalLabel(totals)).toBe("₱10,700.00");
    expect(balanceLabel(totals)).toBe("₱5,700.00");
  });

  it("skips a voided payment, or the order would show money that was handed back", () => {
    const totals = orderTotals([fixed(10000, 1)], null, [
      { amountCentavos: 5000, voidedAt: null },
      { amountCentavos: 5000, voidedAt: "2026-09-20T02:00:00Z" },
    ]);
    expect(totals.paidCentavos).toBe(5000);
    expect(totals.balanceCentavos).toBe(5000);
  });

  it("lets a balance go negative rather than hiding an overpayment", () => {
    const totals = orderTotals([fixed(10000, 1)], null, [
      { amountCentavos: 12000, voidedAt: null },
    ]);
    expect(totals.balanceCentavos).toBe(-2000);
  });
});

describe("lineTotalLabel", () => {
  it("prices a fixed line", () => {
    expect(lineTotalLabel(fixed(45000, 6))).toBe("₱2,700.00");
  });

  it("says a quote line is still to be quoted", () => {
    expect(lineTotalLabel(quote(6))).toBe("To be quoted");
  });
});

describe("splitQuoteByPieces", () => {
  it("shares a quote in proportion to the pieces", () => {
    expect(
      splitQuoteByPieces(90000, [
        { key: "a", pieces: 2 },
        { key: "b", pieces: 1 },
      ]),
    ).toEqual([
      { key: "a", centavos: 60000 },
      { key: "b", centavos: 30000 },
    ]);
  });

  it("adds back up to the quote exactly, whatever the rounding", () => {
    /*
      The reason the remainder is handed out rather than each share rounded on
      its own: three equal shares of PHP 100.00 are 3333.33 each, and rounding
      each one leaves a centavo unaccounted for in every report that adds the
      shares up.
    */
    const shares = splitQuoteByPieces(10000, [
      { key: "a", pieces: 1 },
      { key: "b", pieces: 1 },
      { key: "c", pieces: 1 },
    ]);
    expect(shares.reduce((total, share) => total + share.centavos, 0)).toBe(10000);
    expect(shares.map((s) => s.centavos).sort()).toEqual([3333, 3333, 3334]);
  });

  it("gives the whole quote to one line rather than losing it when nothing has pieces", () => {
    const shares = splitQuoteByPieces(5000, [
      { key: "a", pieces: 0 },
      { key: "b", pieces: 0 },
    ]);
    expect(shares.reduce((total, share) => total + share.centavos, 0)).toBe(5000);
  });

  it("has nothing to share when there are no quote lines", () => {
    expect(splitQuoteByPieces(5000, [])).toEqual([]);
  });

  it("gives the same answer every time it is asked", () => {
    const lines = [
      { key: "a", pieces: 7 },
      { key: "b", pieces: 7 },
      { key: "c", pieces: 1 },
    ];
    expect(splitQuoteByPieces(100001, lines)).toEqual(splitQuoteByPieces(100001, lines));
  });
});

describe("summaryTotalLabel", () => {
  const row = (over: Partial<Parameters<typeof summaryTotalLabel>[0]> = {}) => ({
    hasQuoteItems: false,
    quoteAmountCentavos: null,
    fixedTotalCentavos: 270000,
    totalCentavos: 270000,
    ...over,
  });

  it("prints a priced order's total", () => {
    expect(summaryTotalLabel(row())).toBe("₱2,700.00");
  });

  it("says there is no quote yet when there is nothing else to say", () => {
    expect(
      summaryTotalLabel(
        row({ hasQuoteItems: true, fixedTotalCentavos: 0, totalCentavos: 0 }),
      ),
    ).toBe("No quote yet");
  });

  it("says both halves when part of the order is priced", () => {
    expect(summaryTotalLabel(row({ hasQuoteItems: true }))).toBe("₱2,700.00 + quote");
  });

  it("prints the whole total once the quote is in", () => {
    expect(
      summaryTotalLabel(
        row({ hasQuoteItems: true, quoteAmountCentavos: 800000, totalCentavos: 1070000 }),
      ),
    ).toBe("₱10,700.00");
  });
});

describe("summaryAwaitingQuote", () => {
  it("is true only while a quote item has no figure against it", () => {
    expect(
      summaryAwaitingQuote({ hasQuoteItems: true, quoteAmountCentavos: null }),
    ).toBe(true);
    expect(
      summaryAwaitingQuote({ hasQuoteItems: true, quoteAmountCentavos: 0 }),
    ).toBe(false);
    expect(
      summaryAwaitingQuote({ hasQuoteItems: false, quoteAmountCentavos: null }),
    ).toBe(false);
  });
});
