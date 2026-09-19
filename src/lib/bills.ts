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
  daysBetween,
  dueDateInPeriod,
  formatCivilDate,
  manilaToday,
  periodKey,
  type CivilDate,
  type Period,
} from "./period";
import { sumCentavos, type Centavos } from "./money";

/** Spec 12.1: the reminder covers anything due within this many days. */
export const REMINDER_DAYS = 5;

export type BillType = "operating" | "loan_installment";

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
  period?: Period;
  today?: CivilDate;
}): BillForPeriod[] {
  const today = options.today ?? manilaToday();
  const period = options.period ?? { year: today.year, month: today.month };
  const nextPeriod = addMonths(period, 1);

  const results: BillForPeriod[] = [];

  for (const bill of options.bills) {
    if (!bill.active) continue;

    const thisMonth = billStatus({
      dueDay: bill.dueDay,
      period,
      paid: options.paidKeys.has(paidKey(bill.id, period)),
      today,
    });

    if (needsAttention(thisMonth)) {
      results.push({ bill, period, status: thisMonth });
      continue;
    }

    const nextMonth = billStatus({
      dueDay: bill.dueDay,
      period: nextPeriod,
      paid: options.paidKeys.has(paidKey(bill.id, nextPeriod)),
      today,
    });

    if (needsAttention(nextMonth)) {
      results.push({ bill, period: nextPeriod, status: nextMonth });
    }
  }

  // Most urgent first: the longest overdue at the top, then due today, then by
  // how soon. A bill with no due day sorts last; it needs an answer, not money.
  return results.sort(
    (a, b) => (a.status.daysUntilDue ?? 9_999) - (b.status.daysUntilDue ?? 9_999),
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
}

export function monthTotals(options: {
  bills: readonly Bill[];
  paidKeys: ReadonlySet<string>;
  period: Period;
  today?: CivilDate;
}): MonthTotals {
  const today = options.today ?? manilaToday();
  const active = options.bills.filter((bill) => bill.active);

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

    if (paid) paidAmounts.push(bill.amountCentavos);
    else unpaidAmounts.push(bill.amountCentavos);

    if (needsAttention(status)) attentionCount += 1;
    if (status.kind === "due_day_not_set") missingDueDayCount += 1;
  }

  const paid = sumCentavos(paidAmounts);
  const unpaid = sumCentavos(unpaidAmounts);

  return {
    total: paid + unpaid,
    paid,
    unpaid,
    paidCount: paidAmounts.length,
    unpaidCount: unpaidAmounts.length,
    attentionCount,
    missingDueDayCount,
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

/** Total of every active bill, used for the daily target (spec 12.3). */
export function totalMonthlyBills(bills: readonly Bill[]): Centavos {
  return sumCentavos(
    bills.filter((bill) => bill.active).map((bill) => bill.amountCentavos),
  );
}
