import { describe, expect, it } from "vitest";

import { centavosToDecimalString, formatPesos, parsePesos } from "./money";
import {
  DEFAULT_TARPAULIN_RATE,
  PosError,
  TARPAULIN_RATES,
  computeCashPayment,
  computeSale,
  formatSaleNumber,
  parseTarpaulinRate,
  quoteTarpaulin,
  totalsByDivision,
  unitPriceFor,
  type SaleLineInput,
} from "./pos";

function line(overrides: Partial<SaleLineInput> = {}): SaleLineInput {
  return {
    name: "Print, black & white",
    quantity: 1,
    unitPriceCentavos: parsePesos("3"),
    division: "printshoppe",
    ...overrides,
  };
}

describe("quoteTarpaulin", () => {
  it("works out a plain 3 x 5 banner", () => {
    const quote = quoteTarpaulin({ widthFeet: 3, heightFeet: 5 });
    expect(quote.areaSquareFeet).toBe(15);
    expect(quote.ratePerSquareFootCentavos).toBe(DEFAULT_TARPAULIN_RATE);
    // 15 sq ft at PHP 30 = PHP 450
    expect(quote.totalCentavos).toBe(parsePesos("450"));
    expect(quote.description).toBe(
      "Tarpaulin 3 × 5 ft — 15 sq ft × 30.00",
    );
  });

  it("handles decimal feet", () => {
    const quote = quoteTarpaulin({ widthFeet: 2.5, heightFeet: 4 });
    expect(quote.areaSquareFeet).toBe(10);
    expect(quote.totalCentavos).toBe(parsePesos("300"));
    expect(quote.description).toContain("2.5 × 4 ft");
  });

  it("rounds only the peso total, never the area", () => {
    // 2.75 x 4.5 = 12.375 sq ft. Rounding the AREA to 12.38 would overcharge;
    // rounding it to 12 would lose PHP 11.25 on one banner.
    const quote = quoteTarpaulin({ widthFeet: 2.75, heightFeet: 4.5 });
    expect(quote.areaSquareFeet).toBeCloseTo(12.375, 10);
    // 12.375 x PHP 30 = PHP 371.25 exactly
    expect(quote.totalCentavos).toBe(parsePesos("371.25"));
  });

  it("uses whichever rate is chosen", () => {
    for (const [rate, expected] of [
      [3000, "450"],
      [2500, "375"],
      [2000, "300"],
      [1500, "225"],
    ] as const) {
      const quote = quoteTarpaulin({
        widthFeet: 3,
        heightFeet: 5,
        ratePerSquareFootCentavos: rate,
      });
      expect(quote.totalCentavos, `rate ${rate}`).toBe(parsePesos(expected));
    }
  });

  it("prices a job at a rate that is not one of the presets", () => {
    // PHP 27.50 agreed on the phone: 15 sq ft x 27.50 = PHP 412.50, and the
    // description has to carry the rate that was actually agreed, because that
    // line is what the customer reads off the receipt.
    const quote = quoteTarpaulin({
      widthFeet: 3,
      heightFeet: 5,
      ratePerSquareFootCentavos: parseTarpaulinRate("27.50"),
    });
    expect(quote.totalCentavos).toBe(parsePesos("412.50"));
    expect(quote.description).toBe("Tarpaulin 3 × 5 ft — 15 sq ft × 27.50");
  });

  it("always gives a whole number of centavos", () => {
    for (const width of [1.1, 2.33, 3.7, 5.05]) {
      for (const height of [1.1, 2.9, 4.25]) {
        const quote = quoteTarpaulin({ widthFeet: width, heightFeet: height });
        expect(Number.isInteger(quote.totalCentavos)).toBe(true);
      }
    }
  });

  it("refuses measurements that cannot be right", () => {
    expect(() => quoteTarpaulin({ widthFeet: 0, heightFeet: 5 })).toThrow(PosError);
    expect(() => quoteTarpaulin({ widthFeet: -3, heightFeet: 5 })).toThrow(PosError);
    expect(() => quoteTarpaulin({ widthFeet: 3, heightFeet: 0 })).toThrow(PosError);
    expect(() => quoteTarpaulin({ widthFeet: 5000, heightFeet: 5 })).toThrow(PosError);
    expect(() => quoteTarpaulin({ widthFeet: Number.NaN, heightFeet: 5 })).toThrow(PosError);
  });
});

