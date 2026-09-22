/**
 * Where an order can go from where it is (docs/spec.md 7.3).
 *
 * The same set of rules is written twice on purpose: here, so a screen can
 * show the two buttons that make sense instead of seven, and in the database
 * functions, which are the boundary. If they ever disagree the database wins
 * and the screen looks broken - which is the right way round.
 *
 * TWO THINGS THAT ARE NOT TRANSITIONS:
 *   * `ready_to_ship` is not reachable from here at all. An order becomes
 *     ready by the work being finished, never by somebody saying so.
 *   * `in_production` from `confirmed` IS here, because "Start production" is
 *     a real button - but ticking the first step does it too, so nobody has to
 *     press two things to begin.
 */
import type { CivilDate } from "@/lib/period";
import { compareCivilDates } from "@/lib/period";

import type { OrderStatus } from "./types";

/** Statuses a person can move an order to, by hand. */
export type MovableStatus = "quoted" | "confirmed" | "in_production" | "completed" | "cancelled";

export function isOpen(status: OrderStatus): boolean {
  return status !== "completed" && status !== "cancelled";
}

/**
 * Is this order late?
 *
 * An order that is packed is NOT overdue however long it has sat there - the
 * shop has done its part, and the red would be pointed at the wrong person.
 * A cancelled or completed order is not overdue either.
 */
export function isOverdue(
  order: { status: OrderStatus; dateNeeded: CivilDate },
  today: CivilDate,
): boolean {
  if (!isOpen(order.status)) return false;
  if (order.status === "ready_to_ship") return false;
  return compareCivilDates(order.dateNeeded, today) < 0;
}

/** An order nobody has priced yet, that cannot move until somebody does. */
export function needsQuote(order: {
  status: OrderStatus;
  hasQuoteItems: boolean;
  quoteAmountCentavos: number | null;
}): boolean {
  return order.status === "new" && order.hasQuoteItems;
}

/** Everything that is still waiting to be priced, whatever its status. */
export function awaitingQuote(order: {
  hasQuoteItems: boolean;
  quoteAmountCentavos: number | null;
}): boolean {
  return order.hasQuoteItems && order.quoteAmountCentavos === null;
}

export interface MoveCheck {
  allowed: boolean;
  /** Why not, in the words a person would want. Null when it is allowed. */
  reason: string | null;
}

export function canMoveTo(
  order: {
    status: OrderStatus;
    hasQuoteItems: boolean;
    quoteAmountCentavos: number | null;
  },
  target: MovableStatus,
): MoveCheck {
  const no = (reason: string): MoveCheck => ({ allowed: false, reason });
  const yes: MoveCheck = { allowed: true, reason: null };

  switch (target) {
    case "quoted":
      return order.status === "new" || order.status === "quoted"
        ? yes
        : no("A quote can only be set on an order that is New or Quoted.");

    case "confirmed":
      if (order.status !== "new" && order.status !== "quoted") {
        return no("Only a New or Quoted order can be confirmed.");
      }
      // The customer cannot have agreed to a price nobody has given them.
      if (awaitingQuote(order)) {
        return no("Send the quote first — part of this order has no price yet.");
      }
      return yes;

    case "in_production":
      return order.status === "confirmed"
        ? yes
        : no("Production starts from a confirmed order.");

    case "completed":
      return order.status === "ready_to_ship"
        ? yes
        : no("An order is completed once it is ready to ship and the customer has it.");

    case "cancelled":
      return order.status === "new" ||
        order.status === "quoted" ||
        order.status === "confirmed"
        ? yes
        : no("An order already in production cannot be cancelled here.");
  }
}

/** The moves to offer on the order page, in the order they are offered. */
export function availableMoves(order: {
  status: OrderStatus;
  hasQuoteItems: boolean;
  quoteAmountCentavos: number | null;
}): MovableStatus[] {
  const moves: MovableStatus[] = ["confirmed", "in_production", "completed", "cancelled"];
  return moves.filter((move) => canMoveTo(order, move).allowed);
}

/**
 * The steps a CUSTOMER is shown on the track page (docs/spec.md 8.5).
 *
 * "Quoted" is left out of an order that never had a quote item: showing a step
 * that was skipped on purpose reads as a step that went wrong.
 */
export function customerProgress(order: {
  status: OrderStatus;
  hasQuoteItems: boolean;
}): { status: OrderStatus; label: string; reached: boolean }[] {
  const line: OrderStatus[] = order.hasQuoteItems
    ? ["new", "quoted", "confirmed", "in_production", "ready_to_ship", "completed"]
    : ["new", "confirmed", "in_production", "ready_to_ship", "completed"];

  // Where the order has got to. A cancelled order has not reached anything
  // beyond where it stopped, and says so with its own badge instead.
  const reachedIndex =
    order.status === "cancelled" ? -1 : line.indexOf(order.status);

  return line.map((status, index) => ({
    status,
    label: statusLabel(status),
    reached: reachedIndex >= 0 && index <= reachedIndex,
  }));
}

export function statusLabel(status: OrderStatus): string {
  return {
    new: "New",
    quoted: "Quoted",
    confirmed: "Confirmed",
    in_production: "In production",
    ready_to_ship: "Ready to ship",
    completed: "Completed",
    cancelled: "Cancelled",
  }[status];
}
