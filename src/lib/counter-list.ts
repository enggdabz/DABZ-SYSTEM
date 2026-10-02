/**
 * The Counter's product list (the owner's request, 2 Oct 2026).
 *
 * Every product is one row with its own quantity box. The rows with a quantity
 * ARE the sale: there is no separate cart to keep in step with them, so a row
 * moved, a photo changed or a product added cannot leave a line behind or
 * take one with it. Quantities are kept by PRODUCT ID, never by position, for
 * the same reason - a drag changes positions, and a quantity must stay with
 * the thing it was typed against.
 *
 * Every figure goes through src/lib/money.ts and src/lib/pos.ts, the same
 * tested code the server re-runs when the sale is completed. Nothing in this
 * file touches a database, a clock or the browser.
 */
import { MoneyError, lineTotal, parsePesos, sumCentavos, type Centavos } from "./money";
import { unitPriceFor, type PriceTier } from "./pos";
import type { DivisionId } from "./divisions";

/** What a row needs to know about its product. */
export interface ListProduct {
  id: string;
  name: string;
  division: DivisionId;
  /** Null: the price is typed at the counter each time. */
  priceCentavos: Centavos | null;
  incomeCategory: string;
  tiers: readonly PriceTier[];
}

/** The biggest quantity a box takes. A typo, not a real sale, past this. */
export const MAX_QUANTITY = 99_999;

/**
 * What a quantity box keeps of what was typed.
 *
 * Whole numbers only - no minus sign, no decimal point, no "e". Dropping the
 * characters as they arrive is kinder than an error under the box: the box
 * simply cannot hold a wrong quantity. Leading zeros go so "007" reads 7, and
 * a lone "0" becomes empty, because zero and empty mean the same thing here.
 */
export function cleanQuantity(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (digits === "") return "";
  const value = Math.min(Number(digits), MAX_QUANTITY);
  return String(value);
}

/** The quantity in a box, as a number. Empty is 0. */
export function quantityOf(raw: string | undefined): number {
  const cleaned = cleanQuantity(raw ?? "");
  return cleaned === "" ? 0 : Number(cleaned);
}

export type RowPrice =
  /** Nothing typed in the quantity box. */
  | { kind: "empty" }
  /** A quantity, but the product has no set price and none is typed yet. */
  | { kind: "needs-price" }
  | {
      kind: "priced";
      quantity: number;
      unitPriceCentavos: Centavos;
      lineTotalCentavos: Centavos;
      /** True when an owner's bulk price rule set the unit price. */
      bulk: boolean;
    };

/**
 * What one row comes to.
 *
 * A product with a set price uses it - or the owner's bulk price once the
 * quantity reaches a rule, applied as the number is typed. A product with no
 * set price uses the amount typed beside it, which is how an unpriced product
 * has always worked at this counter: the amount is asked, never guessed.
 */
export function rowPrice(
  product: ListProduct,
  rawQuantity: string | undefined,
  typedPrice: string | undefined,
): RowPrice {
  const quantity = quantityOf(rawQuantity);
  if (quantity === 0) return { kind: "empty" };

  let unitPriceCentavos: Centavos;
  let bulk = false;

  if (product.priceCentavos === null) {
    try {
      unitPriceCentavos = parsePesos(typedPrice ?? "");
    } catch (error) {
      if (error instanceof MoneyError) return { kind: "needs-price" };
      throw error;
    }
    if (unitPriceCentavos <= 0) return { kind: "needs-price" };
  } else {
    unitPriceCentavos = unitPriceFor(product.priceCentavos, quantity, product.tiers);
    bulk = unitPriceCentavos !== product.priceCentavos;
  }

  return {
    kind: "priced",
    quantity,
    unitPriceCentavos,
    lineTotalCentavos: lineTotal(unitPriceCentavos, quantity),
    bulk,
  };
}

/** A line of the sale, in the shape `completeSaleAction` already takes. */
export interface ListSaleLine {
  name: string;
  quantity: number;
  unitPriceCentavos: Centavos;
  division: DivisionId;
  productId: string;
  incomeCategory: string;
}

export interface ListSale {
  /** In the order the rows are shown. */
  lines: ListSaleLine[];
  /** Every row with a quantity - whether or not it can be sold yet. */
  rowsWithQuantity: number;
  /** Rows with a quantity but no price yet. The sale cannot go until these are fixed. */
  missingPrice: string[];
  totalCentavos: Centavos;
}

/**
 * The rows with a quantity, as sale lines.
 *
 * A row waiting for its price is NOT quietly left out: it is named in
 * `missingPrice`, and the screen refuses to complete the sale until it is
 * fixed. Dropping it would ring up a sale without something the customer is
 * holding.
 */
