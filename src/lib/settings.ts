/**
 * Shop-wide settings (spec 4.1, 12.3, 17.5, 17.8).
 *
 * These are the numbers the owner said would need changing: work hours,
 * working days, and the limits above which staff need approval. They live in
 * the database rather than in code so the owner can change them without a
 * developer.
 */
import { parsePesos, type Centavos } from "./money";
import {
  isColumnMissingFromApi,
  missingColumnFromApi,
  type PostgrestLikeError,
} from "./postgrest";

export interface AppSettings {
  workingDaysPerMonth: number;
  weekStartsOn: "monday" | "sunday";
  workDayStart: string; // "08:00"
  workDayEnd: string; // "17:00"
  autoLogoutMinutes: number;
  /**
   * True leaves a staff account signed in until the person signs out.
   *
   * The owner asked for this (21 September 2026): the counter staff were being
   * thrown back to the login screen in the middle of a working day. Owner and
   * admin accounts keep the idle timer either way, because they are the ones
   * who can open payroll, the ledger and the bills.
   */
  staffStaySignedIn: boolean;
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

  /**
   * The shop's own details, for the public page (Phase 9).
   *
   * All null until the owner types them. A customer arriving from Facebook is
   * shown only what is filled in - the page leaves out what is missing rather
   * than printing "123 Example Street" to a real person who might drive there.
   */
  shopAddress: string | null;
  shopPhone: string | null;
  shopEmail: string | null;
  facebookPageUrl: string | null;
  /** The m.me name, so the page can open Messenger without any Meta app. */
  messengerUsername: string | null;
  mapUrl: string | null;
  publicOpeningHours: string | null;
  /** False takes the public page down without removing anything. */
  publicPageEnabled: boolean;

  /**
   * The online shop (Phase 14, docs/spec.md).
   *
   * The two figures here are the owner's and start NULL. A capacity of sixty
   * would turn a customer away on a day the shop was free, and a target of
   * zero would read as reached before the first order - so the calendar shows
   * no FULL marker and Reports show no meter until somebody says.
   */
  onlineNotifyEmail: string | null;
  onlineDailyCapacityPcs: number | null;
  onlineMonthlyTargetCentavos: Centavos | null;
  /** The earliest date a customer may ask for, counted from today in Manila. */
  onlineMinDaysAhead: number;
  onlineShowStepsToCustomers: boolean;
  /** False takes the online shop down without removing anything. */
  onlineShopEnabled: boolean;
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
  staffStaySignedIn: true, // owner's request, 21 Sep 2026 (see DECISIONS.md)
  staffExpenseApprovalLimitCentavos: 200_000, // PHP 2,000 (spec 17.8 example)
  staffDiscountLimitPercent: 10, // spec 17.8 example
  staffDiscountLimitCentavos: 10_000, // PHP 100 (spec 17.8 example)
  defaultWarrantyDays: 30, // spec 9.3
  unclaimedUnitDays: 30, // spec 9.4
  receiptPaper: "thermal_58", // open decision 17.3, decided
  apparelDownPaymentPercent: null, // open decision 17.10, never guessed

  // The shop's own details. Empty until the owner types them (Phase 9).
  shopAddress: null,
  shopPhone: null,
  shopEmail: null,
  facebookPageUrl: null,
  messengerUsername: null,
  mapUrl: null,
  publicOpeningHours: null,
  publicPageEnabled: true,

  // The online shop. Both figures stay empty until the owner types one.
  onlineNotifyEmail: null,
  onlineDailyCapacityPcs: null,
  onlineMonthlyTargetCentavos: null,
  onlineMinDaysAhead: 2, // docs/spec.md 6.2's own default
  onlineShowStepsToCustomers: true, // D10, answered yes
  onlineShopEnabled: true,
};

/** Shape of the settings row as it comes back from PostgreSQL. */
export interface SettingsRow {
  working_days_per_month: number;
  week_starts_on: string;
  work_day_start: string;
  work_day_end: string;
  auto_logout_minutes: number;
  staff_stay_signed_in?: boolean | null;
  staff_expense_approval_limit_centavos: number;
  staff_discount_limit_percent: string | number;
  staff_discount_limit_centavos: number;
  default_warranty_days: number;
  unclaimed_unit_days: number;
  receipt_paper?: string;
  apparel_down_payment_percent?: string | number | null;
  shop_address?: string | null;
  shop_phone?: string | null;
  shop_email?: string | null;
  facebook_page_url?: string | null;
  messenger_username?: string | null;
  map_url?: string | null;
  public_opening_hours?: string | null;
  public_page_enabled?: boolean | null;
  online_notify_email?: string | null;
  online_daily_capacity_pcs?: number | null;
  online_monthly_target_centavos?: number | null;
  online_min_days_ahead?: number | null;
  online_show_steps_to_customers?: boolean | null;
  online_shop_enabled?: boolean | null;
}