describe("parseTarpaulinRate", () => {
  it("reads a typed rate to the centavo", () => {
    expect(parseTarpaulinRate("30")).toBe(parsePesos("30"));
    expect(parseTarpaulinRate("27.50")).toBe(parsePesos("27.50"));
    expect(parseTarpaulinRate("27.5")).toBe(parsePesos("27.50"));
    // Someone typing a big rate out of habit, with a separator in it.
    expect(parseTarpaulinRate("1,250.75")).toBe(parsePesos("1250.75"));
    expect(parseTarpaulinRate(" 30 ")).toBe(parsePesos("30"));
  });

  it("agrees with the presets, so a typed 30 is the same sale as a chosen 30", () => {
    for (const preset of TARPAULIN_RATES) {
      expect(parseTarpaulinRate(centavosToDecimalString(preset))).toBe(preset);
    }
  });

  it("refuses an amount that is not money", () => {
    for (const bad of ["", " ", "abc", "30.555", "3o", "12.5.5"]) {
      expect(() => parseTarpaulinRate(bad), bad).toThrow(PosError);
    }
  });

  it("refuses a rate of zero or less", () => {
    // A free tarpaulin is not a rate the counter can have typed on purpose, and
    // a negative one would hand money back on a sale.
    expect(() => parseTarpaulinRate("0")).toThrow(PosError);
    expect(() => parseTarpaulinRate("0.00")).toThrow(PosError);
    expect(() => parseTarpaulinRate("-30")).toThrow(PosError);
  });

  it("never returns a fraction of a centavo", () => {
    for (const input of ["1", "0.01", "27.5", "999.99"]) {
      expect(Number.isInteger(parseTarpaulinRate(input)), input).toBe(true);
    }
  });
});

describe("unitPriceFor", () => {
  const base = parsePesos("3");

  it("uses the normal price when there are no bulk rules", () => {
    // Which is the state the shop starts in: the owner has not given the rules.
    expect(unitPriceFor(base, 1)).toBe(base);
    expect(unitPriceFor(base, 500)).toBe(base);
  });

  it("applies the tier the quantity reaches", () => {
    const tiers = [
      { minQuantity: 50, unitPriceCentavos: parsePesos("2.50") },
      { minQuantity: 100, unitPriceCentavos: parsePesos("2") },
    ];

    expect(unitPriceFor(base, 49, tiers)).toBe(parsePesos("3"));
    expect(unitPriceFor(base, 50, tiers)).toBe(parsePesos("2.50"));
    expect(unitPriceFor(base, 99, tiers)).toBe(parsePesos("2.50"));
    expect(unitPriceFor(base, 100, tiers)).toBe(parsePesos("2"));
    expect(unitPriceFor(base, 1000, tiers)).toBe(parsePesos("2"));
  });

  it("does not care what order the rules are written in", () => {
    const ordered = [
      { minQuantity: 50, unitPriceCentavos: parsePesos("2.50") },
      { minQuantity: 100, unitPriceCentavos: parsePesos("2") },
    ];
    const jumbled = [...ordered].reverse();
    expect(unitPriceFor(base, 120, jumbled)).toBe(unitPriceFor(base, 120, ordered));
  });

  it("refuses an impossible quantity", () => {
    expect(() => unitPriceFor(base, 0)).toThrow(PosError);
    expect(() => unitPriceFor(base, 1.5)).toThrow(PosError);
  });
});

