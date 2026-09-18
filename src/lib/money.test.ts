import { describe, expect, it } from "vitest";
import {
  MoneyError,
  applyAmountDiscount,
  applyPercentDiscount,
  centavosToDecimalString,
  computeChange,
  formatPesos,
  lineTotal,
  parsePesos,
  sumCentavos,
} from "./money";

describe("parsePesos", () => {
  it("reads the ways staff actually type amounts", () => {
    expect(parsePesos("12.50")).toBe(1250);
    expect(parsePesos("12.5")).toBe(1250);
    expect(parsePesos("12")).toBe(1200);
    expect(parsePesos(" 45 ")).toBe(4500);
    expect(parsePesos("1,234.50")).toBe(123450);
    expect(parsePesos("0.05")).toBe(5);
    expect(parsePesos(3)).toBe(300);
    expect(parsePesos("141127")).toBe(14112700);
  });

  it("refuses to guess at typos instead of rounding them away", () => {
    expect(() => parsePesos("12.555")).toThrow(MoneyError);
    expect(() => parsePesos("")).toThrow(MoneyError);
    expect(() => parsePesos("abc")).toThrow(MoneyError);
    expect(() => parsePesos("12.5.5")).toThrow(MoneyError);
    expect(() => parsePesos("PHP 12")).toThrow(MoneyError);
  });
});

describe("formatting", () => {
  it("shows centavos with two digits", () => {
    expect(formatPesos(1250)).toBe("₱12.50");
    expect(formatPesos(300)).toBe("₱3.00");
    expect(formatPesos(5)).toBe("₱0.05");
    expect(formatPesos(0)).toBe("₱0.00");
  });

  it("groups thousands the way a peso amount is written", () => {
    expect(formatPesos(14112700)).toBe("₱141,127.00");
    expect(formatPesos(133626400)).toBe("₱1,336,264.00");
  });

  it("keeps negatives readable for corrections and voids", () => {
    expect(formatPesos(-1250)).toBe("-₱12.50");
    expect(centavosToDecimalString(-1250)).toBe("-12.50");
  });

  it("can drop the peso sign for input boxes", () => {
    expect(formatPesos(1250, { withSign: false })).toBe("12.50");
    expect(centavosToDecimalString(1250)).toBe("12.50");
  });

  it("round-trips through parsing without drifting", () => {
    for (const amount of [0, 5, 99, 300, 1250, 14112700, 133626400]) {
      expect(parsePesos(centavosToDecimalString(amount))).toBe(amount);
    }
  });
});

describe("sumCentavos", () => {
  it("adds without the decimal drift that breaks cash counts", () => {
    // 0.1 + 0.2 in decimals is 0.30000000000000004; in centavos it is exact.
    expect(sumCentavos([10, 20])).toBe(30);
    // A realistic printing sale: 3 pages b&w, 2 colored at 8, one photocopy.
    expect(sumCentavos([900, 1600, 300])).toBe(2800);
    expect(sumCentavos([])).toBe(0);
  });

  it("stays exact over a long day of sales", () => {
    const threePesoSales = Array.from({ length: 1000 }, () => 310);
    expect(sumCentavos(threePesoSales)).toBe(310000);
  });

  it("rejects a decimal amount that slipped through", () => {
    expect(() => sumCentavos([10, 20.5])).toThrow(MoneyError);
  });
});

describe("lineTotal", () => {
  it("multiplies unit price by quantity", () => {
    expect(lineTotal(300, 12)).toBe(3600); // 12 b&w pages at PHP 3
    expect(lineTotal(1500, 3)).toBe(4500); // 3 colored pages at PHP 15
    expect(lineTotal(300, 1)).toBe(300);
  });

  it("rejects quantities that cannot be sold", () => {
    expect(() => lineTotal(300, 0)).toThrow(MoneyError);
    expect(() => lineTotal(300, -2)).toThrow(MoneyError);
    expect(() => lineTotal(300, 1.5)).toThrow(MoneyError);
    expect(() => lineTotal(-300, 2)).toThrow(MoneyError);
  });
});

