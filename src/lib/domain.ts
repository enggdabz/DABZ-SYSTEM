/**
 * Vocabularies mirrored from the database's CHECK constraints.
 *
 * These are not invented: each list matches a constraint, so a value here that
 * the database rejects is a bug in this file. Labels are for display only.
 */

export const DIVISIONS = ["printshoppe", "apparel", "dabztech"] as const;
export type Division = (typeof DIVISIONS)[number];
export const DIVISION_LABEL: Record<Division, string> = {
  printshoppe: "Printshoppe",
  apparel: "Apparel",
  dabztech: "DabzTech",
};

/** expenses.tag, ledger_entries.tag, stock_items.tag, expense_presets.tag */
export const TAGS = [...DIVISIONS, "whole_shop"] as const;
export type Tag = (typeof TAGS)[number];
export const TAG_LABEL: Record<Tag, string> = {
  ...DIVISION_LABEL,
  whole_shop: "Whole shop",
};

/** Where money physically moved. ledger_entries.source and friends. */
export const MONEY_SOURCES = [
  "cash_drawer",
  "gcash",
  "maya",
  "bank",
  "owners_pocket",
] as const;
export type MoneySource = (typeof MONEY_SOURCES)[number];
export const MONEY_SOURCE_LABEL: Record<MoneySource, string> = {
  cash_drawer: "Cash drawer",
  gcash: "GCash",
  maya: "Maya",
  bank: "Bank",
  owners_pocket: "Owner's pocket",
};

/** sales.payment_method — note this list excludes owners_pocket. */
export const PAYMENT_METHODS = ["cash", "gcash", "maya", "bank"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  bank: "Bank",
};

/** complete_sale maps the payment method to a ledger source this same way. */
export const PAYMENT_METHOD_SOURCE: Record<PaymentMethod, MoneySource> = {
  cash: "cash_drawer",
  gcash: "gcash",
  maya: "maya",
  bank: "bank",
};

export const DISCOUNT_KINDS = ["none", "amount", "percent"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

export const REPAIR_STATUSES = [
  "received",
  "checking",
  "quoted",
  "repairing",
  "ready",
  "released",
  "declined",
  "unrepairable",
] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];

export const REPAIR_UNIT_KINDS = ["epson_printer", "laptop", "desktop"] as const;
export type RepairUnitKind = (typeof REPAIR_UNIT_KINDS)[number];
export const REPAIR_UNIT_KIND_LABEL: Record<RepairUnitKind, string> = {
  epson_printer: "Epson printer",
  laptop: "Laptop",
  desktop: "Desktop",
};

export const UNLOCK_METHODS = [
  "not_needed",
  "customer_unlocks",
  "left_unlocked",
] as const;

export const APPAREL_STATUSES = [
  "quoted",
  "confirmed",
  "layout_approved",
  "in_production",
  "ready",
  "released",
  "cancelled",
] as const;
export type ApparelStatus = (typeof APPAREL_STATUSES)[number];

export const APPAREL_SIZES = [
  "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL",
] as const;
export type ApparelSize = (typeof APPAREL_SIZES)[number];

export const EXPENSE_STATUSES = ["pending", "approved", "rejected"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

/** expenses.category is free text; these are the values already in use. */
export const EXPENSE_CATEGORIES = [
  "materials_supplies",
  "machine_maintenance",
  "fuel_transportation",
  "delivery_shipping",
  "meals_snacks",
  "miscellaneous",
] as const;

/**
 * income_category is free text too. complete_sale defaults it to
 * 'other_print_jobs' when a line omits it.
 */
export const INCOME_CATEGORIES = [
  "document_printing",
  "photocopy",
  "lamination",
  "stickers",
  "dtf_prints",
  "mugs_souvenirs",
  "shirts",
  "long_sleeves",
  "jackets",
  "sublimation_jerseys",
  "laptop_repair",
  "desktop_repair",
  "epson_printer_repair",
  "checking_fee",
  "other_print_jobs",
] as const;

export const STOCK_MOVEMENT_KINDS = ["in", "out", "count", "adjustment"] as const;
export const PAYROLL_DAY_TYPES = ["full", "half", "absent"] as const;
export const PAYROLL_STATUSES = ["draft", "paid"] as const;
export const DEDUCTION_PLANS = [
  "next_payday",
  "in_parts",
  "decide_on_payday",
] as const;
export const BILL_TYPES = ["operating", "loan_installment"] as const;
export const VOID_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;

/** Turns a snake_case database value into something readable. */
export function humanise(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}
