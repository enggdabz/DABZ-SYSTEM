/**
 * Shop-wide settings (spec 4.1, 12.3, 17.5, 17.8).
 *
 * These are the numbers the owner said would need changing: work hours,
 * working days, and the limits above which staff need approval. They live in
 * the database rather than in code so the owner can change them without a
 * developer.
 */
import { parsePesos, type Centavos } from "./money";

export interface AppSettings {
  workingDaysPerMonth: number;
  weekStartsOn: "monday" | "sunday";
  workDayStart: string; // "08:00"
  workDayEnd: string; // "17:00"
  autoLogoutMinutes: number;
  staffExpenseApprovalLimitCentavos: Centavos;
  staffDiscountLimitPercent: number;
  staffDiscountLimitCentavos: Centavos;
  defaultWarrantyDays: number;
  unclaimedUnitDays: number;
  /** Which paper receipts print on (open decision 17.3). */
  receiptPaper: ReceiptPaper;
  /**
   * Share of a Dabz Apparel order asked for up front (open decision 17.10).
   *
   * NULL until the owner sets one. The specification offers "e.g. 50%", which
   * is an example rather than the owner saying so - and a made-up policy would
   * have staff turning away a customer who paid what the owner actually
   * wanted.
   */
  apparelDownPaymentPercent: number | null;
}

/**
 * 58mm thermal is the default, being the common choice for a shop this size.
 * The other two are supported because the owner may already own a printer.
 */
export const RECEIPT_PAPERS = ["thermal_58", "thermal_80", "bond_short"] as const;
export type ReceiptPaper = (typeof RECEIPT_PAPERS)[number];

export const RECEIPT_PAPER_LABELS: Record<ReceiptPaper, string> = {
  thermal_58: "58mm thermal roll",
  thermal_80: "80mm thermal roll",
  bond_short: "Short bond paper (regular printer)",
};

/** How wide the printed receipt should be, in millimetres. */
export const RECEIPT_WIDTH_MM: Record<ReceiptPaper, number> = {
  thermal_58: 48, // 58mm roll, less the printer's margins
  thermal_80: 72,
  bond_short: 180,
};

/**
 * The defaults from the specification. Used before the owner has changed
 * anything, and as the fallback if the settings row cannot be read.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  workingDaysPerMonth: 26, // spec 12.3
  weekStartsOn: "monday", // spec 2.1
  workDayStart: "08:00", // spec 13.2, to be confirmed (17.5)
  workDayEnd: "17:00",
  autoLogoutMinutes: 15, // spec 4.1
  staffExpenseApprovalLimitCentavos: 200_000, // PHP 2,000 (spec 17.8 example)
  staffDiscountLimitPercent: 10, // spec 17.8 example
  staffDiscountLimitCentavos: 10_000, // PHP 100 (spec 17.8 example)
  defaultWarrantyDays: 30, // spec 9.3
  unclaimedUnitDays: 30, // spec 9.4
  receiptPaper: "thermal_58", // open decision 17.3, decided
  apparelDownPaymentPercent: null, // open decision 17.10, never guessed
};

/** Shape of the settings row as it comes back from PostgreSQL. */
export interface SettingsRow {
  working_days_per_month: number;
  week_starts_on: string;
  work_day_start: string;
  work_day_end: string;
  auto_logout_minutes: number;
  staff_expense_approval_limit_centavos: number;
  staff_discount_limit_percent: string | number;
  staff_discount_limit_centavos: number;
  default_warranty_days: number;
  unclaimed_unit_days: number;
  receipt_paper?: string;
  apparel_down_payment_percent?: string | number | null;
}

