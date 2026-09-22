/**
 * What an online order comes to (docs/spec.md 7.2).
 *
 * THE RULE THIS FILE PROTECTS: a quote that has not been given is NOT zero.
 *
 * An order with an unpriced jacket in it has a fixed total and a gap, and the
 * gap has to be said out loud - "PHP 2,700 + quote" - rather than rounded down
 * to a number the customer would happily pay. A balance is not shown at all
 * until every part of the order has a price, because a balance built on a
 * missing figure is a bill for the wrong amount.
 *
 * Nothing here is stored. An order's total is added up from its own rows every
 * time it is asked for, the same rule as a payslip, a receipt and an apparel
 * job order.
 */
import { formatPesos, sumCentavos, type Centavos } from "@/lib/money";

import type { OrderItem, Payment } from "./types";

export interface OrderTotals {
  fixedTotalCentavos: Centavos;
  quoteAmountCentavos: Centavos | null;
  hasQuoteItems: boolean;
  /** The quote counts as nothing until it is given. */
  totalCentavos: Centavos;
  paidCentavos: Centavos;
  balanceCentavos: Centavos;
  pieces: number;
  /** True while something in the order still has no price. */
  awaitingQuote: boolean;
}

export function orderTotals(
  items: readonly Pick<OrderItem, "pricingMode" | "unitPriceCentavos" | "qty">[],
  quoteAmountCentavos: Centavos | null,
  payments: readonly Pick<Payment, "amountCentavos" | "voidedAt">[] = [],
): OrderTotals {
  const fixedTotalCentavos = sumCentavos(
    items
      .filter((item) => item.pricingMode === "fixed")
      .map((item) => (item.unitPriceCentavos ?? 0) * item.qty),
  );

  const hasQuoteItems = items.some((item) => item.pricingMode === "quote");
  const totalCentavos = fixedTotalCentavos + (quoteAmountCentavos ?? 0);

  // A voided payment is skipped here and everywhere else. Counting one would
  // show money the shop handed back.
  const paidCentavos = sumCentavos(
    payments.filter((p) => p.voidedAt === null).map((p) => p.amountCentavos),
  );

  return {
    fixedTotalCentavos,
    quoteAmountCentavos,
    hasQuoteItems,
    totalCentavos,
    paidCentavos,
    balanceCentavos: totalCentavos - paidCentavos,
    pieces: items.reduce((total, item) => total + item.qty, 0),
    awaitingQuote: hasQuoteItems && quoteAmountCentavos === null,
  };
}

/**
 * The total as a sentence.
 *
 * Three cases, and the middle one is the point of the file: an order that is
 * part priced says both halves rather than printing the half it knows.
 */
export function totalLabel(totals: OrderTotals): string {
  if (!totals.awaitingQuote) return formatPesos(totals.totalCentavos);
  if (totals.fixedTotalCentavos === 0) return "To be quoted";
  return `${formatPesos(totals.fixedTotalCentavos)} + quote`;
}

/** The balance, or null while there is nothing honest to say. */
export function balanceLabel(totals: OrderTotals): string | null {
  if (totals.awaitingQuote) return null;
  return formatPesos(totals.balanceCentavos);
}

/** One line's price, or null when it is still to be quoted. */
export function lineTotalCentavos(
  item: Pick<OrderItem, "pricingMode" | "unitPriceCentavos" | "qty">,
): Centavos | null {
  if (item.pricingMode !== "fixed" || item.unitPriceCentavos === null) return null;
  return item.unitPriceCentavos * item.qty;
}

export function lineTotalLabel(
  item: Pick<OrderItem, "pricingMode" | "unitPriceCentavos" | "qty">,
): string {
  const total = lineTotalCentavos(item);
  return total === null ? "To be quoted" : formatPesos(total);
}

/**
 * Sharing one quote across the quote items it covers, by pieces
 * (docs/spec.md 7.2, for "Sales by product").
 *
 * A quote is ONE figure for the whole order - that is what the customer
 * agreed to - so attributing it to products means splitting it, and pieces is
 * the only measure the data supports.
 *
 * The parts add back up to the quote EXACTLY. Each share is rounded down and
 * the remainder handed out a centavo at a time to the largest lines first, so
 * "sales by product" can never be a centavo more or less than the sales it was
 * built from. The same shape as `totalsByDivision` at the counter.
 */
export function splitQuoteByPieces(
  quoteAmountCentavos: Centavos,
  lines: readonly { key: string; pieces: number }[],
): { key: string; centavos: Centavos }[] {
  const totalPieces = lines.reduce((total, line) => total + line.pieces, 0);

  if (lines.length === 0) return [];

  if (totalPieces <= 0) {
    // Nothing to weigh by. The whole quote goes on the first line rather than
    // disappearing, because the money is real either way.
    return lines.map((line, index) => ({
      key: line.key,
      centavos: index === 0 ? quoteAmountCentavos : 0,
    }));
  }

  const shares = lines.map((line) => {
    const exact = (quoteAmountCentavos * line.pieces) / totalPieces;
    return { key: line.key, centavos: Math.floor(exact), remainder: exact % 1 };
  });

  let left = quoteAmountCentavos - shares.reduce((t, s) => t + s.centavos, 0);

  // Biggest fractional part first, ties broken by the order they came in, so
  // the answer is the same every time it is worked out.
  const order = shares
    .map((share, index) => ({ index, remainder: share.remainder }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (const { index } of order) {
    if (left <= 0) break;
    shares[index].centavos += 1;
    left -= 1;
  }

  return shares.map(({ key, centavos }) => ({ key, centavos }));
}

/**
 * The same three sentences as `totalLabel`, for a row that already carries the
 * figures rather than the items they were added up from.
 *
 * The orders list, the calendar and the board all read `online_order_totals`,
 * which has done the adding already - so they need the WORDING without
 * rebuilding an item list to get it. One function, so the list and the order
 * page cannot describe the same order differently.
 */
export function summaryTotalLabel(order: {
  hasQuoteItems: boolean;
  quoteAmountCentavos: Centavos | null;
  fixedTotalCentavos: Centavos;
  totalCentavos: Centavos;
}): string {
  if (!(order.hasQuoteItems && order.quoteAmountCentavos === null)) {
    return formatPesos(order.totalCentavos);
  }
  return order.fixedTotalCentavos === 0
    ? "No quote yet"
    : `${formatPesos(order.fixedTotalCentavos)} + quote`;
}

/** True while part of the order still has no price, so no balance is honest. */
export function summaryAwaitingQuote(order: {
  hasQuoteItems: boolean;
  quoteAmountCentavos: Centavos | null;
}): boolean {
  return order.hasQuoteItems && order.quoteAmountCentavos === null;
}