describe("applyAmountDiscount", () => {
  it("subtracts a peso discount", () => {
    expect(applyAmountDiscount(10000, 1000)).toEqual({
      discount: 1000,
      total: 9000,
    });
  });

  it("never lets a sale go below zero", () => {
    expect(applyAmountDiscount(5000, 8000)).toEqual({
      discount: 5000,
      total: 0,
    });
  });

  it("handles a zero discount", () => {
    expect(applyAmountDiscount(5000, 0)).toEqual({ discount: 0, total: 5000 });
  });

  it("rejects negative inputs", () => {
    expect(() => applyAmountDiscount(-1, 0)).toThrow(MoneyError);
    expect(() => applyAmountDiscount(100, -1)).toThrow(MoneyError);
  });
});

describe("applyPercentDiscount", () => {
  it("takes a percentage off the whole sale", () => {
    expect(applyPercentDiscount(10000, 10)).toEqual({
      discount: 1000,
      total: 9000,
    });
    expect(applyPercentDiscount(10000, 0)).toEqual({
      discount: 0,
      total: 10000,
    });
    expect(applyPercentDiscount(10000, 100)).toEqual({
      discount: 10000,
      total: 0,
    });
  });

  it("rounds to the nearest centavo", () => {
    // 10% of PHP 33.33 is PHP 3.333 -> PHP 3.33
    expect(applyPercentDiscount(3333, 10)).toEqual({
      discount: 333,
      total: 3000,
    });
    // 10% of PHP 33.35 is PHP 3.335 -> PHP 3.34 (rounds up at the half)
    expect(applyPercentDiscount(3335, 10)).toEqual({
      discount: 334,
      total: 3001,
    });
    // A fractional percent still lands on a whole centavo.
    expect(applyPercentDiscount(3333, 12.5).discount).toBe(417);
  });

  it("always returns whole centavos", () => {
    for (let subtotal = 1; subtotal <= 500; subtotal += 7) {
      for (const percent of [3, 7, 10, 12.5, 15, 33.3]) {
        const { discount, total } = applyPercentDiscount(subtotal, percent);
        expect(Number.isInteger(discount)).toBe(true);
        expect(Number.isInteger(total)).toBe(true);
        expect(discount + total).toBe(subtotal);
      }
    }
  });

  it("rejects impossible percentages", () => {
    expect(() => applyPercentDiscount(10000, -5)).toThrow(MoneyError);
    expect(() => applyPercentDiscount(10000, 150)).toThrow(MoneyError);
  });
});

describe("computeChange", () => {
  it("computes change for a cash sale", () => {
    expect(computeChange(2800, 5000)).toBe(2200);
    expect(computeChange(2800, 2800)).toBe(0);
    expect(computeChange(0, 0)).toBe(0);
  });

  it("refuses short payment instead of showing negative change", () => {
    expect(() => computeChange(2800, 2000)).toThrow(MoneyError);
    expect(() => computeChange(2800, 2000)).toThrow(
      /less than the total/,
    );
  });

  it("rejects negative inputs", () => {
    expect(() => computeChange(-1, 100)).toThrow(MoneyError);
    expect(() => computeChange(100, -1)).toThrow(MoneyError);
  });
});

describe("a whole sale, end to end", () => {
  it("adds up a mixed Printshoppe sale with a discount and change", () => {
    // 12 b&w pages at PHP 3, 3 colored at PHP 15, 1 tarpaulin 3x5ft at PHP 30/sqft
    const lines = [
      lineTotal(parsePesos("3"), 12),
      lineTotal(parsePesos("15"), 3),
      lineTotal(parsePesos("450"), 1),
    ];
    const subtotal = sumCentavos(lines);
    expect(subtotal).toBe(53100); // PHP 531.00

    const { discount, total } = applyPercentDiscount(subtotal, 10);
    expect(discount).toBe(5310);
    expect(total).toBe(47790); // PHP 477.90

    const change = computeChange(total, parsePesos("500"));
    expect(change).toBe(2210); // PHP 22.10
    expect(formatPesos(change)).toBe("₱22.10");
  });
});
