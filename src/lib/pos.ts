/**
 * Point of sale pricing (spec 6, 7).
 *
 * Every figure the counter shows a customer is worked out here, in whole
 * centavos, and tested. Nothing in this file touches a database or a clock.
 */
import {
  applyAmountDiscount,
  applyPercentDiscount,
  assertCentavos,
  computeChange,
  lineTotal,
  sumCentavos,
  type Centavos,
} from "./money";
import type { DivisionId } from "./divisions";

// ---------------------------------------------------------------------------
// The tarpaulin calculator (spec 7.3)
// ---------------------------------------------------------------------------

/** The rates the owner quoted, in centavos per square foot. Highest first. */
export const TARPAULIN_RATES: Centavos[] = [3000, 2500, 2000, 1500];
export const DEFAULT_TARPAULIN_RATE: Centavos = 3000;

export interface TarpaulinQuote {
  widthFeet: number;
  heightFeet: number;
  areaSquareFeet: number;
  ratePerSquareFootCentavos: Centavos;
  totalCentavos: Centavos;
  /** "Tarpaulin 3 x 5 ft - 15 sq ft at PHP 30.00" */
  description: string;
}

export class PosError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosError";
  }
}

/** Trims a trailing ".0" so 3 x 5 does not read as 3.0 x 5.0. */
function tidyNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function quoteTarpaulin(options: {
  widthFeet: number;
  heightFeet: number;
  ratePerSquareFootCentavos?: Centavos;
}): TarpaulinQuote {
  const { widthFeet, heightFeet } = options;
  const rate = options.ratePerSquareFootCentavos ?? DEFAULT_TARPAULIN_RATE;

  for (const [label, value] of [
    ["width", widthFeet],
    ["height", heightFeet],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new PosError(`Enter a ${label} in feet, greater than zero.`);
    }
    if (value > 1000) {
      throw new PosError(`That ${label} looks wrong - over 1000 feet.`);
    }
  }

  assertCentavos(rate, "rate per square foot");
  if (rate <= 0) throw new PosError("Choose a rate per square foot.");

  // Feet come with decimals (3.5 x 5), so the area does too. Rounding happens
  // once, at the peso total - never on the area, which would lose money on a
  // large banner.
  const areaSquareFeet = widthFeet * heightFeet;
  const totalCentavos = Math.round(areaSquareFeet * rate);

  return {
    widthFeet,
    heightFeet,
    areaSquareFeet,
    ratePerSquareFootCentavos: rate,
    totalCentavos,
    description: `Tarpaulin ${tidyNumber(widthFeet)} × ${tidyNumber(heightFeet)} ft — ${tidyNumber(
      Number(areaSquareFeet.toFixed(2)),
    )} sq ft × ${(rate / 100).toFixed(2)}`,
  };
}

// ---------------------------------------------------------------------------
// Bulk pricing (spec 7.4)
// ---------------------------------------------------------------------------
// The owner has not given the rules yet, so this is the MECHANISM with no rules
// in it: a product with no tiers simply sells at its normal price.

export interface PriceTier {
  /** Applies from this quantity upward. */
  minQuantity: number;
  unitPriceCentavos: Centavos;
}

/**
 * The unit price for a quantity, given a product's bulk tiers.
 *
 * The tier with the highest `minQuantity` that the quantity reaches wins, so
 * the rules can be written in any order.
 */
export function unitPriceFor(
  basePriceCentavos: Centavos,
  quantity: number,
  tiers: readonly PriceTier[] = [],
): Centavos {
  assertCentavos(basePriceCentavos, "price");
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new PosError("Quantity must be a whole number of 1 or more.");
  }

  let best: PriceTier | null = null;
  for (const tier of tiers) {
    if (quantity < tier.minQuantity) continue;
    if (!best || tier.minQuantity > best.minQuantity) best = tier;
  }

  return best ? best.unitPriceCentavos : basePriceCentavos;
}

// ---------------------------------------------------------------------------
// A sale (spec 6)
// ---------------------------------------------------------------------------

