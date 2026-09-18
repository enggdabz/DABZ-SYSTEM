import { describe, expect, it } from "vitest";

import {
  assertThousandths,
  costOfQuantity,
  formatQuantity,
  parseQuantity,
  quantityToDecimalString,
  QuantityError,
  sumQuantities,
} from "./quantity";
import { parsePesos } from "./money";

describe("parseQuantity", () => {
  it("reads whole units", () => {
    expect(parseQuantity("20")).toBe(20000);
    expect(parseQuantity(1)).toBe(1000);
  });

  it("reads decimals up to three places", () => {
    expect(parseQuantity("2.5")).toBe(2500);
    expect(parseQuantity("0.125")).toBe(125);
    expect(parseQuantity("0.001")).toBe(1);
  });

  it("strips thousands separators people type out of habit", () => {
    expect(parseQuantity("1,000")).toBe(1_000_000);
  });

  it("refuses a fourth decimal place rather than rounding it away", () => {
    expect(() => parseQuantity("0.1234")).toThrow(QuantityError);
  });

  it("refuses text and empty input", () => {
    expect(() => parseQuantity("two reams")).toThrow(QuantityError);
    expect(() => parseQuantity("")).toThrow(QuantityError);
    expect(() => parseQuantity(".")).toThrow(QuantityError);
  });

  it("reads a negative quantity, which a correction needs", () => {
    expect(parseQuantity("-2.5")).toBe(-2500);
  });
});

describe("quantityToDecimalString", () => {
  it("writes the shortest exact form", () => {
    expect(quantityToDecimalString(20000)).toBe("20");
    expect(quantityToDecimalString(2500)).toBe("2.5");
    expect(quantityToDecimalString(125)).toBe("0.125");
    expect(quantityToDecimalString(0)).toBe("0");
    expect(quantityToDecimalString(-2500)).toBe("-2.5");
  });

  it("survives a round trip", () => {
    for (const text of ["0", "1", "20", "2.5", "0.125", "1000.001"]) {
      expect(quantityToDecimalString(parseQuantity(text))).toBe(text);
    }
  });
});

describe("formatQuantity", () => {
  it("prints the unit exactly as the owner wrote it", () => {
    expect(formatQuantity(20000, "reams")).toBe("20 reams");
    // Not pluralised: "1 ream" and "20 ream" both read fine, and the plural of
    // "pack of 100" cannot be guessed.
    expect(formatQuantity(1000, "ream")).toBe("1 ream");
    expect(formatQuantity(2500, null)).toBe("2.5");
  });
});

describe("sumQuantities", () => {
  it("adds movements without drifting", () => {
    // The decimal version of this sum is 0.30000000000000004.
    expect(sumQuantities([100, 200])).toBe(300);
  });

  it("adds a hundred tenths back to exactly ten", () => {
    const tenths = Array.from({ length: 100 }, () => 100);
    expect(sumQuantities(tenths)).toBe(10_000);
  });

  it("nets deliveries against withdrawals", () => {
    expect(sumQuantities([20_000, -3_000, -2_500])).toBe(14_500);
  });

  it("refuses a decimal quantity", () => {
    expect(() => sumQuantities([0.5])).toThrow(QuantityError);
  });
});

describe("costOfQuantity", () => {
  it("multiplies a whole quantity by a unit cost", () => {
    // 20 reams at ₱120.00
    expect(costOfQuantity(20_000, parsePesos("120"))).toBe(parsePesos("2400"));
  });

  it("handles a fractional quantity", () => {
    // 2.5 litres at ₱850.00
    expect(costOfQuantity(2_500, parsePesos("850"))).toBe(parsePesos("2125"));
  });

  it("rounds to the nearest centavo rather than leaving a fraction", () => {
    // 0.333 of a ream at ₱120.00 is ₱39.96
    expect(costOfQuantity(333, parsePesos("120"))).toBe(parsePesos("39.96"));
    // 1.005 packs at ₱3.33 is ₱3.34665, which rounds to ₱3.35
    expect(costOfQuantity(1_005, parsePesos("3.33"))).toBe(parsePesos("3.35"));
  });

  it("rounds a half centavo away from zero, the way a person does by hand", () => {
    // 0.5 of a unit costing ₱0.01 is half a centavo.
    expect(costOfQuantity(500, 1)).toBe(1);
    expect(costOfQuantity(-500, 1)).toBe(-1);
  });

  it("returns whole centavos, never a fraction", () => {
    const cost = costOfQuantity(1_234, parsePesos("56.78"));
    expect(Number.isInteger(cost)).toBe(true);
  });

  it("costs nothing when the quantity is nothing", () => {
    expect(costOfQuantity(0, parsePesos("120"))).toBe(0);
  });
});

describe("assertThousandths", () => {
  it("refuses decimals, text and infinity", () => {
    expect(() => assertThousandths(1.5)).toThrow(QuantityError);
    expect(() => assertThousandths(Number.NaN)).toThrow(QuantityError);
    expect(() => assertThousandths(Number.POSITIVE_INFINITY)).toThrow(QuantityError);
  });
});
