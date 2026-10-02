/**
 * Fixed monthly bills (spec 12.1).
 *
 * The shop pays around PHP 141,000 of bills every month, and the difference
 * between "due in 3 days" and "overdue by 2 days" is a late fee. So all of the
 * date reasoning lives here as plain functions - no database, no clock - and is
 * tested against the awkward cases: a bill due on the 31st in February, a
 * reminder that has to look into next month, and the Manila-versus-UTC date.
 */
import {
  addMonths,
  currentPeriod,
  daysBetween,
  dueDateInPeriod,
  formatCivilDate,
  formatPeriod,
  manilaToday,
  periodKey,
  type CivilDate,
  type Period,
} from "./period";
import { sumCentavos, type Centavos } from "./money";

/** Spec 12.1: the reminder covers anything due within this many days. */
export const REMINDER_DAYS = 5;

export type BillType = "operating" | "loan_installment";

/**
 * Whether a bill comes back every month or is owed once (the owner's request,
 * 2 Oct 2026). A one-time bill belongs to the single month in `startsMonth`.
 */
export type BillFrequency = "monthly" | "one_time";

/**
 * How far back an unpaid month is still carried forward. It matches the window
 * `getBillPayments` reads, so a month is never called unpaid merely because its
 * payment was outside what was fetched.
 */
export const CARRY_OVER_MONTHS = 12;

export interface Bill {
  id: string;
  name: string;
  amountCentavos: Centavos;
  /**
   * Day of the month it falls due, or null when the owner has not told us yet.
   * Null is a real state, not a mistake: the specification left the due days
   * open (17.13), so the screen asks for them rather than inventing one.
   */
  dueDay: number | null;
  type: BillType;
  /** Set when paying this bill also pays down a loan (spec 12.1). */
  loanId: string | null;
  active: boolean;
  frequency: BillFrequency;
  /**
   * The first month a monthly bill counts, or the one month a one-time bill
   * is for. Null only on a row written before 0029 that could not be dated -
   * such a bill counts every month and is never carried over, because a
   * backlog of unpaid months the owner never said existed would be invented.
   */
  startsMonth: Period | null;
}

function monthIndex(period: Period): number {
  return period.year * 12 + period.month - 1;
}

/** Whether a bill is owed at all in the given month. */
export function billAppliesTo(bill: Bill, period: Period): boolean {
  if (bill.startsMonth === null) return bill.frequency === "monthly";
  const diff = monthIndex(period) - monthIndex(bill.startsMonth);
  return bill.frequency === "one_time" ? diff === 0 : diff >= 0;
}

export type BillStatusKind =
  | "paid"
  | "due_day_not_set"
  | "not_yet_due"
  | "due_soon"
  | "due_today"
  | "overdue";

