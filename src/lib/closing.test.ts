import { describe, expect, it } from "vitest";

import { computeClosing } from "./closing";
import { parsePesos } from "./money";

const base = {
  cashSalesCentavos: parsePesos("5000"),
  cashPaidOutCentavos: parsePesos("500"),
  countedCashCentavos: parsePesos("4500"),
  gcashCentavos: parsePesos("1200"),
  mayaCentavos: 0,
  bankCentavos: 0,
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
