/**
 * Money is stored throughout the database as integer centavos.
 *
 * Nothing here converts to a float. Peso strings are parsed by splitting on the
 * decimal point and doing integer arithmetic, because `parseFloat("0.29") * 100`
 * is 28.999999999999996 — which truncates to a centavo short on roughly one
 * amount in a hundred.
 */

/** Formats centavos as pesos, e.g. 123456 -> "₱1,234.56". */
export function formatCentavos(centavos: number): string {
  const negative = centavos < 0;
  const absolute = Math.abs(Math.trunc(centavos));
  const pesos = Math.floor(absolute / 100).toLocaleString("en-PH");
  const cents = String(absolute % 100).padStart(2, "0");
  return `${negative ? "−" : ""}₱${pesos}.${cents}`;
}

/** Formats centavos without the currency symbol, for table columns. */
export function formatAmount(centavos: number): string {
  return formatCentavos(centavos).replace("₱", "");
}

/**
 * Parses a typed peso amount into centavos.
 * Returns null when the input is not a well-formed amount.
 */
export function parsePesosToCentavos(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, "");
  if (cleaned === "" || cleaned === "." || cleaned === "-") return null;
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const [whole = "0", fraction = ""] = cleaned.replace("-", "").split(".");
  const centavos =
    Number(whole || "0") * 100 + Number((fraction + "00").slice(0, 2));

  return negative ? -centavos : centavos;
}

/** Reads a peso amount out of form data, or null when absent/malformed. */
export function centavosFromForm(
  formData: FormData,
  field: string,
): number | null {
  const raw = formData.get(field);
  return typeof raw === "string" ? parsePesosToCentavos(raw) : null;
}

/** Stock quantities are stored as thousandths of a unit. */
export function formatQuantity(thousandths: number): string {
  const negative = thousandths < 0;
  const absolute = Math.abs(Math.trunc(thousandths));
  const whole = Math.floor(absolute / 1000).toLocaleString("en-PH");
  const fraction = String(absolute % 1000).padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "−" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function parseQuantityToThousandths(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, "");
  if (cleaned === "" || cleaned === ".") return null;
  if (!/^-?\d*(\.\d{0,3})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const [whole = "0", fraction = ""] = cleaned.replace("-", "").split(".");
  const value =
    Number(whole || "0") * 1000 + Number((fraction + "000").slice(0, 3));
  return negative ? -value : value;
}