export interface BillStatus {
  kind: BillStatusKind;
  /** Ready to show, e.g. "Overdue 2 days". */
  label: string;
  tone: "success" | "neutral" | "attention";
  /**
   * Whether the label must be shown with a warning icon. Red is the Dabz brand
   * colour, so a warning can never rely on colour alone (spec 3.2).
   */
  warn: boolean;
  /** Negative when the due date has passed. Absent when no due day is set. */
  daysUntilDue?: number;
  dueDate?: CivilDate;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Works out how a bill stands in a given month.
 *
 * `paid` comes from the payment record for that exact month, so marking
 * September paid leaves October alone.
 */
export function billStatus(options: {
  dueDay: number | null;
  period: Period;
  paid: boolean;
  today?: CivilDate;
}): BillStatus {
  const { dueDay, period, paid } = options;
  const today = options.today ?? manilaToday();

  if (paid) {
    return { kind: "paid", label: "Paid", tone: "success", warn: false };
  }

  if (dueDay === null) {
    return {
      kind: "due_day_not_set",
      label: "Due day not set",
      tone: "attention",
      warn: true,
    };
  }

  const dueDate = dueDateInPeriod(dueDay, period);
  const daysUntilDue = daysBetween(today, dueDate);

  if (daysUntilDue < 0) {
    return {
      kind: "overdue",
      label: `Overdue ${plural(-daysUntilDue, "day")}`,
      tone: "attention",
      warn: true,
      daysUntilDue,
      dueDate,
    };
  }

  if (daysUntilDue === 0) {
    return {
      kind: "due_today",
      label: "Due today",
      tone: "attention",
      warn: true,
      daysUntilDue,
      dueDate,
    };
  }

  if (daysUntilDue <= REMINDER_DAYS) {
    return {
      kind: "due_soon",
      label: `Due in ${plural(daysUntilDue, "day")}`,
      tone: "attention",
      warn: true,
      daysUntilDue,
      dueDate,
    };
  }

  return {
    kind: "not_yet_due",
    label: `Not yet paid · due ${formatCivilDate(dueDate)}`,
    tone: "neutral",
    warn: false,
    daysUntilDue,
    dueDate,
  };
}

/** True for the statuses the reminder pop-up is about. */
export function needsAttention(status: BillStatus): boolean {
  return (
    status.kind === "overdue" ||
    status.kind === "due_today" ||
    status.kind === "due_soon"
  );
}

export interface BillForPeriod {
  bill: Bill;
  period: Period;
  status: BillStatus;
  /** What is still owed for that month, after any part payments. */
  remainingCentavos: Centavos;
}

/**
 * "billId:2026-09" -> the part payments of that month added up. Part payments
 * are kept apart from `paidKeys` because they do NOT settle a month - only
 * the owner saying "paid in full" does (0030).
 */
export type PartPaid = ReadonlyMap<string, Centavos>;

export function partPaidTotals(
  payments: readonly { key: string; amountCentavos: Centavos; isPartial: boolean }[],
): Map<string, Centavos> {
  const totals = new Map<string, Centavos>();
  for (const payment of payments) {
    if (!payment.isPartial) continue;
    totals.set(payment.key, (totals.get(payment.key) ?? 0) + payment.amountCentavos);
  }
  return totals;
}

/**
 * What is left to pay on a bill for one month: its amount less the part
 * payments, never below zero. A part payment larger than the usual amount
 * happens - electricity is never the same twice - and "owes -200" would be a
 * claim that the supplier owes the shop.
 */
export function remainingFor(
  bill: Bill,
  period: Period,
  partPaid: PartPaid = new Map(),
): Centavos {
  const part = partPaid.get(paidKey(bill.id, period)) ?? 0;
  return Math.max(bill.amountCentavos - part, 0);
}

/**
 * The bills the 5-day reminder should list (spec 12.1).
 *
 * It looks into next month as well, because on 29 September a bill due on
 * 2 October is four days away and wanting attention.
 *
 * Each bill appears at most once. If this month's instance is already overdue
 * AND next month's is due soon, showing both would just be noise - so the
 * current month wins, being the more urgent of the two.
 */
export function billsNeedingAttention(options: {
  bills: readonly Bill[];
  /** "billId:2026-09" for every month already marked paid. */
  paidKeys: ReadonlySet<string>;
  partPaid?: PartPaid;
  period?: Period;
  today?: CivilDate;
}): BillForPeriod[] {
  const today = options.today ?? manilaToday();
  const period = options.period ?? { year: today.year, month: today.month };
  const partPaid = options.partPaid ?? new Map<string, Centavos>();
  const nextPeriod = addMonths(period, 1);

  const results: BillForPeriod[] = [];

  // Months that have ended and were never paid come first: they are the most
  // overdue of all. One entry per bill - the oldest unpaid month.
  const carried = carriedOverBills({
    bills: options.bills,
    paidKeys: options.paidKeys,
    partPaid,
    period,
    today,
  });
  const alreadyListed = new Set<string>();
  for (const entry of carried) {
    if (alreadyListed.has(entry.bill.id)) continue;
    alreadyListed.add(entry.bill.id);
    results.push(entry);
  }

  for (const bill of options.bills) {
    if (!bill.active || alreadyListed.has(bill.id)) continue;

    const thisMonth = billStatus({
      dueDay: bill.dueDay,
      period,
      paid: options.paidKeys.has(paidKey(bill.id, period)),
      today,
    });

    if (billAppliesTo(bill, period) && needsAttention(thisMonth)) {
      results.push({
        bill,
        period,
        status: thisMonth,
        remainingCentavos: remainingFor(bill, period, partPaid),
      });
      continue;
    }

    if (!billAppliesTo(bill, nextPeriod)) continue;

    const nextMonth = billStatus({
      dueDay: bill.dueDay,
      period: nextPeriod,
      paid: options.paidKeys.has(paidKey(bill.id, nextPeriod)),
      today,
    });

    if (needsAttention(nextMonth)) {
      results.push({
        bill,
        period: nextPeriod,
        status: nextMonth,
        remainingCentavos: remainingFor(bill, nextPeriod, partPaid),
      });
    }
  }

  // Most urgent first: the longest overdue at the top, then due today, then by
  // how soon. A bill with no due day sorts last; it needs an answer, not money.
  return results.sort(
    (a, b) => (a.status.daysUntilDue ?? 9_999) - (b.status.daysUntilDue ?? 9_999),
  );
}

/**
 * Bills from months that have already ENDED and were never marked paid, to be
 * shown again in `period` (the owner's request, 2 Oct 2026: "add bills that
 * are not paid for last month in the next month bills").
 *
 * Every unpaid earlier month is carried, not only last month: a bill unpaid
 * since August is still owed in October, and dropping it after one month would
 * make a debt disappear from the screen while it is still owed. Each month is
 * its own entry because each is paid on its own - marking one paid writes the
 * payment against THAT month, so the month's own record stays right.
 *
 * Only months before both `period` and today's month count. Looking at
 * November from 2 October must not call October "unpaid from last month" -
 * October has not finished.
 *
 * Oldest first.
 */
export function carriedOverBills(options: {
  bills: readonly Bill[];
  paidKeys: ReadonlySet<string>;
  partPaid?: PartPaid;
  period: Period;
  today?: CivilDate;
}): BillForPeriod[] {
  const today = options.today ?? manilaToday();
  const thisMonth = { year: today.year, month: today.month };
  const before = Math.min(monthIndex(options.period), monthIndex(thisMonth));

  const results: BillForPeriod[] = [];

  for (const bill of options.bills) {
    if (!bill.active || bill.startsMonth === null) continue;

    const earliest = Math.max(
      monthIndex(bill.startsMonth),
      monthIndex(options.period) - CARRY_OVER_MONTHS,
    );

    for (let index = earliest; index < before; index += 1) {
      const period = { year: Math.floor(index / 12), month: (index % 12) + 1 };
      if (!billAppliesTo(bill, period)) continue;
      if (options.paidKeys.has(paidKey(bill.id, period))) continue;
      results.push({
        bill,
        period,
        status: carriedOverStatus(bill, period, today),
        remainingCentavos: remainingFor(bill, period, options.partPaid),
      });
    }
  }

  return results.sort(
    (a, b) =>
      monthIndex(a.period) - monthIndex(b.period) ||
      (a.status.daysUntilDue ?? 0) - (b.status.daysUntilDue ?? 0) ||
      a.bill.name.localeCompare(b.bill.name),
  );
}

/**
 * How an unpaid bill from a finished month reads. Always overdue: the month is
 * over. With no due day the count runs from the month's last day - the latest
 * it could possibly have been due - so the figure is never larger than true.
 */
function carriedOverStatus(bill: Bill, period: Period, today: CivilDate): BillStatus {
  const dueDate = dueDateInPeriod(bill.dueDay ?? 31, period);
  const daysUntilDue = Math.min(daysBetween(today, dueDate), -1);
  return {
    kind: "overdue",
    label: `Unpaid from ${formatPeriod(period)} · overdue ${plural(-daysUntilDue, "day")}`,
    tone: "attention",
    warn: true,
    daysUntilDue,
    dueDate,
  };
}

/**
 * The order bills are listed in: by the date they fall due that month,
 * earliest first (the owner's request, 2 Oct 2026). A bill with no due day
 * goes last - it has no place in the calendar until the owner gives it one.
 * Ties go by name so the list does not shuffle between visits.
 */
export function compareByDueDate(a: Bill, b: Bill): number {
  return (
    (a.dueDay ?? 99) - (b.dueDay ?? 99) || a.name.localeCompare(b.name)
  );
}

/** The key that ties a bill to one particular month. */
export function paidKey(billId: string, period: Period): string {
  return `${billId}:${periodKey(period)}`;
}

export interface MonthTotals {
  total: Centavos;
  paid: Centavos;
  unpaid: Centavos;
  paidCount: number;
  unpaidCount: number;
  /** Unpaid and either overdue or due within 5 days. */
  attentionCount: number;
  /** Bills the owner has not given a due day for yet. */
  missingDueDayCount: number;
  /**
   * Unpaid bills from months that have ended, carried into this one. Kept
   * apart from `unpaid` so "this month's bills" still means this month's.
   */
  carriedOver: Centavos;
  carriedOverCount: number;
}

export function monthTotals(options: {
  bills: readonly Bill[];
  paidKeys: ReadonlySet<string>;
  partPaid?: PartPaid;
  period: Period;
  today?: CivilDate;
}): MonthTotals {
  const today = options.today ?? manilaToday();
  const active = options.bills.filter(
    (bill) => bill.active && billAppliesTo(bill, options.period),
  );

  const paidAmounts: Centavos[] = [];
  const unpaidAmounts: Centavos[] = [];
  let attentionCount = 0;
  let missingDueDayCount = 0;

  for (const bill of active) {
    const paid = options.paidKeys.has(paidKey(bill.id, options.period));
    const status = billStatus({
      dueDay: bill.dueDay,
      period: options.period,
      paid,
      today,
    });

    if (paid) {
      paidAmounts.push(bill.amountCentavos);
    } else {
      // A part payment is money already paid; only the rest is still owed.
      const remaining = remainingFor(bill, options.period, options.partPaid);
      paidAmounts.push(bill.amountCentavos - remaining);
      unpaidAmounts.push(remaining);
    }

    if (needsAttention(status)) attentionCount += 1;
    if (status.kind === "due_day_not_set") missingDueDayCount += 1;
  }

  const paid = sumCentavos(paidAmounts);
  const unpaid = sumCentavos(unpaidAmounts);
  const carried = carriedOverBills(options);

  return {
    total: paid + unpaid,
    paid,
    unpaid,
    paidCount: active.length - unpaidAmounts.length,
    unpaidCount: unpaidAmounts.length,
    attentionCount: attentionCount + carried.length,
    missingDueDayCount,
    carriedOver: sumCentavos(carried.map((entry) => entry.remainingCentavos)),
    carriedOverCount: carried.length,
  };
}

/**
 * Which loan, if any, a bill should be tied to.
 *
 * Paying a linked bill also pays down its loan - `mark_bill_paid` writes both
 * in one transaction (spec 12.1). That link used to exist only on the seeded
 * bills, so when the seeds were cleared and the owner typed their own in,
 * "Loan installment" became a label that did nothing: the money left the
 * ledger every month and the loan balance never moved. There was no warning,
 * because nothing was wrong as far as the system could tell.
 *
 * So the link is now chosen on the form, and this is the rule the form and the
 * action share. The half worth being careful about is the second one: changing
 * a bill back to an operating cost has to CLEAR the link, or a bill that no
 * longer claims to be an installment keeps quietly paying one down.
 */
export function billLoanLink(
  type: BillType,
  loanId: string | null | undefined,
): string | null {
  if (type !== "loan_installment") return null;
  const trimmed = (loanId ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Total of every active bill owed in `period`, used for the daily target
 * (spec 12.3). A one-time bill counts in its own month only - spreading it
 * over every month would raise the target for ever after it was paid.
 */
export function totalMonthlyBills(
  bills: readonly Bill[],
  period: Period = currentPeriod(),
): Centavos {
  return sumCentavos(
    bills
      .filter((bill) => bill.active && billAppliesTo(bill, period))
      .map((bill) => bill.amountCentavos),
  );
}
