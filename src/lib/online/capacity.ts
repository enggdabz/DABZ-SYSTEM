/**
 * How much work is already promised for one day (docs/spec.md 7.5).
 *
 * THE FIGURE IS THE OWNER'S AND IT STARTS EMPTY. With no capacity set there is
 * no such thing as a full day, and the calendar says so rather than marking
 * days full against a number nobody chose. This is the same rule as a daily
 * target of zero meaning "not known" rather than "reached": a confident wrong
 * warning is worse than none, because it gets trusted - and here it would
 * mean turning a customer away on a day the shop was free.
 */
import type { CivilDate } from "@/lib/period";
import { civilDateToISO } from "@/lib/period";

import { isOpen } from "./status";
import type { OrderStatus } from "./types";

export interface DayLoad {
  /** "2026-09-25" */
  date: string;
  pieces: number;
  orders: number;
  /** Null when nobody has said what the shop can do in a day. */
  full: boolean | null;
}

/**
 * Pieces promised per due date, counting only OPEN orders.
 *
 * A completed order is work that has left the building, and a cancelled one
 * was never work at all. Counting either would show a day as full because of
 * jerseys that are already on a team.
 */
export function loadByDate(
  orders: readonly { status: OrderStatus; dateNeeded: CivilDate; pieces: number }[],
  dailyCapacityPcs: number | null,
): Map<string, DayLoad> {
  const byDate = new Map<string, DayLoad>();

  for (const order of orders) {
    if (!isOpen(order.status)) continue;

    const date = civilDateToISO(order.dateNeeded);
    const day = byDate.get(date) ?? { date, pieces: 0, orders: 0, full: null };
    day.pieces += order.pieces;
    day.orders += 1;
    byDate.set(date, day);
  }

  for (const day of byDate.values()) {
    day.full = dailyCapacityPcs === null ? null : day.pieces > dailyCapacityPcs;
  }

  return byDate;
}

/** "FULL 74", or null when the day is not full or nobody has said what full is. */
export function fullMarker(day: DayLoad | undefined): string | null {
  if (!day || day.full !== true) return null;
  return `FULL ${day.pieces}`;
}