describe("computeSale", () => {
  it("adds up a plain sale", () => {
    const totals = computeSale({
      lines: [
        line({ name: "Print, black & white", quantity: 12, unitPriceCentavos: parsePesos("3") }),
        line({ name: "Photocopy", quantity: 5, unitPriceCentavos: parsePesos("3") }),
      ],
    });

    expect(totals.subtotalCentavos).toBe(parsePesos("51"));
    expect(totals.discountCentavos).toBe(0);
    expect(totals.totalCentavos).toBe(parsePesos("51"));
    expect(totals.itemCount).toBe(17);
  });

  it("starts at zero for an empty sale", () => {
    // Spec 6: a sale always starts blank.
    const totals = computeSale({ lines: [] });
    expect(totals.subtotalCentavos).toBe(0);
    expect(totals.totalCentavos).toBe(0);
    expect(totals.itemCount).toBe(0);
  });

  it("takes a peso discount off the whole sale", () => {
    const totals = computeSale({
      lines: [line({ quantity: 100, unitPriceCentavos: parsePesos("3") })],
      discount: { kind: "amount", centavos: parsePesos("50") },
    });
    expect(totals.subtotalCentavos).toBe(parsePesos("300"));
    expect(totals.discountCentavos).toBe(parsePesos("50"));
    expect(totals.totalCentavos).toBe(parsePesos("250"));
  });

  it("takes a percentage off the whole sale", () => {
    const totals = computeSale({
      lines: [line({ quantity: 100, unitPriceCentavos: parsePesos("3") })],
      discount: { kind: "percent", percent: 10 },
    });
    expect(totals.discountCentavos).toBe(parsePesos("30"));
    expect(totals.totalCentavos).toBe(parsePesos("270"));
  });

  it("never lets a discount push a sale below zero", () => {
    const totals = computeSale({
      lines: [line({ quantity: 1, unitPriceCentavos: parsePesos("3") })],
      discount: { kind: "amount", centavos: parsePesos("500") },
    });
    expect(totals.discountCentavos).toBe(parsePesos("3"));
    expect(totals.totalCentavos).toBe(0);
  });

  it("keeps every line's own division, even in one mixed sale", () => {
    // Spec 6: one sale may contain items from different divisions.
    const totals = computeSale({
      lines: [
        line({ name: "Photocopy", division: "printshoppe", quantity: 10, unitPriceCentavos: parsePesos("3") }),
        line({ name: "DTF print", division: "apparel", quantity: 1, unitPriceCentavos: parsePesos("250") }),
        line({ name: "Checking fee", division: "dabztech", quantity: 1, unitPriceCentavos: parsePesos("200") }),
      ],
    });

    expect(totals.subtotalCentavos).toBe(parsePesos("480"));
    expect(totals.lines.map((entry) => entry.division)).toEqual([
      "printshoppe",
      "apparel",
      "dabztech",
    ]);
  });
});

