/**
 * Stock quantities are stored as thousandths of a unit, so 1.5 kg is 1500.
 */

/**
 * Cost of a quantity at a unit price.
 *
 * Thousandths times centavos gives thousandths of a centavo, so the result is
 * divided by 1000 and rounded. record_stock_in does the same arithmetic in SQL,
 * where round() rounds half AWAY FROM ZERO — the way a person rounds by hand.
 * JavaScript's Math.round rounds half towards positive infinity, which disagrees
 * on negatives, so the rounding is written out rather than borrowed.
 */
export function costOfQuantity(
  quantityThousandths: number,
  unitCostCentavos: number,
): number {
  const exact = (quantityThousandths * unitCostCentavos) / 1000;
  return exact < 0 ? -Math.round(-exact) : Math.round(exact);
}

/** 1500 -> "1.5" */
export function formatQuantity(thousandths: number): string {
  const negative = thousandths < 0;
  const absolute = Math.abs(Math.trunc(thousandths));
  const whole = Math.floor(absolute / 1000).toLocaleString("en-PH");
  const fraction = String(absolute % 1000).padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "−" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** "1.5" -> 1500, or null when the input is not a well-formed quantity. */
export function parseQuantityToThousandths(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, "");
  if (cleaned === "" || cleaned === "." || cleaned === "-") return null;
  if (!/^-?\d*(\.\d{0,3})?$/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const [whole = "0", fraction = ""] = cleaned.replace("-", "").split(".");
  const value =
    Number(whole || "0") * 1000 + Number((fraction + "000").slice(0, 3));
  return negative ? -value : value;
}
