/**
 * Stock quantities.
 *
 * WHY THIS FILE EXISTS
 * The same reason `money.ts` exists. A stock level is built by adding up every
 * delivery and every withdrawal ever recorded, and decimals drift when you add
 * them (0.1 + 0.2 is 0.30000000000000004). After a few hundred movements a
 * half-litre of ink would quietly become 0.4999999 and the low-stock warning
 * would fire on the wrong day.
 *
 * So a quantity is a WHOLE NUMBER OF THOUSANDTHS of its unit:
 *
 *     20 reams    ->  20000
 *     2.5 litres  ->  2500
 *     0.125 kg    ->  125
 *
 * Three decimal places is enough for anything a print shop measures and small
 * enough that a shop's whole history fits inside an exact integer.
 */

/** A whole number of thousandths of a unit. Never a decimal. */
export type Thousandths = number;

export const THOUSAND = 1000;

export class QuantityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuantityError";
  }
}

/** Rejects anything that is not a safe whole number of thousandths. */
export function assertThousandths(value: number, label = "quantity"): Thousandths {
  if (!Number.isFinite(value)) {
    throw new QuantityError(`${label} must be a number, got ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new QuantityError(
      `${label} must be whole thousandths (no decimals), got ${value}`,
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new QuantityError(`${label} is too large to be exact: ${value}`);
  }
  return value;
}

/**
 * Turns what a person types into thousandths.
 *
 * Accepts "20", "2.5", "0.125", "1,000" and plain numbers. Rejects more than
 * three decimals rather than rounding, because a typo should be corrected by
 * the person, not guessed at.
 */
export function parseQuantity(input: string | number): Thousandths {
  const raw = typeof input === "number" ? String(input) : input.trim();

  if (raw === "") throw new QuantityError("quantity is empty");

  const cleaned = raw.replace(/,/g, "");

  if (!/^-?\d*(\.\d*)?$/.test(cleaned) || cleaned === "." || cleaned === "-") {
    throw new QuantityError(`quantity is not a number: ${raw}`);
  }

  const negative = cleaned.startsWith("-");
  const body = negative ? cleaned.slice(1) : cleaned;
  const [whole, fraction = ""] = body.split(".");

  if (fraction.length > 3) {
    throw new QuantityError(
      `quantity has more than three decimal places: ${raw}`,
    );
  }

  const value =
    Number(whole || "0") * THOUSAND + Number(fraction.padEnd(3, "0") || "0");

  return assertThousandths(negative ? -value : value);
}

/** "2.5", "20", "0.125" - the shortest exact way to write the quantity. */
export function quantityToDecimalString(quantity: Thousandths): string {
  assertThousandths(quantity);

  const negative = quantity < 0;
  const absolute = Math.abs(quantity);
  const whole = Math.floor(absolute / THOUSAND);
  const fraction = String(absolute % THOUSAND).padStart(3, "0").replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/**
 * "20 reams", "2.5 litres", "1 ream".
 *
 * The unit is written by the owner, so it is printed as given rather than
 * pluralised by rule - "1 ream" and "20 ream" both read fine, and guessing the
 * plural of "pc" or "pack of 100" would not.
 */
export function formatQuantity(
  quantity: Thousandths,
  unit?: string | null,
): string {
  const number = quantityToDecimalString(quantity);
  return unit ? `${number} ${unit}` : number;
}

export function sumQuantities(
  quantities: readonly Thousandths[],
): Thousandths {
  return quantities.reduce<Thousandths>(
    (total, quantity) => total + assertThousandths(quantity),
    0,
  );
}

/**
 * What a quantity costs, in centavos.
 *
 * THIS IS A MONEY CALCULATION, so it ends in whole centavos. The unit cost is
 * already in centavos, and the quantity is in thousandths, so the product is
 * in thousandths of a centavo - divided back down and rounded to the nearest
 * centavo.
 *
 * Rounding is half away from zero, the way a person rounds by hand, rather
 * than JavaScript's Math.round, which rounds -0.5 up to -0 and would make a
 * returned delivery cost a centavo less than the delivery did.
 */
export function costOfQuantity(
  quantity: Thousandths,
  unitCostCentavos: number,
): number {
  assertThousandths(quantity);

  const thousandthsOfACentavo = quantity * unitCostCentavos;
  const sign = thousandthsOfACentavo < 0 ? -1 : 1;

  return sign * Math.round(Math.abs(thousandthsOfACentavo) / THOUSAND);
}