export function settingsFromRow(row: SettingsRow): AppSettings {
  return {
    workingDaysPerMonth: row.working_days_per_month,
    weekStartsOn: row.week_starts_on === "sunday" ? "sunday" : "monday",
    // PostgreSQL returns a time as "08:00:00"; screens want "08:00".
    workDayStart: row.work_day_start.slice(0, 5),
    workDayEnd: row.work_day_end.slice(0, 5),
    autoLogoutMinutes: row.auto_logout_minutes,
    staffExpenseApprovalLimitCentavos: row.staff_expense_approval_limit_centavos,
    // numeric columns arrive as strings, to avoid losing precision in transit.
    staffDiscountLimitPercent: Number(row.staff_discount_limit_percent),
    staffDiscountLimitCentavos: row.staff_discount_limit_centavos,
    defaultWarrantyDays: row.default_warranty_days,
    unclaimedUnitDays: row.unclaimed_unit_days,
    receiptPaper: (RECEIPT_PAPERS as readonly string[]).includes(
      row.receipt_paper ?? "",
    )
      ? (row.receipt_paper as ReceiptPaper)
      : "thermal_58",
    apparelDownPaymentPercent:
      row.apparel_down_payment_percent === null ||
      row.apparel_down_payment_percent === undefined ||
      row.apparel_down_payment_percent === ""
        ? null
        : Number(row.apparel_down_payment_percent),
  };
}

// ---------------------------------------------------------------------------
// Validating the settings form
// ---------------------------------------------------------------------------

export type SettingsValidation =
  | { ok: true; settings: AppSettings }
  | { ok: false; errors: Record<string, string> };

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Checks what was typed into the Settings form.
 *
 * The same limits are CHECK constraints in the database, so a bad value cannot
 * get stored even if this is bypassed. This exists to give a helpful message
 * instead of a database error.
 */
export function validateSettingsForm(form: {
  workingDaysPerMonth: string;
  weekStartsOn: string;
  workDayStart: string;
  workDayEnd: string;
  autoLogoutMinutes: string;
  staffExpenseApprovalLimitPesos: string;
  staffDiscountLimitPercent: string;
  staffDiscountLimitPesos: string;
  defaultWarrantyDays: string;
  unclaimedUnitDays: string;
  receiptPaper: string;
  /** Empty means "no policy", which is a real answer, not zero. */
  apparelDownPaymentPercent: string;
}): SettingsValidation {
  const errors: Record<string, string> = {};

  const workingDays = Number(form.workingDaysPerMonth);
  if (!Number.isInteger(workingDays) || workingDays < 1 || workingDays > 31) {
    errors.workingDaysPerMonth = "Enter a whole number of days from 1 to 31.";
  }

  if (form.weekStartsOn !== "monday" && form.weekStartsOn !== "sunday") {
    errors.weekStartsOn = "Choose Monday or Sunday.";
  }

  if (!TIME_PATTERN.test(form.workDayStart)) {
    errors.workDayStart = "Enter a time like 08:00.";
  }
  if (!TIME_PATTERN.test(form.workDayEnd)) {
    errors.workDayEnd = "Enter a time like 17:00.";
  }
  if (
    !errors.workDayStart &&
    !errors.workDayEnd &&
    form.workDayStart >= form.workDayEnd
  ) {
    // Overnight shifts are not something this shop runs; if that changes, this
    // is the line to revisit.
    errors.workDayEnd = "Closing time must be after opening time.";
  }

  const autoLogout = Number(form.autoLogoutMinutes);
  if (!Number.isInteger(autoLogout) || autoLogout < 1 || autoLogout > 480) {
    errors.autoLogoutMinutes = "Enter a whole number of minutes from 1 to 480.";
  }

  let expenseLimit = DEFAULT_SETTINGS.staffExpenseApprovalLimitCentavos;
  try {
    expenseLimit = parsePesos(form.staffExpenseApprovalLimitPesos);
    if (expenseLimit < 0) throw new Error("negative");
  } catch {
    errors.staffExpenseApprovalLimitPesos = "Enter an amount like 2000 or 2000.00.";
  }

  const discountPercent = Number(form.staffDiscountLimitPercent);
  if (
    !Number.isFinite(discountPercent) ||
    discountPercent < 0 ||
    discountPercent > 100
  ) {
    errors.staffDiscountLimitPercent = "Enter a percentage from 0 to 100.";
  }

  let discountAmount = DEFAULT_SETTINGS.staffDiscountLimitCentavos;
  try {
    discountAmount = parsePesos(form.staffDiscountLimitPesos);
    if (discountAmount < 0) throw new Error("negative");
  } catch {
    errors.staffDiscountLimitPesos = "Enter an amount like 100 or 100.00.";
  }

  const warrantyDays = Number(form.defaultWarrantyDays);
  if (!Number.isInteger(warrantyDays) || warrantyDays < 0 || warrantyDays > 3650) {
    errors.defaultWarrantyDays = "Enter a whole number of days.";
  }

  const unclaimedDays = Number(form.unclaimedUnitDays);
  if (!Number.isInteger(unclaimedDays) || unclaimedDays < 0 || unclaimedDays > 3650) {
    errors.unclaimedUnitDays = "Enter a whole number of days.";
  }

  if (!(RECEIPT_PAPERS as readonly string[]).includes(form.receiptPaper)) {
    errors.receiptPaper = "Choose which paper receipts print on.";
  }

  // Blank stays blank: "no down payment policy" is a real state, and a zero
  // would read as "ask for nothing", which is a different thing.
  let downPayment: number | null = null;
  const downPaymentText = form.apparelDownPaymentPercent.trim();
  if (downPaymentText !== "") {
    downPayment = Number(downPaymentText);
    if (!Number.isFinite(downPayment) || downPayment < 0 || downPayment > 100) {
      errors.apparelDownPaymentPercent =
        "Leave empty for no policy, or enter a percentage from 0 to 100.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    settings: {
      workingDaysPerMonth: workingDays,
      weekStartsOn: form.weekStartsOn as "monday" | "sunday",
      workDayStart: form.workDayStart,
      workDayEnd: form.workDayEnd,
      autoLogoutMinutes: autoLogout,
      staffExpenseApprovalLimitCentavos: expenseLimit,
      staffDiscountLimitPercent: discountPercent,
      staffDiscountLimitCentavos: discountAmount,
      defaultWarrantyDays: warrantyDays,
      unclaimedUnitDays: unclaimedDays,
      receiptPaper: form.receiptPaper as ReceiptPaper,
      apparelDownPaymentPercent: downPayment,
    },
  };
}

