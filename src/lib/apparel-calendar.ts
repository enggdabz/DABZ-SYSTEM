/**
 * The Dabz Apparel production calendar (spec 8).
 *
 * WHAT THE OWNER ASKED FOR (21 September 2026)
 *
 *   "A calendar of all projects in Dabz Apparel. Make it minus one day from
 *    the original due date. And if it is not finished, put it in the next day
 *    but assign it as a priority project."
 *
 * So there are two dates on every order and they are not the same thing:
 *
 *   the PROMISED date  - what the customer was told, stored on the order;
 *   the TARGET date    - one day earlier, which is when the shop means to be
 *                        finished, so there is a day in hand when the layout
 *                        comes back wrong or the fabric runs short.
 *
 * The target is the one this calendar plans against. The promised date is
 * never moved, because it is a promise to somebody.
 *
 * THE ROLL-FORWARD RULE
 *
 * A target day that ends with the work unfinished does not simply pass. The
 * order moves to the next day and is marked PRIORITY - and if that day passes
 * too it moves again, which is why an order three days late is sitting on
 * today rather than gathering dust on the square it missed. Written as one
 * step it is "put it in the next day"; applied every day since, it lands on
 * today, which is the only square anybody can still act on.
 *
 * NOTHING HERE IS STORED. There is no calendar table and no nightly job that
 * moves orders along: the schedule is worked out from the order's own promised
 * date and status every time the screen is opened, the same rule as reports in
 * Phase 8 and a payslip's total in Phase 3. A stored "scheduled day" and a
 * promised date can disagree, and then nothing says which one is lying - and a
 * shop that never opened the screen on Tuesday would find Tuesday's work had
 * never been carried forward.
 */
import { isOpenOrder, type OrderStatus } from "./apparel";
import {
  addDays,
  civilDateToISO,
  daysBetween,
  daysInMonth,
  parseISODate,
  startOfWeek,
  type CivilDate,
  type Period,
  type WeekStart,
} from "./period";

/**
 * How many days before the promised date the shop aims to be finished.
 *
 * One, because the owner said one. It is a constant rather than a setting
 * because it is the owner's own stated working rule and not a figure only
 * they can know - and a constant in one place is one edit if the rule changes.
 */
export const PRODUCTION_LEAD_DAYS = 1;

/**
 * Whether the making is done.
 *
 * "Ready for pickup" counts: the jerseys exist, and whether the customer has
 * come for them is a different question from whether the shop still owes
 * anybody work. "Released" counts for the same reason. Everything before that
 * is still work on the bench.
 *
 * A cancelled order is not finished - it is not work at all - and is kept off
 * the calendar entirely by `buildCalendar`.
 */
export function isProductionDone(status: OrderStatus): boolean {
  return status === "ready" || status === "released";
}

/** What the calendar needs to know about an order. */
export interface CalendarOrder {
  id: string;
  orderNumber: string;
  teamName: string | null;
  customerName: string | null;
  status: OrderStatus;
  /** What the customer was told. Null when nobody has promised a date. */
  promisedOn: string | null;
  itemCount: number;
  totalCentavos: number;
  balanceCentavos: number;
}

/** Why an order is on the day it is on. */
export type ScheduleReason =
  /** On its target day, which has not passed. */
  | "on_target"
  /** Finished, sitting on the target day it was made for. */
  | "done"
  /** The target day passed with work left, so it has been carried forward. */
  | "rolled"
  /** No promised date, so there is no target and no square to sit on. */
  | "no_promised_date";

export interface ScheduledProject extends CalendarOrder {
  /** Promised date less the lead days. Null when no date was promised. */
  targetOn: string | null;
  /** The day it actually occupies on the calendar. Null when unscheduled. */
  scheduledOn: string | null;
  reason: ScheduleReason;
  /** Carried forward from a target day that passed with work left. */
  priority: boolean;
  /** How many days it has been carried. Zero unless `priority`. */
  rolledDays: number;
  /** The customer's own date has passed, not just the shop's target. */
  pastPromised: boolean;
  done: boolean;
}

/**
 * Where one order sits, and why.
 *
 * `today` is a Manila date (`manilaToday`), never a UTC one - a calendar in
 * San Carlos City that rolls work forward at 8am local because UTC has ticked
 * over would move an order a day early, every day.
 */
export function scheduleProject(options: {
  order: CalendarOrder;
  today: CivilDate;
}): ScheduledProject {
  const { order } = options;
  const today = civilDateToISO(options.today);
  const done = isProductionDone(order.status);

  const promised = order.promisedOn ? parseISODate(order.promisedOn) : null;

  /*
    A missing promised date stays missing. Putting an undated order on today,
    or a fortnight out, would be the system inventing the one figure on this
    screen it cannot know - and an invented date on a calendar gets worked to.
    It goes in the unscheduled list instead, where it asks for a date.
  */
  if (!promised) {
    return {
      ...order,
      targetOn: null,
      scheduledOn: null,
      reason: "no_promised_date",
      priority: false,
      rolledDays: 0,
      pastPromised: false,
      done,
    };
  }

  const target = addDays(promised, -PRODUCTION_LEAD_DAYS);
  const targetOn = civilDateToISO(target);
  const daysLate = daysBetween(target, options.today);
  const pastPromised = !done && daysBetween(promised, options.today) > 0;

  // Finished work stays on the day it was made for. There is no "finished on"
  // date recorded anywhere, so moving it to today would be a guess, and the
  // target day is the honest answer to "when was this due off the bench?".
  if (done) {
    return {
      ...order,
      targetOn,
      scheduledOn: targetOn,
      reason: "done",
      priority: false,
      rolledDays: 0,
      pastPromised: false,
      done,
    };
  }

  // The target day has not arrived, or is today and still has hours left in
  // it. Either way nothing has been missed yet.
  if (daysLate <= 0) {
    return {
      ...order,
      targetOn,
      scheduledOn: targetOn,
      reason: "on_target",
      priority: false,
      rolledDays: 0,
      pastPromised,
      done,
    };
  }

  return {
    ...order,
    targetOn,
    scheduledOn: today,
    reason: "rolled",
    priority: true,
    rolledDays: daysLate,
    pastPromised,
    done,
  };
}