export interface SaleLineInput {
  /** What the receipt calls it. */
  name: string;
  quantity: number;
  unitPriceCentavos: Centavos;
  /** Each line keeps its own division, so reports can split them (spec 6). */
  division: DivisionId;
  productId?: string | null;
}

export interface SaleLine extends SaleLineInput {
  lineTotalCentavos: Centavos;
}

export type SaleDiscount =
  | { kind: "none" }
  | { kind: "amount"; centavos: Centavos }
  | { kind: "percent"; percent: number };

export interface SaleTotals {
  lines: SaleLine[];
  subtotalCentavos: Centavos;
  discountCentavos: Centavos;
  totalCentavos: Centavos;
  itemCount: number;
}

export function computeSale(options: {
  lines: readonly SaleLineInput[];
  discount?: SaleDiscount;
}): SaleTotals {
  const discount = options.discount ?? { kind: "none" };

  const lines: SaleLine[] = options.lines.map((line) => ({
    ...line,
    lineTotalCentavos: lineTotal(line.unitPriceCentavos, line.quantity),
  }));

  const subtotalCentavos = sumCentavos(
    lines.map((line) => line.lineTotalCentavos),
  );

  // The discount applies to the whole sale, not to a line (spec 6).
  const applied =
    discount.kind === "amount"
      ? applyAmountDiscount(subtotalCentavos, discount.centavos)
      : discount.kind === "percent"
        ? applyPercentDiscount(subtotalCentavos, discount.percent)
        : { discount: 0, total: subtotalCentavos };

  return {
    lines,
    subtotalCentavos,
    discountCentavos: applied.discount,
    totalCentavos: applied.total,
    itemCount: lines.reduce((count, line) => count + line.quantity, 0),
  };
}

export interface CashPayment {
  moneyGivenCentavos: Centavos;
  changeCentavos: Centavos;
}

/**
 * Change for a cash sale. Refuses short payment rather than showing negative
 * change, so the counter sees a clear error instead of a strange number.
 */
export function computeCashPayment(
  totalCentavos: Centavos,
  moneyGivenCentavos: Centavos,
): CashPayment {
  return {
    moneyGivenCentavos,
    changeCentavos: computeChange(totalCentavos, moneyGivenCentavos),
  };
}

/** Totals split by division, so one sale can feed three sets of books. */
export function totalsByDivision(
  totals: SaleTotals,
): Record<DivisionId, Centavos> {
  const byDivision: Record<DivisionId, Centavos> = {
    printshoppe: 0,
    apparel: 0,
    dabztech: 0,
  };

  for (const line of totals.lines) {
    byDivision[line.division] += line.lineTotalCentavos;
  }

  if (totals.discountCentavos === 0) return byDivision;

  /*
    A discount is given on the whole sale, but the books are kept per division,
    so it has to be shared out. Each division carries the same proportion of the
    discount as it contributed to the subtotal.

    The last division with anything in it absorbs the rounding, so the parts
    always add back up to the total exactly - otherwise a one-centavo gap would
    appear in the daily figures.
  */
  const divisions = (Object.keys(byDivision) as DivisionId[]).filter(
    (division) => byDivision[division] > 0,
  );

  let remaining = totals.discountCentavos;

  divisions.forEach((division, index) => {
    const isLast = index === divisions.length - 1;
    const share = isLast
      ? remaining
      : Math.round(
          (byDivision[division] * totals.discountCentavos) /
            totals.subtotalCentavos,
        );
    byDivision[division] -= share;
    remaining -= share;
  });

  return byDivision;
}

// ---------------------------------------------------------------------------
// Sale numbers (spec 6)
// ---------------------------------------------------------------------------

/** "S-260918-007" - the date makes a receipt easy to find later. */
export function formatSaleNumber(options: {
  year: number;
  month: number;
  day: number;
  sequence: number;
}): string {
  const { year, month, day, sequence } = options;
  const yy = String(year % 100).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `S-${yy}${mm}${dd}-${String(sequence).padStart(3, "0")}`;
}
