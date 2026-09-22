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

/**
 * How many orders are drawn at once.
 *
 * Fifty is enough that a shop this size never meets the pager at all, and few
 * enough that a shop four years from now is not painting nine hundred cards
 * to show the six that are due this week.
 */
export const ORDERS_PER_PAGE = 50;

export interface OrderPage {
  rows: OrderSummary[];
  /** 1-based, and always a page that exists. */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based positions of the first and last row shown, for "1-50 of 214". */
  firstShown: number;
  lastShown: number;
}

/**
 * One page of an already-filtered, already-sorted list.
 *
 * WHAT THIS DOES NOT DO, deliberately: it does not page the READ. Every order
 * is still fetched, because the five tiles and the count on every filter chip
 * are statements about the whole shop - "Overdue 3" has to mean three, not
 * three on this page - and `listTiles` works them out from the same array the
 * list is drawn from. That is the point of this file: the number on a tile and
 * the rows under a chip come from one idea of what "open" means. Moving the
 * tiles into SQL to page the read would split that in two, which is the bug
 * this module was built to avoid.
 *
 * So this caps what the BROWSER is asked to draw, which is the cost that bites
 * first. When the read itself becomes the cost - thousands of orders, not
 * hundreds - the answer is aggregates in the database feeding both, together,
 * and not a paged read beside tiles that still count everything.
 */
export function pageOfOrders(
  orders: readonly OrderSummary[],
  page: number,
): OrderPage {
  const total = orders.length;
  const pageCount = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));

  /*
    Clamped, not refused. A bookmarked `?page=9` on a list that has shrunk to
    two pages should show the last page - an empty list there would read as
    "nothing matches that filter", which is a different and untrue statement.
  */
  const safe = Number.isFinite(page) ? Math.trunc(page) : 1;
  const current = Math.min(Math.max(safe, 1), pageCount);

  const start = (current - 1) * ORDERS_PER_PAGE;
  const rows = orders.slice(start, start + ORDERS_PER_PAGE);

  return {
    rows,
    page: current,
    pageCount,
    total,
    firstShown: total === 0 ? 0 : start + 1,
    lastShown: start + rows.length,
  };
}

/** `?page=` as typed, before `pageOfOrders` clamps it. */
export function parsePageNumber(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/** "Jersey +2" - the first item's name and how many more there are. */
export function itemsLabel(order: OrderSummary): string {
  if (order.firstItemName === null) return "No items";
  return order.extraItemCount > 0
    ? `${order.firstItemName} +${order.extraItemCount}`
    : order.firstItemName;
}
