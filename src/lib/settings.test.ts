import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  discountNeedsApproval,
  expenseNeedsApproval,
  idleSignOutMinutes,
  saveSettingsRow,
  SETTINGS_COLUMNS_ADDED_LATER,
  settingsColumnCanBeSkipped,
  settingsColumnLabel,
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
  staffStaySignedIn: true,
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

const row: SettingsRow = {
  working_days_per_month: 26,
  week_starts_on: "monday",
  // PostgreSQL hands back a full time; the form wants HH:MM.
  work_day_start: "08:00:00",
  work_day_end: "17:00:00",
  auto_logout_minutes: 15,
  staff_stay_signed_in: true,
  staff_expense_approval_limit_centavos: 200000,
  // numeric columns arrive as strings over the wire.
  staff_discount_limit_percent: "10.00",
  staff_discount_limit_centavos: 10000,
  default_warranty_days: 30,
  unclaimed_unit_days: 30,
  receipt_paper: "thermal_58",
};

describe("reading and writing the settings row", () => {
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

describe("who the idle timer applies to", () => {
  const timed = { autoLogoutMinutes: 15, staffStaySignedIn: false };
  const relaxed = { autoLogoutMinutes: 15, staffStaySignedIn: true };

  it("leaves a staff account signed in when the owner has asked for that", () => {
    expect(idleSignOutMinutes("staff", relaxed)).toBeNull();
  });

  it("puts staff back on the timer when the box is unticked", () => {
    expect(idleSignOutMinutes("staff", timed)).toBe(15);
  });

  it("always times owner and admin accounts, which can open payroll", () => {
    expect(idleSignOutMinutes("owner", relaxed)).toBe(15);
    expect(idleSignOutMinutes("admin", relaxed)).toBe(15);
    expect(idleSignOutMinutes("owner", timed)).toBe(15);
    expect(idleSignOutMinutes("admin", timed)).toBe(15);
  });

  it("times a role it does not recognise rather than trusting it", () => {
    expect(idleSignOutMinutes("manager", relaxed)).toBe(15);
    expect(idleSignOutMinutes("", relaxed)).toBe(15);
  });

  it("treats a database that has not run migration 0014 as keeping staff in", () => {
    expect(settingsFromRow({ ...row, staff_stay_signed_in: undefined }).staffStaySignedIn).toBe(
      true,
    );
    expect(settingsFromRow({ ...row, staff_stay_signed_in: null }).staffStaySignedIn).toBe(
      true,
    );
  });

  it("carries an unticked box through to the database row and back", () => {
    const result = validateSettingsForm({ ...goodForm, staffStaySignedIn: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stored = settingsToRow(result.settings);
    expect(stored.staff_stay_signed_in).toBe(false);
    expect(settingsFromRow(stored).staffStaySignedIn).toBe(false);
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

// ---------------------------------------------------------------------------
// Saving against a database that is behind (21 September 2026)
// ---------------------------------------------------------------------------

/** The error PostgREST answers when its cache has no such column. */
const noSuchColumn = (column: string) => ({
  code: "PGRST204",
  message: `Could not find the '${column}' column of 'app_settings' in the schema cache`,
});

/**
 * A stand-in database that refuses the columns it has not got, one refusal at
 * a time - which is exactly how PostgREST behaves: it names the first column
 * it cannot find and says nothing about the rest.
 */
function databaseWithout(...absent: string[]) {
  const attempts: Record<string, unknown>[] = [];

  const write = async (row: Record<string, unknown>) => {
    attempts.push({ ...row });
    const found = absent.find((column) => Object.hasOwn(row, column));
    return found ? noSuchColumn(found) : null;
  };

  return { attempts, write };
}

describe("saveSettingsRow", () => {
  const row = {
    default_warranty_days: 30,
    unclaimed_unit_days: 30,
    staff_stay_signed_in: false,
    shop_phone: "0917",
  };

  it("writes the row as it is when the database understands all of it", async () => {
    const db = databaseWithout();
    const result = await saveSettingsRow(row, db.write);

    expect(result.error).toBeNull();
    expect(result.skipped).toEqual([]);
    expect(db.attempts).toHaveLength(1);
    expect(db.attempts[0]).toEqual(row);
  });

  it("saves the rest when one column has not been migrated yet", async () => {
    /*
      The bug, in one test. The owner typed a warranty period, pressed Save and
      was told the whole screen could not be saved - because of a checkbox they
      had not touched, for a migration that had never reached the database. Two
      settings they DID change were thrown away with it.
    */
    const db = databaseWithout("staff_stay_signed_in");
    const result = await saveSettingsRow(row, db.write);

    expect(result.error).toBeNull();
    expect(result.skipped).toEqual(["staff_stay_signed_in"]);
    expect(db.attempts[1]).toEqual({
      default_warranty_days: 30,
      unclaimed_unit_days: 30,
      shop_phone: "0917",
    });
  });

  it("drops more than one, because PostgREST only names the first", async () => {
    const db = databaseWithout("staff_stay_signed_in", "shop_phone");
    const result = await saveSettingsRow(row, db.write);

    expect(result.error).toBeNull();
    expect(result.skipped.sort()).toEqual(["shop_phone", "staff_stay_signed_in"]);
    expect(db.attempts).toHaveLength(3);
  });

  it("REFUSES to drop a column that is not one of the later ones", async () => {
    /*
      The line between "behind" and "broken". `default_warranty_days` has been
      on app_settings since 0001, so its absence is not a migration nobody ran
      - it is a database in a state nothing here should write round. Writing
      round it would turn a loud fault into a silent one.
    */
    const db = databaseWithout("default_warranty_days");
    const result = await saveSettingsRow(row, db.write);

    expect(result.error).not.toBeNull();
    expect(result.skipped).toEqual([]);
    expect(db.attempts).toHaveLength(1);
  });

  it("does not retry a refusal that is not about a missing column", async () => {
    // Row Level Security, a check constraint, a dropped connection: none of
    // them is fixed by writing less, and retrying would hide the real answer.
    const denied = {
      code: "42501",
      message: 'new row violates row-level security policy for table "app_settings"',
    };
    const attempts: unknown[] = [];

    const result = await saveSettingsRow(row, async (sent) => {
      attempts.push(sent);
      return denied;
    });

    expect(result.error).toBe(denied);
    expect(result.skipped).toEqual([]);
    expect(attempts).toHaveLength(1);
  });

  it("gives up rather than looping when the refusal names no column", async () => {
    const vague = { code: "PGRST204", message: "could not find the column" };
    let calls = 0;

    const result = await saveSettingsRow(row, async () => {
      calls += 1;
      return vague;
    });

    expect(result.error).toBe(vague);
    expect(calls).toBe(1);
  });

  it("gives up rather than looping when the same column is named twice", async () => {
    // A database that keeps naming a column already dropped would otherwise
    // loop for ever against a real server.
    let calls = 0;

    const result = await saveSettingsRow(row, async () => {
      calls += 1;
      return noSuchColumn("staff_stay_signed_in");
    });

    expect(result.skipped).toEqual(["staff_stay_signed_in"]);
    expect(result.error).not.toBeNull();
    expect(calls).toBe(2);
  });

  it("leaves the caller's row alone", async () => {
    // The audit log is written from the original afterwards.
    const original = { ...row };
    await saveSettingsRow(row, databaseWithout("staff_stay_signed_in").write);

    expect(row).toEqual(original);
  });
});

describe("the columns that may be skipped", () => {
  it("covers every column app_settings gained after 0001", async () => {
    /*
      Anti-drift, the same rule as the schema check and the To fill in
      checklist: a column added by a later migration and forgotten here brings
      back the bug in full - one unmigrated column, nothing on the screen
      saveable.
    */
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");

    const dir = join(process.cwd(), "supabase", "migrations");
    const later = new Set<string>();

    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      // 0001 creates app_settings; anything after it only adds to it.
      if (file.startsWith("0001")) continue;
      const sql = readFileSync(join(dir, file), "utf8");

      for (const statement of sql.matchAll(
        /alter\s+table\s+(?:public\.)?app_settings([\s\S]*?);/gi,
      )) {
        for (const added of statement[1].matchAll(
          /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi,
        )) {
          later.add(added[1]);
        }
      }
    }

    expect(later.size).toBeGreaterThan(0);
    expect(later.has("staff_stay_signed_in")).toBe(true);

    const forgotten = [...later].filter((c) => !settingsColumnCanBeSkipped(c)).sort();
    expect(forgotten).toEqual([]);
  });

  it("does not offer to skip a column that has been there since 0001", async () => {
    for (const core of [
      "working_days_per_month",
      "auto_logout_minutes",
      "staff_discount_limit_percent",
      "default_warranty_days",
      "updated_by",
      "id",
    ]) {
      expect(settingsColumnCanBeSkipped(core)).toBe(false);
    }
  });

  it("names each one the way the form does", () => {
    // What the owner reads is "Staff stay signed in", not a column name.
    expect(settingsColumnLabel("staff_stay_signed_in")).toBe("Staff stay signed in");
    expect(settingsColumnLabel("shop_phone")).toBe("Shop phone number");

    for (const label of Object.values(SETTINGS_COLUMNS_ADDED_LATER)) {
      expect(label).not.toContain("_");
    }
  });

  it("falls back to the column name rather than inventing one", () => {
    expect(settingsColumnLabel("something_new")).toBe("something_new");
  });
});
