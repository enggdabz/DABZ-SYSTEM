/**
 * The money in / money out ledger (spec 10).
 *
 * One list holds every peso that moves. Most entries are created automatically
 * by other parts of the system - marking a bill paid, marking payroll paid,
 * recording a sale - so nothing is ever typed twice (spec 10.4).
 *
 * THE RULE THAT MATTERS MOST
 * Borrowed money is not income. When the shop takes a PHP 100,000 loan, that is
 * PHP 100,000 in the drawer, but it is not a good month - it is a bigger debt.
 * The same goes for the owner putting his own money in. Counting either as
 * sales would make a struggling month look profitable, which is exactly the
 * mistake this system exists to prevent.
 */
import type { ExpenseTag } from "./divisions";
import { sumCentavos, type Centavos } from "./money";

export type LedgerDirection = "in" | "out";

/** Where the money physically came from or went (spec 10.3). */
export const MONEY_SOURCES = [
  "cash_drawer",
  "gcash",
  "bank",
  "owners_pocket",
] as const;
export type MoneySource = (typeof MONEY_SOURCES)[number];

export const MONEY_SOURCE_LABELS: Record<MoneySource, string> = {
  cash_drawer: "Cash drawer",
  gcash: "GCash",
  bank: "Bank",
  owners_pocket: "Owner's pocket",
};

// ---------------------------------------------------------------------------
// Money in (spec 10.1)
// ---------------------------------------------------------------------------

export const INCOME_CATEGORIES = [
  // Dabz Printshoppe
  "document_printing",
  "photocopy",
  "lamination",
  "tarpaulin",
  "stickers",
  "mugs_souvenirs",
  "other_print_jobs",
  // Dabz Apparel
  "sublimation_jerseys",
  "shirts",
  "jackets",
  "long_sleeves",
  "dtf_prints",
  // DabzTech Solutions
  "epson_printer_repair",
  "laptop_repair",
  "desktop_repair",
  "checking_fee",
  "parts_sold",
  // Money in, but NOT income
  "loan_proceeds",
  "owner_capital",
] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

/**
 * Money that arrives but is not earnings (spec 10.1).
 * Tracked separately and never counted as sales.
 */
export const NON_INCOME_CATEGORIES: readonly IncomeCategory[] = [
  "loan_proceeds",
  "owner_capital",
];

// ---------------------------------------------------------------------------
// Money out (spec 10.2)
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  "materials_supplies",
  "fixed_bills",
  "loan_payments",
  "salaries",
  "cash_advances",
  "delivery_shipping",
  "fuel_transportation",
  "machine_maintenance",
  "meta_ads",
  "new_equipment",
  "meals_snacks",
  "miscellaneous",
  // Money out, but not a cost of running the shop
  "owner_withdrawal",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** The owner taking money out is shown apart from shop costs (spec 10.2). */
export const NON_EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  "owner_withdrawal",
];

export type LedgerCategory = IncomeCategory | ExpenseCategory;

export const CATEGORY_LABELS: Record<LedgerCategory, string> = {
  document_printing: "Document printing",
  photocopy: "Photocopy",
  lamination: "Lamination",
  tarpaulin: "Tarpaulin",
  stickers: "Stickers",
  mugs_souvenirs: "Mugs & souvenirs",
  other_print_jobs: "Other print jobs",
  sublimation_jerseys: "Sublimation jerseys",
  shirts: "Shirts",
  jackets: "Jackets",
  long_sleeves: "Long sleeves",
  dtf_prints: "DTF prints",
  epson_printer_repair: "Epson printer repair",
  laptop_repair: "Laptop repair",
  desktop_repair: "Desktop repair",
  checking_fee: "Checking / diagnostic fee",
  parts_sold: "Parts sold",
  loan_proceeds: "Loan proceeds (borrowed money)",
  owner_capital: "Owner capital added",

  materials_supplies: "Materials & supplies",
  fixed_bills: "Fixed bills",
  loan_payments: "Loan payments",
  salaries: "Salaries",
  cash_advances: "Cash advances",
  delivery_shipping: "Delivery & shipping",
  fuel_transportation: "Fuel & transportation",
  machine_maintenance: "Machine maintenance & repair",
  meta_ads: "Meta ads",
  new_equipment: "New equipment",
  meals_snacks: "Meals & snacks",
  miscellaneous: "Miscellaneous",
  owner_withdrawal: "Owner withdrawal",
};

export interface LedgerEntry {
  id: string;
  occurredAt: string;
  direction: LedgerDirection;
  amountCentavos: Centavos;
  /** Which division, or the whole shop for shared costs. */
  tag: ExpenseTag;
  category: LedgerCategory;
  source: MoneySource;
  note: string | null;
  /** Set when another module created this entry (spec 10.4). */
  sourceTable: string | null;
  sourceId: string | null;
}