export function settingsFromRow(row: SettingsRow): AppSettings {
  return {
    workingDaysPerMonth: row.working_days_per_month,
    weekStartsOn: row.week_starts_on === "sunday" ? "sunday" : "monday",
    // PostgreSQL returns a time as "08:00:00"; screens want "08:00".
    workDayStart: row.work_day_start.slice(0, 5),
    workDayEnd: row.work_day_end.slice(0, 5),
    autoLogoutMinutes: row.auto_logout_minutes,
    // Missing means migration 0014 has not run yet, which is not the same as
    // the owner unticking the box. The owner's answer was "keep them signed
    // in", so that is what an unmigrated database gets too.
    staffStaySignedIn: row.staff_stay_signed_in ?? true,
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

    shopAddress: blankToNull(row.shop_address),
    shopPhone: blankToNull(row.shop_phone),
    shopEmail: blankToNull(row.shop_email),
    facebookPageUrl: blankToNull(row.facebook_page_url),
    messengerUsername: blankToNull(row.messenger_username),
    mapUrl: blankToNull(row.map_url),
    publicOpeningHours: blankToNull(row.public_opening_hours),
    // Missing means the column has not been migrated yet, which is not the
    // same as the owner switching the page off.
    publicPageEnabled: row.public_page_enabled ?? true,

    onlineNotifyEmail: blankToNull(row.online_notify_email),
    // Null and "not migrated yet" both mean "nobody has said", which is the
    // answer these two are built around. There is nothing to distinguish.
    onlineDailyCapacityPcs: numberOrNull(row.online_daily_capacity_pcs),
    onlineMonthlyTargetCentavos: numberOrNull(row.online_monthly_target_centavos),
    onlineMinDaysAhead: row.online_min_days_ahead ?? 2,
    onlineShowStepsToCustomers: row.online_show_steps_to_customers ?? true,
    onlineShopEnabled: row.online_shop_enabled ?? true,
  };
}

/** A figure the owner has not given stays missing, never becomes zero. */
function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * An empty string is the same as nothing here.
 *
 * A box the owner opened and left blank must read as "not set", not as an
 * address of no characters printed on the public page.
 */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
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
  staffStaySignedIn: boolean;
  staffExpenseApprovalLimitPesos: string;
  staffDiscountLimitPercent: string;
  staffDiscountLimitPesos: string;
  defaultWarrantyDays: string;
  unclaimedUnitDays: string;
  receiptPaper: string;
  /** Empty means "no policy", which is a real answer, not zero. */
  apparelDownPaymentPercent: string;
  shopAddress: string;
  shopPhone: string;
  shopEmail: string;
  facebookPageUrl: string;
  messengerUsername: string;
  mapUrl: string;
  publicOpeningHours: string;
  publicPageEnabled: boolean;
  /** Empty means "nobody has said", which is what both of these start as. */
  onlineNotifyEmail: string;
  onlineDailyCapacityPcs: string;
  onlineMonthlyTargetPesos: string;
  onlineMinDaysAhead: string;
  onlineShowStepsToCustomers: boolean;
  onlineShopEnabled: boolean;
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

  /*
    The two online-shop figures are the owner's to know, so an empty box is a
    real answer and stays one. A zero would be a different claim: "the shop can
    finish nothing in a day" and "the target is nothing", and the calendar and
    the reports would both read as reached.
  */
  let capacity: number | null = null;
  const capacityText = form.onlineDailyCapacityPcs.trim();
  if (capacityText !== "") {
    capacity = Number(capacityText);
    if (!Number.isInteger(capacity) || capacity < 1) {
      errors.onlineDailyCapacityPcs =
        "Leave empty if you have not decided, or enter a whole number of pieces above zero.";
    }
  }

  let monthlyTarget: Centavos | null = null;
  const targetText = form.onlineMonthlyTargetPesos.trim();
  if (targetText !== "") {
    try {
      monthlyTarget = parsePesos(targetText);
      if (monthlyTarget <= 0) throw new Error("not above zero");
    } catch {
      monthlyTarget = null;
      errors.onlineMonthlyTargetPesos =
        "Leave empty if you have not decided, or enter an amount like 100000.";
    }
  }

  const minDaysAhead = Number(form.onlineMinDaysAhead);
  if (!Number.isInteger(minDaysAhead) || minDaysAhead < 0 || minDaysAhead > 90) {
    errors.onlineMinDaysAhead = "Enter a whole number of days from 0 to 90.";
  }

  const notifyEmail = form.onlineNotifyEmail.trim();
  if (notifyEmail !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail)) {
    errors.onlineNotifyEmail = "Enter an email address, or leave it empty.";
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
      staffStaySignedIn: form.staffStaySignedIn,
      staffExpenseApprovalLimitCentavos: expenseLimit,
      staffDiscountLimitPercent: discountPercent,
      staffDiscountLimitCentavos: discountAmount,
      defaultWarrantyDays: warrantyDays,
      unclaimedUnitDays: unclaimedDays,
      receiptPaper: form.receiptPaper as ReceiptPaper,
      apparelDownPaymentPercent: downPayment,

      shopAddress: blank(form.shopAddress),
      shopPhone: blank(form.shopPhone),
      shopEmail: blank(form.shopEmail),
      facebookPageUrl: blank(form.facebookPageUrl),
      messengerUsername: blank(form.messengerUsername),
      mapUrl: blank(form.mapUrl),
      publicOpeningHours: blank(form.publicOpeningHours),
      publicPageEnabled: form.publicPageEnabled,

      onlineNotifyEmail: blank(form.onlineNotifyEmail),
      onlineDailyCapacityPcs: capacity,
      onlineMonthlyTargetCentavos: monthlyTarget,
      onlineMinDaysAhead: minDaysAhead,
      onlineShowStepsToCustomers: form.onlineShowStepsToCustomers,
      onlineShopEnabled: form.onlineShopEnabled,
    },
  };
}