export function listSale(
  products: readonly ListProduct[],
  quantities: Readonly<Record<string, string>>,
  prices: Readonly<Record<string, string>>,
): ListSale {
  const lines: ListSaleLine[] = [];
  const missingPrice: string[] = [];
  let rowsWithQuantity = 0;

  for (const product of products) {
    const price = rowPrice(product, quantities[product.id], prices[product.id]);
    if (price.kind === "empty") continue;
    rowsWithQuantity += 1;

    if (price.kind === "needs-price") {
      missingPrice.push(product.name);
      continue;
    }

    lines.push({
      name: product.name,
      quantity: price.quantity,
      unitPriceCentavos: price.unitPriceCentavos,
      division: product.division,
      productId: product.id,
      incomeCategory: product.incomeCategory,
    });
  }

  return {
    lines,
    rowsWithQuantity,
    missingPrice,
    totalCentavos: sumCentavos(
      lines.map((line) => lineTotal(line.unitPriceCentavos, line.quantity)),
    ),
  };
}

/**
 * The ids in their new order after a row is dragged from one place to
 * another. A copy - the list it was given is left alone, so the old order is
 * still there to put back if saving the new one fails.
 */
export function moveId(ids: readonly string[], fromId: string, toId: string): string[] {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from === -1 || to === -1 || from === to) return [...ids];

  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** How a name is compared for "already in the list": case and spacing aside. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export const NEW_PRODUCT_NAME_MAX = 120;

export type NewProductCheck =
  | { ok: true; name: string; priceCentavos: Centavos }
  | { ok: false; fieldErrors: { name?: string; price?: string } };

/**
 * A product added from the Counter.
 *
 * Run in the browser for the quick answer and again on the server, which is
 * the one that counts - a Server Action is a public endpoint. A price of zero
 * is refused here even though the database would take it: the owner asked
 * for a price on every product added this way, and a zero would sell things
 * for nothing without anybody deciding that.
 */
export function checkNewProduct(
  input: { name: string; price: string },
  existingNames: readonly string[],
): NewProductCheck {
  const fieldErrors: { name?: string; price?: string } = {};
  const name = input.name.trim().replace(/\s+/g, " ");

  if (name === "") {
    fieldErrors.name = "Give the product a name.";
  } else if (name.length > NEW_PRODUCT_NAME_MAX) {
    fieldErrors.name = `Keep the name under ${NEW_PRODUCT_NAME_MAX} characters.`;
  } else {
    const key = nameKey(name);
    if (existingNames.some((existing) => nameKey(existing) === key)) {
      fieldErrors.name = `"${name}" is already in the list.`;
    }
  }

  let priceCentavos = 0;
  try {
    priceCentavos = parsePesos(input.price);
    if (priceCentavos <= 0) fieldErrors.price = "Enter a price greater than zero.";
  } catch {
    fieldErrors.price = "Enter a price like 25 or 25.50.";
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, name, priceCentavos };
}

export type ProductEditCheck =
  | { ok: true; name: string; priceCentavos: Centavos | null }
  | { ok: false; fieldErrors: { name?: string; price?: string } };

/**
 * Renaming or repricing a product from the Counter (owner's request, 2 Oct
 * 2026).
 *
 * The same rules as a new product - a name, not one already in the list, a
 * price above zero - with one difference: the price box may be left EMPTY,
 * which keeps the product asking for its price at the counter each time. A
 * product added on the Products screen can already be in that state, and an
 * edit to its name must not force somebody to invent a price for it. Zero is
 * still refused: empty means "ask", zero would mean "free".
 *
 * `otherNames` is every OTHER product in the list, so keeping a name as it is
 * - or changing only its capitals - is not "already in the list".
 */
export function checkProductEdit(
  input: { name: string; price: string },
  otherNames: readonly string[],
): ProductEditCheck {
  if (input.price.trim() === "") {
    const named = checkNewProduct({ name: input.name, price: "1" }, otherNames);
    return named.ok
      ? { ok: true, name: named.name, priceCentavos: null }
      : { ok: false, fieldErrors: { name: named.fieldErrors.name } };
  }

  const checked = checkNewProduct(input, otherNames);
  return checked.ok ? { ok: true, name: checked.name, priceCentavos: checked.priceCentavos } : checked;
}

/**
 * The list to show when the server sends a fresh copy of the products.
 *
 * Every save on this screen asks the server for a fresh copy, and that copy
 * can arrive while ANOTHER change is still on its way - a second drag, a
 * photo, a delete. Replacing the list with it then would flick a row back to
 * where it was a moment ago, or bring a deleted row back. So:
 *
 *   - while something is still being saved (`busy`), this screen's own order
 *     is kept, the details (name, price, photo) are taken from the server,
 *     and anything the server has that this screen does not is added at the
 *     bottom;
 *   - once nothing is being saved, the server's list is the list.
 *
 * Either way a product this screen has just removed (`gone`) stays removed.
 */
export function reconcileProducts<T extends { id: string }>(
  local: readonly T[],
  incoming: readonly T[],
  gone: ReadonlySet<string>,
  busy: boolean,
): T[] {
  if (!busy) return incoming.filter((item) => !gone.has(item.id));

  const fresh = new Map(incoming.map((item) => [item.id, item]));
  const kept = local
    .filter((item) => !gone.has(item.id))
    .map((item) => fresh.get(item.id) ?? item);
  const known = new Set(kept.map((item) => item.id));
  const added = incoming.filter((item) => !known.has(item.id) && !gone.has(item.id));
  return [...kept, ...added];
}