/** Is this money in that counts as earnings? */
export function countsAsIncome(entry: {
  direction: LedgerDirection;
  category: LedgerCategory;
}): boolean {
  if (entry.direction !== "in") return false;
  return !NON_INCOME_CATEGORIES.includes(entry.category as IncomeCategory);
}

/** Is this money out that counts as a cost of running the shop? */
export function countsAsShopExpense(entry: {
  direction: LedgerDirection;
  category: LedgerCategory;
}): boolean {
  if (entry.direction !== "out") return false;
  return !NON_EXPENSE_CATEGORIES.includes(entry.category as ExpenseCategory);
}

/**
 * The costs the daily target has NOT already accounted for.
 *
 * The daily target is (monthly bills + monthly payroll) / working days: it is
 * what the shop must clear to cover those two things. So subtracting a bill
 * payment or a wage from the day's takings would count them twice - once in
 * the target and once against it - and the shop would look as though it never
 * got anywhere.
 *
 * What the target does NOT include is the cost of doing the work: paper, ink,
 * vinyl, fuel, a meal for whoever stayed late. Those come out of the takings
 * before anything reaches the bills, which is exactly why the target is a
 * profit figure rather than a sales figure (spec 12.3).
 */
export const DAILY_TARGET_COVERS: readonly ExpenseCategory[] = [
  "fixed_bills",
  "loan_payments",
  "salaries",
  // An advance is next payday's wage handed over early, not an extra cost.
  "cash_advances",
];

/** Does this money out come off today's progress toward the daily target? */
export function countsAgainstDailyTarget(entry: {
  direction: LedgerDirection;
  category: LedgerCategory;
}): boolean {
  if (!countsAsShopExpense(entry)) return false;
  return !DAILY_TARGET_COVERS.includes(entry.category as ExpenseCategory);
}

export interface LedgerTotals {
  /** Earnings only - excludes borrowed money and owner capital. */
  income: Centavos;
  /** Costs of running the shop - excludes owner withdrawals. */
  expenses: Centavos;
  /** income - expenses. */
  profit: Centavos;
  /** Money in that is not income, kept visible but separate. */
  nonIncomeIn: Centavos;
  /** Money out that is not a shop cost (owner withdrawals). */
  ownerWithdrawals: Centavos;
  /** Everything that actually moved, whatever it was for. */
  totalIn: Centavos;
  totalOut: Centavos;
  /**
   * Costs the daily target has not already covered - materials, fuel, meals.
   * Income less this is real progress toward the target (spec 12.3).
   */
  targetCosts: Centavos;
  /** income - targetCosts. What the daily target is measured against. */
  towardTarget: Centavos;
}

export function totalsFor(entries: readonly LedgerEntry[]): LedgerTotals {
  const income: Centavos[] = [];
  const expenses: Centavos[] = [];
  const nonIncomeIn: Centavos[] = [];
  const ownerWithdrawals: Centavos[] = [];
  const targetCosts: Centavos[] = [];
  const allIn: Centavos[] = [];
  const allOut: Centavos[] = [];

  for (const entry of entries) {
    if (entry.direction === "in") {
      allIn.push(entry.amountCentavos);
      if (countsAsIncome(entry)) income.push(entry.amountCentavos);
      else nonIncomeIn.push(entry.amountCentavos);
    } else {
      allOut.push(entry.amountCentavos);
      if (countsAsShopExpense(entry)) expenses.push(entry.amountCentavos);
      else ownerWithdrawals.push(entry.amountCentavos);
      if (countsAgainstDailyTarget(entry)) targetCosts.push(entry.amountCentavos);
    }
  }

  const incomeTotal = sumCentavos(income);
  const expenseTotal = sumCentavos(expenses);
  const targetCostTotal = sumCentavos(targetCosts);

  return {
    income: incomeTotal,
    expenses: expenseTotal,
    profit: incomeTotal - expenseTotal,
    nonIncomeIn: sumCentavos(nonIncomeIn),
    ownerWithdrawals: sumCentavos(ownerWithdrawals),
    totalIn: sumCentavos(allIn),
    totalOut: sumCentavos(allOut),
    targetCosts: targetCostTotal,
    towardTarget: incomeTotal - targetCostTotal,
  };
}

/** Income per division, for the Overview and reports (spec 15.1, 15.3). */
export function incomeByTag(
  entries: readonly LedgerEntry[],
): Record<ExpenseTag, Centavos> {
  const totals: Record<ExpenseTag, Centavos> = {
    printshoppe: 0,
    apparel: 0,
    dabztech: 0,
    whole_shop: 0,
  };

  for (const entry of entries) {
    if (countsAsIncome(entry)) {
      totals[entry.tag] += entry.amountCentavos;
    }
  }

  return totals;
}