describe("totalsByDivision", () => {
  it("splits a mixed sale between the three divisions", () => {
    const totals = computeSale({
      lines: [
        line({ division: "printshoppe", quantity: 10, unitPriceCentavos: parsePesos("3") }),
        line({ division: "apparel", quantity: 1, unitPriceCentavos: parsePesos("250") }),
        line({ division: "dabztech", quantity: 1, unitPriceCentavos: parsePesos("200") }),
      ],
    });

    expect(totalsByDivision(totals)).toEqual({
      printshoppe: parsePesos("30"),
      apparel: parsePesos("250"),
      dabztech: parsePesos("200"),
    });
  });

  it("shares a discount across the divisions in proportion", () => {
    const totals = computeSale({
      lines: [
        line({ division: "printshoppe", quantity: 1, unitPriceCentavos: parsePesos("300") }),
        line({ division: "apparel", quantity: 1, unitPriceCentavos: parsePesos("100") }),
      ],
      discount: { kind: "amount", centavos: parsePesos("40") },
    });

    // Printshoppe is 3/4 of the sale so it carries PHP 30 of the discount;
    // apparel is 1/4 and carries PHP 10. The two still add up to the PHP 360
    // the customer actually paid.
    const split = totalsByDivision(totals);
    expect(split).toEqual({
      printshoppe: parsePesos("270"),
      apparel: parsePesos("90"),
      dabztech: 0,
    });
    expect(split.printshoppe + split.apparel).toBe(totals.totalCentavos);
  });

  it("never loses or invents a centavo when a discount does not divide evenly", () => {
    // This is the case that would otherwise leave a one-centavo hole in the
    // daily figures, every time an odd discount is given on a mixed sale.
    for (const discount of [1, 7, 33, 99, 101, 1234]) {
      const totals = computeSale({
        lines: [
          line({ division: "printshoppe", quantity: 3, unitPriceCentavos: 3333 }),
          line({ division: "apparel", quantity: 1, unitPriceCentavos: 7777 }),
          line({ division: "dabztech", quantity: 2, unitPriceCentavos: 1111 }),
        ],
        discount: { kind: "amount", centavos: discount },
      });

      const split = totalsByDivision(totals);
      const sum = split.printshoppe + split.apparel + split.dabztech;

      expect(sum, `discount ${discount}`).toBe(totals.totalCentavos);
      for (const value of Object.values(split)) {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it("adds back up to the total for a percentage discount too", () => {
    for (const percent of [5, 10, 12.5, 33.3]) {
      const totals = computeSale({
        lines: [
          line({ division: "printshoppe", quantity: 7, unitPriceCentavos: 499 }),
          line({ division: "apparel", quantity: 3, unitPriceCentavos: 12345 }),
        ],
        discount: { kind: "percent", percent },
      });

      const split = totalsByDivision(totals);
      expect(
        split.printshoppe + split.apparel + split.dabztech,
        `${percent}%`,
      ).toBe(totals.totalCentavos);
    }
  });
});

describe("computeCashPayment", () => {
  it("works out the change", () => {
    const totals = computeSale({
      lines: [line({ quantity: 12, unitPriceCentavos: parsePesos("3") })],
    });
    const payment = computeCashPayment(totals.totalCentavos, parsePesos("50"));
    expect(payment.changeCentavos).toBe(parsePesos("14"));
    expect(formatPesos(payment.changeCentavos)).toBe("₱14.00");
  });

  it("refuses short payment rather than showing negative change", () => {
    expect(() => computeCashPayment(parsePesos("100"), parsePesos("50"))).toThrow();
  });

  it("handles exact money", () => {
    expect(computeCashPayment(parsePesos("36"), parsePesos("36")).changeCentavos).toBe(0);
  });
});

describe("formatSaleNumber", () => {
  it("puts the date in the number, so a receipt is easy to find", () => {
    expect(formatSaleNumber({ year: 2026, month: 9, day: 18, sequence: 7 })).toBe(
      "S-260918-007",
    );
    expect(formatSaleNumber({ year: 2026, month: 12, day: 1, sequence: 123 })).toBe(
      "S-261201-123",
    );
  });

  it("keeps sorting correctly past 999 sales in a day", () => {
    expect(formatSaleNumber({ year: 2026, month: 9, day: 18, sequence: 1000 })).toBe(
      "S-260918-1000",
    );
  });
});

describe("a whole counter sale, end to end", () => {
  it("matches what the staff would add up by hand", () => {
    // 12 b&w pages at PHP 3, 3 colour at PHP 15, one 3x5 tarpaulin.
    const tarpaulin = quoteTarpaulin({ widthFeet: 3, heightFeet: 5 });

    const totals = computeSale({
      lines: [
        line({ name: "Print, black & white", quantity: 12, unitPriceCentavos: parsePesos("3") }),
        line({ name: "Print, colored", quantity: 3, unitPriceCentavos: parsePesos("15") }),
        line({
          name: tarpaulin.description,
          quantity: 1,
          unitPriceCentavos: tarpaulin.totalCentavos,
        }),
      ],
      discount: { kind: "percent", percent: 10 },
    });

    expect(totals.subtotalCentavos).toBe(parsePesos("531"));
    expect(totals.discountCentavos).toBe(parsePesos("53.10"));
    expect(totals.totalCentavos).toBe(parsePesos("477.90"));

    const payment = computeCashPayment(totals.totalCentavos, parsePesos("500"));
    expect(payment.changeCentavos).toBe(parsePesos("22.10"));
  });
});