/** A box left empty stays empty - it never becomes "". */
function blank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Turns validated settings back into the column names the database uses. */
export function settingsToRow(settings: AppSettings): SettingsRow {
  return {
    working_days_per_month: settings.workingDaysPerMonth,
    week_starts_on: settings.weekStartsOn,
    work_day_start: settings.workDayStart,
    work_day_end: settings.workDayEnd,
    auto_logout_minutes: settings.autoLogoutMinutes,
    staff_stay_signed_in: settings.staffStaySignedIn,
    staff_expense_approval_limit_centavos: settings.staffExpenseApprovalLimitCentavos,
    staff_discount_limit_percent: settings.staffDiscountLimitPercent,
    staff_discount_limit_centavos: settings.staffDiscountLimitCentavos,
    default_warranty_days: settings.defaultWarrantyDays,
    unclaimed_unit_days: settings.unclaimedUnitDays,
    receipt_paper: settings.receiptPaper,
    apparel_down_payment_percent: settings.apparelDownPaymentPercent,
    shop_address: settings.shopAddress,
    shop_phone: settings.shopPhone,
    shop_email: settings.shopEmail,
    facebook_page_url: settings.facebookPageUrl,
    messenger_username: settings.messengerUsername,
    map_url: settings.mapUrl,
    public_opening_hours: settings.publicOpeningHours,
    public_page_enabled: settings.publicPageEnabled,
    online_notify_email: settings.onlineNotifyEmail,
    online_daily_capacity_pcs: settings.onlineDailyCapacityPcs,
    online_monthly_target_centavos: settings.onlineMonthlyTargetCentavos,
    online_min_days_ahead: settings.onlineMinDaysAhead,
    online_show_steps_to_customers: settings.onlineShowStepsToCustomers,
    online_shop_enabled: settings.onlineShopEnabled,
  };
}

// ---------------------------------------------------------------------------
// Saving against a database that is behind (21 September 2026)
// ---------------------------------------------------------------------------