/** Turns validated settings back into the column names the database uses. */
export function settingsToRow(settings: AppSettings): SettingsRow {
  return {
    working_days_per_month: settings.workingDaysPerMonth,
    week_starts_on: settings.weekStartsOn,
    work_day_start: settings.workDayStart,
    work_day_end: settings.workDayEnd,
    auto_logout_minutes: settings.autoLogoutMinutes,
    staff_expense_approval_limit_centavos: settings.staffExpenseApprovalLimitCentavos,
    staff_discount_limit_percent: settings.staffDiscountLimitPercent,
    staff_discount_limit_centavos: settings.staffDiscountLimitCentavos,
    default_warranty_days: settings.defaultWarrantyDays,
    unclaimed_unit_days: settings.unclaimedUnitDays,
    receipt_paper: settings.receiptPaper,
    apparel_down_payment_percent: settings.apparelDownPaymentPercent,
  };
}

// ---------------------------------------------------------------------------
// Using the limits (spec 4.4, 6, 11)
// ---------------------------------------------------------------------------

/** Does this expense need the owner's approval before it is recorded? */
export function expenseNeedsApproval(
  amount: Centavos,
  settings: AppSettings,
): boolean {
  return amount > settings.staffExpenseApprovalLimitCentavos;
}

/**
 * May a staff member give this discount without asking?
 *
 * Both caps apply: the percentage AND the peso amount. A 5% discount on a
 * PHP 10,000 order is PHP 500, which is over a PHP 100 cap even though 5% is
 * under a 10% cap - so it still needs approval.
 */
export function discountNeedsApproval(
  discount: { kind: "amount"; centavos: Centavos } | { kind: "percent"; percent: number; subtotal: Centavos },
  settings: AppSettings,
): boolean {
  if (discount.kind === "amount") {
    return discount.centavos > settings.staffDiscountLimitCentavos;
  }

  if (discount.percent > settings.staffDiscountLimitPercent) return true;

  const asCentavos = Math.round((discount.subtotal * discount.percent) / 100);
  return asCentavos > settings.staffDiscountLimitCentavos;
}
