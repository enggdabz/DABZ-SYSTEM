/**
 * Money handling for the whole Dabz system.
 *
 * WHY THIS FILE EXISTS
 * Computers cannot store amounts like 12.10 exactly, so adding prices as
 * decimals slowly drifts (0.1 + 0.2 is 0.30000000000000004, not 0.3). A shop
 * that adds thousands of lines a month would end up with totals that do not
 * match the cash drawer. So every peso amount in this system is stored and
 * calculated as a WHOLE NUMBER OF CENTAVOS (spec 2.1):
 *
 *     PHP 12.50  ->  1250
 *     PHP 3.00   ->  300
 *
 * Only convert to a decimal at the very last step, when showing it on screen
 * or printing it on a receipt.
 */

/** A whole number of centavos. Never a decimal. */
export type Centavos = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Rejects anything that is not a safe whole number of centavos. */
export function assertCentavos(value: number, label = "amount"): Centavos {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`${label} must be a number, got ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `${label} must be whole centavos (no decimals), got ${value}`,
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} is too large to be exact: ${value}`);
  }
  return value;
}

/**
 * Turns what a person types into centavos.
 *
 * Accepts "12.50", "12.5", "12", "1,234.50", " 45 " and plain numbers.
 * Rejects more than two decimal places instead of silently rounding, because
 * a typo like 12.555 should be corrected by the staff, not guessed at.
 */
export function parsePesos(input: string | number): Centavos {
  const raw = typeof input === "number" ? String(input) : input.trim();

  if (raw === "") {
    throw new MoneyError("amount is empty");
  }

  // Strip thousands separators people type out of habit: 1,234.50
  const cleaned = raw.replace(/,/g, "");

  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) {
    if (/^-?\d+\.\d{3,}$/.test(cleaned)) {
      throw new MoneyError(
        `amount has more than 2 decimal places: ${raw}. Pesos only go down to centavos.`,
      );
    }
    throw new MoneyError(`amount is not a valid peso amount: ${raw}`);
  }

  const [, sign, whole, decimals = ""] = match;
  const centavos =
    Number(whole) * 100 + Number(decimals.padEnd(2, "0") || "0");

  return assertCentavos(sign === "-" ? -centavos : centavos);
}

/** 1250 -> "12.50" (no peso sign, for input boxes and CSV exports). */
export function centavosToDecimalString(amount: Centavos): string {
  assertCentavos(amount);
  const negative = amount < 0;
  const absolute = Math.abs(amount);
  const pesos = Math.trunc(absolute / 100);
  const centavos = absolute % 100;
  return `${negative ? "-" : ""}${pesos}.${String(centavos).padStart(2, "0")}`;
}

/** 123456 -> "PHP 1,234.56" rendered with the peso sign. */
export function formatPesos(
  amount: Centavos,
  options: { withSign?: boolean } = {},
): string {
  assertCentavos(amount);
  const { withSign = true } = options;
  const negative = amount < 0;
  const absolute = Math.abs(amount);
  const pesos = Math.trunc(absolute / 100);
  const centavos = absolute % 100;
  const grouped = pesos.toLocaleString("en-PH");
  const body = `${grouped}.${String(centavos).padStart(2, "0")}`;
  return `${negative ? "-" : ""}${withSign ? "₱" : ""}${body}`;
}

/** Adds any number of centavo amounts. Returns 0 for an empty list. */
export function sumCentavos(amounts: readonly Centavos[]): Centavos {
  return amounts.reduce<Centavos>((total, amount, index) => {
    assertCentavos(amount, `amount at position ${index}`);
    return total + amount;
  }, 0);
}

/** A sale line: unit price x quantity. Quantity must be a whole count. */
export function lineTotal(unitPrice: Centavos, quantity: number): Centavos {
  assertCentavos(unitPrice, "unit price");
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new MoneyError(`quantity must be a whole number of 1 or more, got ${quantity}`);
  }
  if (unitPrice < 0) {
    throw new MoneyError(`unit price cannot be negative, got ${unitPrice}`);
  }
  return assertCentavos(unitPrice * quantity);
}

/**
 * A peso-amount discount on a subtotal.
 * Clamped so a sale can never go below zero (spec 6: discounts apply to the
 * whole sale). Returns the discount actually applied plus the new total.
 */
export function applyAmountDiscount(
  subtotal: Centavos,
  discount: Centavos,
): { discount: Centavos; total: Centavos } {
  assertCentavos(subtotal, "subtotal");
  assertCentavos(discount, "discount");
  if (subtotal < 0) throw new MoneyError("subtotal cannot be negative");
  if (discount < 0) throw new MoneyError("discount cannot be negative");

  const applied = Math.min(discount, subtotal);
  return { discount: applied, total: subtotal - applied };
}

/**
 * A percentage discount on a subtotal, rounded to the nearest centavo.
 * 10% of PHP 33.33 is PHP 3.333, which becomes PHP 3.33.
 */
export function applyPercentDiscount(
  subtotal: Centavos,
  percent: number,
): { discount: Centavos; total: Centavos } {
  assertCentavos(subtotal, "subtotal");
  if (subtotal < 0) throw new MoneyError("subtotal cannot be negative");
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new MoneyError(`discount percent must be between 0 and 100, got ${percent}`);
  }

  const discount = Math.round((subtotal * percent) / 100);
  return applyAmountDiscount(subtotal, discount);
}

/**
 * Change for a cash payment. Refuses to compute change when the customer has
 * not handed over enough, so the POS shows a clear error instead of a
 * negative "change" figure (spec 6).
 */
export function computeChange(
  total: Centavos,
  moneyGiven: Centavos,
): Centavos {
  assertCentavos(total, "total");
  assertCentavos(moneyGiven, "money given");
  if (total < 0) throw new MoneyError("total cannot be negative");
  if (moneyGiven < 0) throw new MoneyError("money given cannot be negative");
  if (moneyGiven < total) {
    throw new MoneyError(
      `money given (${formatPesos(moneyGiven)}) is less than the total (${formatPesos(total)})`,
    );
  }
  return moneyGiven - total;
}
