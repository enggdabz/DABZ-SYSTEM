/**
 * Shop expenses (spec 11) and what the owner still owes suppliers.
 *
 * The expense pop-up exists because of one number in the specification: an
 * expense should take under ten seconds to record. Anything slower and it gets
 * written on a scrap of paper "for later", and later never comes - so the
 * month's costs end up lower than they really were, and the shop looks more
 * profitable than it is.
 *
 * Hence quick picks: a named button that already knows the category, the
 * division and (if the owner set one) the usual amount, so a purchase is two
 * taps and a number.
 */
import type { ExpenseTag } from "./divisions";
import {
  CATEGORY_LABELS,
  type ExpenseCategory,
  type LedgerCategory,
  type MoneySource,
} from "./ledger";
import type { Centavos } from "./money";

export interface ExpensePreset {
  id: string;
  label: string;
  category: ExpenseCategory;
  tag: ExpenseTag;
  /** The usual amount, when there is one. Null means "ask me every time". */
  defaultAmountCentavos: Centavos | null;
  supplierId: string | null;
  sortOrder: number;
  active: boolean;
}

export const EXPENSE_STATUSES = ["approved", "pending", "rejected"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export interface ExpenseRow {
  id: string;
  occurredAt: string;
  spentOn: string;
  amountCentavos: Centavos;
  category: LedgerCategory;
  tag: ExpenseTag;
  source: MoneySource;
  supplierId: string | null;
  note: string | null;
  status: ExpenseStatus;
  createdBy: string | null;
  createdByName: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Set once the money has actually been written to the ledger. */
  ledgerEntryId: string | null;
}

export interface ExpenseStatusDescription {
  label: string;
  /** True when the entry is waiting on the owner and no money has moved yet. */
  waiting: boolean;
  warn: boolean;
}

export function describeExpenseStatus(
  status: ExpenseStatus,
): ExpenseStatusDescription {
  switch (status) {
    case "pending":
      return { label: "Waiting for approval", waiting: true, warn: true };
    case "rejected":
      return { label: "Not approved", waiting: false, warn: true };
    default:
      return { label: "Recorded", waiting: false, warn: false };
  }
}

/**
 * A staff member's expense above the shop limit waits for the owner (spec 4.3).
 *
 * Owner and Admin are never held up by their own limit - the limit exists so
 * the owner finds out about a large purchase, and they are the owner.
 */
export function expenseStatusFor(options: {
  isOwnerOrAdmin: boolean;
  amountCentavos: Centavos;
  staffExpenseApprovalLimitCentavos: Centavos;
}): ExpenseStatus {
  if (options.isOwnerOrAdmin) return "approved";
  return options.amountCentavos > options.staffExpenseApprovalLimitCentavos
    ? "pending"
    : "approved";
}

/** One line of plain language for the person about to press the button. */
export function describeApprovalRule(options: {
  isOwnerOrAdmin: boolean;
  staffExpenseApprovalLimitCentavos: Centavos;
  formatAmount: (amount: Centavos) => string;
}): string | null {
  if (options.isOwnerOrAdmin) return null;
  return `Anything above ${options.formatAmount(
    options.staffExpenseApprovalLimitCentavos,
  )} is saved and waits for the owner before the money is counted.`;
}

export interface ExpenseTotals {
  /** Money actually spent: approved entries only. */
  spentCentavos: Centavos;
  /** Sitting in the queue, not yet counted anywhere. */
  pendingCentavos: Centavos;
  pendingCount: number;
}

export function expenseTotals(
  expenses: readonly Pick<ExpenseRow, "amountCentavos" | "status">[],
): ExpenseTotals {
  let spentCentavos = 0;
  let pendingCentavos = 0;
  let pendingCount = 0;

  for (const expense of expenses) {
    if (expense.status === "approved") spentCentavos += expense.amountCentavos;
    else if (expense.status === "pending") {
      pendingCentavos += expense.amountCentavos;
      pendingCount += 1;
    }
  }

  return { spentCentavos, pendingCentavos, pendingCount };
}

// ---------------------------------------------------------------------------
// Supplier payables (received, not yet paid)
// ---------------------------------------------------------------------------

export interface Supplier {
  id: string;
  name: string;
  contactNumber: string | null;
  address: string | null;
  note: string | null;
  active: boolean;
}

export interface Payable {
  id: string;
  supplierId: string | null;
  supplierName: string | null;
  description: string;
  amountCentavos: Centavos;
  receivedOn: string;
  /** Null is a real state: the supplier may not have given a term. */
  dueOn: string | null;
  status: "unpaid" | "paid";
  paidOn: string | null;
  note: string | null;
}

export interface PayableStatus {
  kind: "paid" | "overdue" | "due_today" | "due_soon" | "unpaid" | "no_due_date";
  label: string;
  warn: boolean;
}

/** How many days ahead counts as "due soon", matching the bill reminder. */
export const PAYABLE_REMINDER_DAYS = 5;

export function payableStatus(
  payable: Pick<Payable, "status" | "dueOn">,
  today: string,
): PayableStatus {
  if (payable.status === "paid") {
    return { kind: "paid", label: "Paid", warn: false };
  }

  if (!payable.dueOn) {
    // Not a default. The supplier may genuinely not have given a term, and a
    // made-up due date would raise confident, wrong warnings.
    return { kind: "no_due_date", label: "No due date set", warn: true };
  }

  const days = daysBetweenISO(today, payable.dueOn);

  if (days < 0) {
    const late = Math.abs(days);
    return {
      kind: "overdue",
      label: `Overdue ${late} day${late === 1 ? "" : "s"}`,
      warn: true,
    };
  }
  if (days === 0) return { kind: "due_today", label: "Due today", warn: true };
  if (days <= PAYABLE_REMINDER_DAYS) {
    return { kind: "due_soon", label: `Due in ${days} days`, warn: true };
  }

  return { kind: "unpaid", label: "Not yet paid", warn: false };
}

/**
 * Whole days from one Manila date to another, both written as YYYY-MM-DD.
 *
 * Built from the date parts rather than by subtracting timestamps, so a
 * daylight-saving jump somewhere else in the world cannot shift the answer.
 */
function daysBetweenISO(from: string, to: string): number {
  const start = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  const end = Date.UTC(
    Number(to.slice(0, 4)),
    Number(to.slice(5, 7)) - 1,
    Number(to.slice(8, 10)),
  );
  return Math.round((end - start) / 86_400_000);
}

export interface PayableTotals {
  unpaidCentavos: Centavos;
  unpaidCount: number;
  needingAttentionCount: number;
}

export function payableTotals(
  payables: readonly Payable[],
  today: string,
): PayableTotals {
  let unpaidCentavos = 0;
  let unpaidCount = 0;
  let needingAttentionCount = 0;

  for (const payable of payables) {
    if (payable.status !== "unpaid") continue;
    unpaidCentavos += payable.amountCentavos;
    unpaidCount += 1;
    if (payableStatus(payable, today).warn) needingAttentionCount += 1;
  }

  return { unpaidCentavos, unpaidCount, needingAttentionCount };
}

/** For the pop-up's category list, in the order a shop actually uses them. */
export const QUICK_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "materials_supplies",
  "meals_snacks",
  "fuel_transportation",
  "delivery_shipping",
  "machine_maintenance",
  "new_equipment",
  "meta_ads",
  "miscellaneous",
];

export function expenseCategoryLabel(category: LedgerCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}
