/**
 * The Orders screen's own arithmetic (docs/spec.md 9.1).
 *
 * Five tiles and a row of filter chips, worked out here rather than in the
 * screen so the number on a tile and the list under a chip cannot come from
 * two different ideas of what "open" means.
 */
import { sumCentavos, type Centavos } from "@/lib/money";
import { compareCivilDates, daysBetween, type CivilDate } from "@/lib/period";

import { isOpen, isOverdue, needsQuote } from "./status";
import { ORDER_STATUSES, type OrderStatus, type OrderSummary } from "./types";

export const ORDER_FILTERS = [
  "open",
  "all",
  "overdue",
  ...ORDER_STATUSES.filter((status) => status !== "cancelled"),
  "cancelled",
] as const;
export type OrderFilter = (typeof ORDER_FILTERS)[number];

export const ORDER_FILTER_LABELS: Record<OrderFilter, string> = {
  open: "Open",
  all: "All",
  overdue: "Overdue",
  new: "New",
  quoted: "Quoted",
  confirmed: "Confirmed",
  in_production: "In production",
  ready_to_ship: "Ready to ship",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function parseOrderFilter(value: string | null | undefined): OrderFilter {
  return (ORDER_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as OrderFilter)
    : "open";
}

export function applyOrderFilter(
  orders: readonly OrderSummary[],
  filter: OrderFilter,
  today: CivilDate,
): OrderSummary[] {
  switch (filter) {
    case "open":
      return orders.filter((order) => isOpen(order.status));
    case "all":
      return [...orders];
    case "overdue":
      return orders.filter((order) => isOverdue(order, today));
    default:
      return orders.filter((order) => order.status === (filter as OrderStatus));
  }
}

export interface ListTiles {
  openOrders: number;
  needAQuote: number;
  dueInSevenDays: number;
  overdue: number;
  /** Only what is actually owed. A credit on one order never cancels a debt. */
  unpaidBalanceCentavos: Centavos;
}

export function listTiles(
  orders: readonly OrderSummary[],
  today: CivilDate,
): ListTiles {
  const open = orders.filter((order) => isOpen(order.status));

  return {
    openOrders: open.length,
    needAQuote: open.filter((order) => needsQuote(order)).length,
    dueInSevenDays: open.filter((order) => {
      const days = daysBetween(today, order.dateNeeded);
      return days >= 0 && days <= 7;
    }).length,
    overdue: orders.filter((order) => isOverdue(order, today)).length,
    /*
      Positive balances only. One order overpaid by PHP 500 does not mean the
      shop is owed PHP 500 less across the others - it means one customer has
      a credit, which is a different conversation.
    */
    unpaidBalanceCentavos: sumCentavos(
      open
        .filter((order) => !(order.hasQuoteItems && order.quoteAmountCentavos === null))
        .map((order) => Math.max(0, order.balanceCentavos)),
    ),
  };
}

/**
 * The list order: open work first, soonest due first.
 *
 * A finished order sorted in among the live ones is a finished order somebody
 * picks up by mistake, so they go to the bottom whatever their date.
 */
export function sortOrders(
  orders: readonly OrderSummary[],
  today: CivilDate,
): OrderSummary[] {
  return [...orders].sort((a, b) => {
    const aOpen = isOpen(a.status);
    const bOpen = isOpen(b.status);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;

    if (aOpen) {
      // Soonest first, so the top of the list is what to do today.
      const byDate = compareCivilDates(a.dateNeeded, b.dateNeeded);
      if (byDate !== 0) return byDate;
    } else {
      // Finished work reads newest first: it is history, not a queue.
      const byDate = compareCivilDates(b.dateNeeded, a.dateNeeded);
      if (byDate !== 0) return byDate;
    }

    void today;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** "Jersey +2" - the first item's name and how many more there are. */
export function itemsLabel(order: OrderSummary): string {
  if (order.firstItemName === null) return "No items";
  return order.extraItemCount > 0
    ? `${order.firstItemName} +${order.extraItemCount}`
    : order.firstItemName;
}