/**
 * The order projects are read in within a day.
 *
 * Priority first, longest-carried at the top - that is the whole point of
 * marking them - then by the customer's promised date, then by order number so
 * two orders promised the same day never swap places between two page loads.
 */
export function compareProjects(a: ScheduledProject, b: ScheduledProject): number {
  if (a.priority !== b.priority) return a.priority ? -1 : 1;
  if (a.rolledDays !== b.rolledDays) return b.rolledDays - a.rolledDays;

  const promisedA = a.promisedOn ?? "";
  const promisedB = b.promisedOn ?? "";
  if (promisedA !== promisedB) return promisedA < promisedB ? -1 : 1;

  return a.orderNumber < b.orderNumber ? -1 : a.orderNumber > b.orderNumber ? 1 : 0;
}

export interface CalendarDay {
  date: string;
  day: number;
  /** False for the days either side that only fill the grid out. */
  inMonth: boolean;
  isToday: boolean;
  projects: ScheduledProject[];
}

export interface ApparelCalendar {
  period: Period;
  /** Whole weeks, starting on the shop's own first day of the week. */
  weeks: CalendarDay[][];
  /** Everything carried forward, as of today - wherever its month is. */
  priority: ScheduledProject[];
  /** Orders with no promised date, which cannot be placed at all. */
  unscheduled: ScheduledProject[];
  /** Open orders whose target day falls in this month. */
  scheduledThisMonth: number;
}

/**
 * The month, as a grid of whole weeks.
 *
 * The grid starts on whichever day the shop counts a week from (the same
 * setting payroll uses), so the calendar reads the way the wall one does.
 */
export function buildCalendar(options: {
  orders: readonly CalendarOrder[];
  period: Period;
  today: CivilDate;
  weekStartsOn: WeekStart;
}): ApparelCalendar {
  const { period, today, weekStartsOn } = options;
  const todayISO = civilDateToISO(today);

  const projects = options.orders
    // A cancelled order is not work, so it is not on the production calendar.
    // It is not deleted either - it stays on the Apparel screen with its
    // reason, because the customer may be holding the job order sheet.
    .filter((order) => order.status !== "cancelled")
    .map((order) => scheduleProject({ order, today }));

  const byDay = new Map<string, ScheduledProject[]>();
  for (const project of projects) {
    if (!project.scheduledOn) continue;
    const bucket = byDay.get(project.scheduledOn) ?? [];
    bucket.push(project);
    byDay.set(project.scheduledOn, bucket);
  }
  for (const bucket of byDay.values()) bucket.sort(compareProjects);

  const firstOfMonth: CivilDate = { year: period.year, month: period.month, day: 1 };
  const lastOfMonth: CivilDate = {
    year: period.year,
    month: period.month,
    day: daysInMonth(period),
  };

  const gridStart = startOfWeek(firstOfMonth, weekStartsOn);
  // Whole weeks: run to the end of the week the last of the month falls in.
  const gridEnd = addDays(startOfWeek(lastOfMonth, weekStartsOn), 6);
  const span = daysBetween(gridStart, gridEnd) + 1;

  const weeks: CalendarDay[][] = [];
  for (let index = 0; index < span; index += 1) {
    const date = addDays(gridStart, index);
    const iso = civilDateToISO(date);

    const cell: CalendarDay = {
      date: iso,
      day: date.day,
      inMonth: date.year === period.year && date.month === period.month,
      isToday: iso === todayISO,
      projects: byDay.get(iso) ?? [],
    };

    if (index % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(cell);
  }

  return {
    period,
    weeks,
    priority: projects.filter((project) => project.priority).sort(compareProjects),
    unscheduled: projects
      .filter(
        (project) =>
          project.reason === "no_promised_date" && isOpenOrder(project.status),
      )
      .sort(compareProjects),
    scheduledThisMonth: projects.filter(
      (project) =>
        !project.done &&
        project.targetOn !== null &&
        project.targetOn.startsWith(
          `${period.year}-${String(period.month).padStart(2, "0")}`,
        ),
    ).length,
  };
}

/** What to call a project on the calendar. The team is what the shop says. */
export function projectLabel(project: Pick<CalendarOrder, "teamName" | "orderNumber">): string {
  return project.teamName ?? project.orderNumber;
}

/**
 * The one line under a project saying where it stands.
 *
 * Every priority line carries the word as well as the colour, because red is
 * the brand colour here and a red chip on its own reads as a button.
 */
export function scheduleNote(project: ScheduledProject): string {
  switch (project.reason) {
    case "rolled":
      return project.rolledDays === 1
        ? "Carried over from yesterday"
        : `Carried over ${project.rolledDays} days`;
    case "done":
      return "Finished";
    case "no_promised_date":
      return "No promised date";
    case "on_target":
      return "On target";
  }
}
