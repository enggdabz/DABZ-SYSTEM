/**
 * The order calendar (docs/spec.md 9.4).
 *
 * A month of due dates, with every non-cancelled order sitting on the day it
 * is promised for. A CANCELLED ORDER IS NOT SHOWN AT ALL - it is not work, and
 * a day that looks busy because of three orders nobody is making is a day the
 * shop turns a customer away from.
 *
 * The grid starts on SUNDAY, unlike the payroll calendar, because that is how
 * a wall calendar in the shop reads and this one is read at a glance rather
 * than counted.
 */
import {
  addDays,
  civilDateToISO,
  compareCivilDates,
  daysBetween,
  daysInMonth,
  type CivilDate,
  type Period,
} from "@/lib/period";

import { loadByDate, type DayLoad } from "./capacity";
import { isOverdue } from "./status";
import type { OrderSummary } from "./types";

export interface CalendarDay {
  date: string;
  day: number;
  /** False for the days either side that only fill the grid out. */
  inMonth: boolean;
  isToday: boolean;
  orders: OrderSummary[];
  load: DayLoad | undefined;
}

export interface OrderCalendar {
  period: Period;
  weeks: CalendarDay[][];
  /** Everything due this month, in date order, for the list below the grid. */
  dueThisMonth: OrderSummary[];
  /** Open orders in this month that are already late. */
  overdueThisMonth: number;
}

/** Sunday-first, whole weeks. */
function startOfCalendarWeek(date: CivilDate): CivilDate {
  const asUtc = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return addDays(date, -asUtc.getUTCDay());
}

export function buildOrderCalendar(options: {
  orders: readonly OrderSummary[];
  period: Period;
  today: CivilDate;
  /** Null until the owner says what a full day is. */
  dailyCapacityPcs: number | null;
}): OrderCalendar {
  const { period, today, dailyCapacityPcs } = options;

  // A cancelled order is not work. It is left off the grid entirely.
  const shown = options.orders.filter((order) => order.status !== "cancelled");
  const load = loadByDate(shown, dailyCapacityPcs);

  const byDay = new Map<string, OrderSummary[]>();
  for (const order of shown) {
    const key = civilDateToISO(order.dateNeeded);
    const bucket = byDay.get(key) ?? [];
    bucket.push(order);
    byDay.set(key, bucket);
  }
  for (const bucket of byDay.values()) {
    bucket.sort((a, b) => a.orderNo.localeCompare(b.orderNo));
  }

  const firstOfMonth: CivilDate = { year: period.year, month: period.month, day: 1 };
  const lastOfMonth: CivilDate = {
    year: period.year,
    month: period.month,
    day: daysInMonth(period),
  };

  const gridStart = startOfCalendarWeek(firstOfMonth);
  const gridEnd = addDays(startOfCalendarWeek(lastOfMonth), 6);
  const span = daysBetween(gridStart, gridEnd) + 1;

  const todayISO = civilDateToISO(today);
  const weeks: CalendarDay[][] = [];

  for (let index = 0; index < span; index += 1) {
    const date = addDays(gridStart, index);
    const iso = civilDateToISO(date);

    const day: CalendarDay = {
      date: iso,
      day: date.day,
      inMonth: date.year === period.year && date.month === period.month,
      isToday: iso === todayISO,
      orders: byDay.get(iso) ?? [],
      load: load.get(iso),
    };

    if (index % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(day);
  }

  const dueThisMonth = shown
    .filter(
      (order) =>
        order.dateNeeded.year === period.year &&
        order.dateNeeded.month === period.month,
    )
    .sort(
      (a, b) =>
        compareCivilDates(a.dateNeeded, b.dateNeeded) ||
        a.orderNo.localeCompare(b.orderNo),
    );

  return {
    period,
    weeks,
    dueThisMonth,
    overdueThisMonth: dueThisMonth.filter((order) => isOverdue(order, today)).length,
  };
}

/** The last four digits of an order number, for a cramped calendar entry. */
export function shortOrderNo(orderNo: string): string {
  const digits = /(\d{4,})$/.exec(orderNo);
  return digits ? digits[1].slice(-4) : orderNo;
}