/*
  The owner opened Settings, typed a warranty period, pressed Save and was told
  the whole form could not be saved because of `staff_stay_signed_in` - a
  checkbox they had not touched, for a migration (`0014`) that had never
  reached the production database. The app deploys the moment a branch merges;
  `npm run db:push` is run by hand afterwards, and in between EVERY setting is
  unsaveable because the form writes all of them in one statement.

  So a column the database has not got yet is dropped from the write and the
  rest is saved. The owner is told, by name and in their own words, which
  setting did not stick and why - a silent drop would be far worse than the
  refusal it replaces, because a setting that reads back wrong is trusted.

  Only these columns may be dropped. Every one of them was added to
  `app_settings` AFTER `0001` created it, and every one has a database default,
  so leaving it out of an update changes nothing. A column outside this list
  going missing is not a database that is behind - it is one that is broken,
  and papering over that would hide it.
*/
export const SETTINGS_COLUMNS_ADDED_LATER: Readonly<Record<string, string>> = {
  // 0005_phase4_pos
  receipt_paper: "Receipt paper size",
  // 0007_phase6_apparel
  apparel_down_payment_percent: "Apparel down payment percentage",
  // 0009_phase9_public
  shop_address: "Shop address",
  shop_phone: "Shop phone number",
  shop_email: "Shop email address",
  facebook_page_url: "Facebook page link",
  messenger_username: "Messenger name",
  map_url: "Map link",
  public_opening_hours: "Opening hours",
  public_page_enabled: "Show the public page",
  // 0014_staff_stay_signed_in
  staff_stay_signed_in: "Staff stay signed in",
  // 0020_phase14_online_orders
  online_notify_email: "Where new online orders are emailed",
  online_daily_capacity_pcs: "Pieces the shop can finish in a day",
  online_monthly_target_centavos: "Monthly sales target",
  online_min_days_ahead: "How far ahead an online order must be booked",
  online_show_steps_to_customers: "Show production steps to customers",
  online_shop_enabled: "Show the online shop",
};

/** May this column be left out of a settings write, or is it a real fault? */
export function settingsColumnCanBeSkipped(column: string): boolean {
  return Object.hasOwn(SETTINGS_COLUMNS_ADDED_LATER, column);
}

/** The setting's name as it is written on the form, not its column name. */
export function settingsColumnLabel(column: string): string {
  return SETTINGS_COLUMNS_ADDED_LATER[column] ?? column;
}

/** What came of trying to save: the failure that stuck, and what was dropped. */
export interface SettingsWriteResult {
  /** Null when the row went in. */
  error: PostgrestLikeError | null;
  /** Columns left out because the database does not have them, in order. */
  skipped: string[];
}

/**
 * Save the settings row, dropping any column this database has not got yet.
 *
 * The write itself is passed in rather than done here, so the rule can be
 * tested without a database - and so this file stays free of anything that
 * only runs on the server.
 *
 * It stops on the first refusal that is NOT a missing column, on a refusal
 * that does not say which column, and on a column outside the list above.
 * Each pass removes one key, so it cannot loop longer than the row is wide.
 */
export async function saveSettingsRow(
  row: Readonly<Record<string, unknown>>,
  write: (row: Record<string, unknown>) => Promise<PostgrestLikeError | null>,
): Promise<SettingsWriteResult> {
  const writing: Record<string, unknown> = { ...row };
  const skipped: string[] = [];

  let error = await write(writing);

  while (error !== null && isColumnMissingFromApi(error)) {
    const column = missingColumnFromApi(error);

    /*
      Not named, not ours to drop, or already dropped. Any of the three means
      trying again would either change nothing or hide a real fault: a column
      outside the list is a database that is BROKEN, not one that is behind,
      and quietly writing round that is how a fault becomes permanent.
    */
    if (
      column === null ||
      !settingsColumnCanBeSkipped(column) ||
      !Object.hasOwn(writing, column)
    ) {
      break;
    }

    delete writing[column];
    skipped.push(column);
    error = await write(writing);
  }

  return { error, skipped };
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

// ---------------------------------------------------------------------------
// Who the idle timer applies to (spec 4.1, revised 21 September 2026)
// ---------------------------------------------------------------------------

/**
 * How many idle minutes before this person is signed out, or null for never.
 *
 * Only a staff account can be exempt, and only while the owner leaves the box
 * ticked. Anything that is not plainly "staff" keeps the timer, so a role
 * added later is timed until somebody decides otherwise - the safe way round
 * for a shared counter computer.
 *
 * Takes a plain string rather than `Role` so a value read straight out of the
 * database cannot widen the exemption by being unrecognised.
 */
export function idleSignOutMinutes(
  role: string,
  settings: Pick<AppSettings, "autoLogoutMinutes" | "staffStaySignedIn">,
): number | null {
  if (role === "staff" && settings.staffStaySignedIn) return null;
  return settings.autoLogoutMinutes;
}
