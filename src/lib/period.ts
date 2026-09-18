/**
 * Months and dates, in the shop's own timezone.
 *
 * WHY THIS FILE IS CAREFUL
 * "Is this bill overdue?" is a question about the calendar in Bacolod, not
 * about UTC. At 7am on the 1st in Manila it is still 11pm on the last day of
 * the previous month in UTC. A bill checked against the UTC date would look
 * overdue a day early, every month.
 *
 * So: timestamps are stored in UTC (spec 2.1), but every "what day is it"
 * decision goes through here, which reads the date as Asia/Manila and then does
 * plain whole-day arithmetic on it.
 */
import { SHOP_TIMEZONE } from "./datetime";

/** A calendar date with no time and no timezone attached. */
export interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

/** A month the shop pays bills in, e.g. September 2026. */
export interface Period {
  year: number;
  month: number; // 1-12
}

/** Today's date as the shop experiences it. */
export function manilaToday(now: Date = new Date()): CivilDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  return { year: get("year"), month: get("month"), day: get("day") };
}

export function currentPeriod(now: Date = new Date()): Period {
  const today = manilaToday(now);
  return { year: today.year, month: today.month };
}

/** "2026-09", used as a stable key for a month. */
export function periodKey(period: Period): string {
  return `${period.year}-${String(period.month).padStart(2, "0")}`;
}

export function parsePeriodKey(key: string): Period | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** "September 2026" */
export function formatPeriod(period: Period): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(period.year, period.month - 1, 1)));
}

export function addMonths(period: Period, delta: number): Period {
  // Work in months-since-year-zero so December to January needs no special case.
  const total = period.year * 12 + (period.month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function daysInMonth(period: Period): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
}

/**
 * The actual date a bill falls due in a given month.
 *
 * A bill due on the 31st still has to fall due in February. Rather than skip
 * the month or spill into March, it lands on the last day of the month - which
 * is how a lender treats it too.
 */
export function dueDateInPeriod(dueDay: number, period: Period): CivilDate {
  const lastDay = daysInMonth(period);
  return {
    year: period.year,
    month: period.month,
    day: Math.min(Math.max(dueDay, 1), lastDay),
  };
}

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: CivilDate, to: CivilDate): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / 86_400_000);
}

export function compareCivilDates(a: CivilDate, b: CivilDate): number {
  return daysBetween(b, a);
}

/** "18 Sep 2026" from a date with no timezone. */
export function formatCivilDate(date: CivilDate): string {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
}

/** "2026-09-18", the form PostgreSQL wants for a date column. */
export function civilDateToISO(date: CivilDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function parseISODate(value: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = { year: Number(year), month: Number(month), day: Number(day) };
  if (date.month < 1 || date.month > 12) return null;
  if (date.day < 1 || date.day > daysInMonth(date)) return null;
  return date;
}

/** The Manila calendar date of a stored timestamp. */
export function civilDateFromTimestamp(value: string | Date): CivilDate {
  return manilaToday(typeof value === "string" ? new Date(value) : value);
}

/**
 * The UTC instants that bracket one Manila day.
 *
 * Needed to ask the database "what came in today?", because the rows carry UTC
 * timestamps while "today" is a Manila idea. Written as an offset string
 * rather than by subtracting eight hours, so the date library does the work.
 *
 * The Philippines has kept a fixed +08:00 with no daylight saving since 1978,
 * so the offset is safe to state outright.
 */
export function manilaDayRangeUtc(date: CivilDate): { from: string; to: string } {
  const start = new Date(`${civilDateToISO(date)}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** The UTC instants that bracket one Manila month. */
export function manilaMonthRangeUtc(period: Period): { from: string; to: string } {
  const start = new Date(`${periodKey(period)}-01T00:00:00+08:00`);
  const next = addMonths(period, 1);
  const end = new Date(`${periodKey(next)}-01T00:00:00+08:00`);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** The first day of a month, which is how a period is stored (a date column). */
export function periodToMonthStartISO(period: Period): string {
  return `${periodKey(period)}-01`;
}
