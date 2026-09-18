import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  discountNeedsApproval,
  expenseNeedsApproval,
  settingsFromRow,
  settingsToRow,
  validateSettingsForm,
  type SettingsRow,
} from "./settings";

const goodForm = {
  workingDaysPerMonth: "26",
  weekStartsOn: "monday",
  workDayStart: "08:00",
  workDayEnd: "17:00",
  autoLogoutMinutes: "15",
  staffExpenseApprovalLimitPesos: "2000",
  staffDiscountLimitPercent: "10",
  staffDiscountLimitPesos: "100",
  defaultWarrantyDays: "30",
  unclaimedUnitDays: "30",
  receiptPaper: "thermal_58",
  apparelDownPaymentPercent: "",
  shopAddress: "",
  shopPhone: "",
  shopEmail: "",
  facebookPageUrl: "",
  messengerUsername: "",
  mapUrl: "",
  publicOpeningHours: "",
  publicPageEnabled: true,
};

describe("validateSettingsForm", () => {
  it("accepts the specification's defaults", () => {
    const result = validateSettingsForm(goodForm);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("stores money limits as centavos", () => {
    const result = validateSettingsForm({
      ...goodForm,
      staffExpenseApprovalLimitPesos: "1,500.50",
      staffDiscountLimitPesos: "250",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.staffExpenseApprovalLimitCentavos).toBe(150050);
      expect(result.settings.staffDiscountLimitCentavos).toBe(25000);
    }
  });

  it("refuses impossible working days", () => {
    for (const value of ["0", "32", "26.5", "", "many"]) {
      const result = validateSettingsForm({ ...goodForm, workingDaysPerMonth: value });
      expect(result.ok, value).toBe(false);
      if (!result.ok) expect(result.errors).toHaveProperty("workingDaysPerMonth");
    }
  });

  it("refuses a closing time that is not after opening time", () => {
    const result = validateSettingsForm({
      ...goodForm,
      workDayStart: "17:00",
      workDayEnd: "08:00",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.workDayEnd).toBe("Closing time must be after opening time.");
    }
  });

  it("refuses badly written times", () => {
    for (const value of ["8am", "25:00", "08:70", "0800", ""]) {
      const result = validateSettingsForm({ ...goodForm, workDayStart: value });
      expect(result.ok, value).toBe(false);
    }
  });

  it("refuses a discount percentage outside 0 to 100", () => {
    for (const value of ["-1", "101", "abc"]) {
      const result = validateSettingsForm({ ...goodForm, staffDiscountLimitPercent: value });
      expect(result.ok, value).toBe(false);
    }
  });

  it("refuses a money limit that is not a peso amount", () => {
    for (const value of ["", "-5", "2000.555", "two thousand"]) {
      const result = validateSettingsForm({
        ...goodForm,
        staffExpenseApprovalLimitPesos: value,
      });
      expect(result.ok, value).toBe(false);
    }
  });

  it("reports every problem at once, not one at a time", () => {
    const result = validateSettingsForm({
      ...goodForm,
      workingDaysPerMonth: "0",
      autoLogoutMinutes: "0",
      staffDiscountLimitPercent: "200",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "autoLogoutMinutes",
        "staffDiscountLimitPercent",
        "workingDaysPerMonth",
      ]);
    }
  });
});

describe("reading and writing the settings row", () => {
  const row: SettingsRow = {
    working_days_per_month: 26,
    week_starts_on: "monday",
    // PostgreSQL hands back a full time; the form wants HH:MM.
    work_day_start: "08:00:00",
    work_day_end: "17:00:00",
    auto_logout_minutes: 15,
    staff_expense_approval_limit_centavos: 200000,
    // numeric columns arrive as strings over the wire.
    staff_discount_limit_percent: "10.00",
    staff_discount_limit_centavos: 10000,
    default_warranty_days: 30,
    unclaimed_unit_days: 30,
    receipt_paper: "thermal_58",
  };

  it("reads a database row into the shape screens use", () => {
    expect(settingsFromRow(row)).toEqual(DEFAULT_SETTINGS);
  });

  it("survives a full round trip", () => {
    const settings = settingsFromRow(row);
    expect(settingsFromRow(settingsToRow(settings) as SettingsRow)).toEqual(settings);
  });

  it("falls back to Monday for an unexpected week start", () => {
    expect(settingsFromRow({ ...row, week_starts_on: "tuesday" }).weekStartsOn).toBe("monday");
  });

  it("falls back to 58mm thermal for an unexpected receipt paper", () => {
    expect(settingsFromRow({ ...row, receipt_paper: "papyrus" }).receiptPaper).toBe(
      "thermal_58",
    );
    // And for a database that predates the setting existing.
    expect(settingsFromRow({ ...row, receipt_paper: undefined }).receiptPaper).toBe(
      "thermal_58",
    );
  });

  it("refuses an unknown receipt paper on the form", () => {
    const result = validateSettingsForm({ ...goodForm, receiptPaper: "papyrus" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveProperty("receiptPaper");
  });
});

describe("expenseNeedsApproval", () => {
  it("flags an expense above the limit, and lets an equal one through", () => {
    // Limit is PHP 2,000.
    expect(expenseNeedsApproval(199_999, DEFAULT_SETTINGS)).toBe(false);
    expect(expenseNeedsApproval(200_000, DEFAULT_SETTINGS)).toBe(false);
    expect(expenseNeedsApproval(200_001, DEFAULT_SETTINGS)).toBe(true);
  });
});

describe("discountNeedsApproval", () => {
  it("applies the peso cap", () => {
    // Cap is PHP 100.
    expect(discountNeedsApproval({ kind: "amount", centavos: 10_000 }, DEFAULT_SETTINGS)).toBe(false);
    expect(discountNeedsApproval({ kind: "amount", centavos: 10_001 }, DEFAULT_SETTINGS)).toBe(true);
  });

  it("applies the percentage cap", () => {
    // Cap is 10%.
    expect(
      discountNeedsApproval({ kind: "percent", percent: 10, subtotal: 50_000 }, DEFAULT_SETTINGS),
    ).toBe(false);
    expect(
      discountNeedsApproval({ kind: "percent", percent: 11, subtotal: 50_000 }, DEFAULT_SETTINGS),
    ).toBe(true);
  });

  it("applies BOTH caps, so a small percentage of a big order still needs approval", () => {
    // 5% is under the 10% cap, but 5% of PHP 10,000 is PHP 500 - well over the
    // PHP 100 cap. This is the case a single check would have missed.
    expect(
      discountNeedsApproval({ kind: "percent", percent: 5, subtotal: 1_000_000 }, DEFAULT_SETTINGS),
    ).toBe(true);
  });

  it("lets a small percentage of a small order through", () => {
    // 5% of PHP 500 is PHP 25: under both caps.
    expect(
      discountNeedsApproval({ kind: "percent", percent: 5, subtotal: 50_000 }, DEFAULT_SETTINGS),
    ).toBe(false);
  });
});
