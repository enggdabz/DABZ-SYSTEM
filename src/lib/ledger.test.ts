import { describe, expect, it } from "vitest";

import {
  CATEGORY_LABELS,
  countsAgainstDailyTarget,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  countsAsIncome,
  countsAsShopExpense,
  incomeByTag,
  totalsFor,
  type LedgerEntry,
} from "./ledger";
import { parsePesos } from "./money";
import { computeDailyTarget, targetProgress } from "./target";

let nextId = 0;
function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  nextId += 1;
  return {
    id: `e${nextId}`,
    occurredAt: "2026-09-18T02:00:00Z",
    direction: "in",
    amountCentavos: parsePesos("100"),
    tag: "printshoppe",
    category: "document_printing",
    source: "cash_drawer",
    note: null,
    sourceTable: null,
    sourceId: null,
    ...overrides,
  };
}

describe("category catalogue", () => {
  it("gives every category a readable label", () => {
    for (const category of [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]) {
      expect(CATEGORY_LABELS[category], category).toBeTruthy();
    }
  });
});

describe("countsAsIncome", () => {
  it("counts a sale", () => {
    expect(countsAsIncome({ direction: "in", category: "document_printing" })).toBe(true);
    expect(countsAsIncome({ direction: "in", category: "sublimation_jerseys" })).toBe(true);
    expect(countsAsIncome({ direction: "in", category: "laptop_repair" })).toBe(true);
  });

  it("does NOT count borrowed money as income", () => {
    // This is the whole point of spec 10.1. Money in the drawer from a loan is
    // a bigger debt, not a good month.
    expect(countsAsIncome({ direction: "in", category: "loan_proceeds" })).toBe(false);
  });

  it("does NOT count the owner's own money as income", () => {
    expect(countsAsIncome({ direction: "in", category: "owner_capital" })).toBe(false);
  });

  it("never counts money going out", () => {
    expect(countsAsIncome({ direction: "out", category: "materials_supplies" })).toBe(false);
  });
});

describe("countsAsShopExpense", () => {
  it("counts the real costs of running the shop", () => {
    for (const category of [
      "materials_supplies",
      "fixed_bills",
      "loan_payments",
      "salaries",
      "meta_ads",
    ] as const) {
      expect(countsAsShopExpense({ direction: "out", category }), category).toBe(true);
    }
  });

  it("does NOT count an owner withdrawal as a shop expense", () => {
    // Spec 10.2: shown separately, so it cannot make the shop look unprofitable.
    expect(countsAsShopExpense({ direction: "out", category: "owner_withdrawal" })).toBe(false);
  });
});

describe("totalsFor", () => {
  it("keeps borrowed money out of income but still shows it", () => {
    const entries = [
      entry({ direction: "in", category: "document_printing", amountCentavos: parsePesos("5000") }),
      entry({ direction: "in", category: "loan_proceeds", amountCentavos: parsePesos("100000") }),
      entry({ direction: "out", category: "materials_supplies", amountCentavos: parsePesos("2000") }),
    ];

    const totals = totalsFor(entries);

    expect(totals.income).toBe(parsePesos("5000"));
    expect(totals.nonIncomeIn).toBe(parsePesos("100000"));
    // Profit is PHP 3,000, not PHP 103,000. A loan does not make a good month.
    expect(totals.profit).toBe(parsePesos("3000"));
    // But the money really did move, so the raw totals include it.
    expect(totals.totalIn).toBe(parsePesos("105000"));
  });

  it("keeps an owner withdrawal out of expenses but still shows it", () => {
    const entries = [
      entry({ direction: "in", category: "photocopy", amountCentavos: parsePesos("10000") }),
      entry({ direction: "out", category: "owner_withdrawal", amountCentavos: parsePesos("8000") }),
    ];

    const totals = totalsFor(entries);

    expect(totals.expenses).toBe(0);
    expect(totals.ownerWithdrawals).toBe(parsePesos("8000"));
    expect(totals.profit).toBe(parsePesos("10000"));
    expect(totals.totalOut).toBe(parsePesos("8000"));
  });

  it("adds up a realistic day without losing a centavo", () => {
    const entries = [
      entry({ direction: "in", category: "document_printing", amountCentavos: parsePesos("1250.50") }),
      entry({ direction: "in", category: "photocopy", amountCentavos: parsePesos("340.75") }),
      entry({ direction: "in", category: "tarpaulin", amountCentavos: parsePesos("450") }),
      entry({ direction: "out", category: "materials_supplies", amountCentavos: parsePesos("899.25") }),
      entry({ direction: "out", category: "meals_snacks", amountCentavos: parsePesos("150") }),
    ];

    const totals = totalsFor(entries);
    expect(totals.income).toBe(parsePesos("2041.25"));
    expect(totals.expenses).toBe(parsePesos("1049.25"));
    expect(totals.profit).toBe(parsePesos("992"));
    expect(totals.income - totals.expenses).toBe(totals.profit);
  });

  it("reports zeros for an empty ledger", () => {
    expect(totalsFor([])).toEqual({
      income: 0,
      expenses: 0,
      profit: 0,
      nonIncomeIn: 0,
      ownerWithdrawals: 0,
      totalIn: 0,
      totalOut: 0,
      targetCosts: 0,
      towardTarget: 0,
    });
  });

  it("can report a loss", () => {
    const totals = totalsFor([
      entry({ direction: "in", category: "photocopy", amountCentavos: parsePesos("500") }),
      entry({ direction: "out", category: "fixed_bills", amountCentavos: parsePesos("35000") }),
    ]);
    expect(totals.profit).toBe(parsePesos("-34500"));
  });
});

describe("incomeByTag", () => {
  it("splits income by division", () => {
    const entries = [
      entry({ tag: "printshoppe", category: "photocopy", amountCentavos: parsePesos("300") }),
      entry({ tag: "printshoppe", category: "tarpaulin", amountCentavos: parsePesos("450") }),
      entry({ tag: "apparel", category: "sublimation_jerseys", amountCentavos: parsePesos("12000") }),
      entry({ tag: "dabztech", category: "laptop_repair", amountCentavos: parsePesos("2500") }),
      // Borrowed money is tagged to the whole shop but is not income.
      entry({ tag: "whole_shop", category: "loan_proceeds", amountCentavos: parsePesos("50000") }),
      entry({ direction: "out", tag: "printshoppe", category: "materials_supplies", amountCentavos: parsePesos("900") }),
    ];

    expect(incomeByTag(entries)).toEqual({
      printshoppe: parsePesos("750"),
      apparel: parsePesos("12000"),
      dabztech: parsePesos("2500"),
      whole_shop: 0,
    });
  });
});

describe("computeDailyTarget", () => {
  it("divides the monthly need by the working days", () => {
    // The owner's real bills: PHP 141,127 over 26 working days.
    const target = computeDailyTarget({
      monthlyBillsCentavos: parsePesos("141127"),
      monthlyPayrollCentavos: null,
      workingDaysPerMonth: 26,
    });

    // 14,112,700 / 26 = 542,796.15... -> rounded up to 542,797 centavos
    expect(target.targetCentavos).toBe(542797);
    expect(target.payrollIsMissing).toBe(true);
  });

  it("rounds up, so a month of daily targets covers what is owed", () => {
    const target = computeDailyTarget({
      monthlyBillsCentavos: parsePesos("141127"),
      monthlyPayrollCentavos: null,
      workingDaysPerMonth: 26,
    });
    expect(target.targetCentavos * 26).toBeGreaterThanOrEqual(parsePesos("141127"));
  });

  it("includes payroll once staff rates exist", () => {
    const withPayroll = computeDailyTarget({
      monthlyBillsCentavos: parsePesos("141127"),
      monthlyPayrollCentavos: parsePesos("52000"),
      workingDaysPerMonth: 26,
    });

    // (141,127 + 52,000) / 26 = 7,427.9615... a day, rounded up.
    expect(withPayroll.targetCentavos).toBe(parsePesos("7427.97"));
    expect(withPayroll.payrollIsMissing).toBe(false);
  });

  it("changes when the owner changes the working days", () => {
    const base = { monthlyBillsCentavos: parsePesos("141127"), monthlyPayrollCentavos: null };
    const over26 = computeDailyTarget({ ...base, workingDaysPerMonth: 26 });
    const over30 = computeDailyTarget({ ...base, workingDaysPerMonth: 30 });
    // More working days means less needed each day.
    expect(over30.targetCentavos).toBeLessThan(over26.targetCentavos);
  });

  it("always returns whole centavos", () => {
    for (const days of [1, 7, 13, 26, 30, 31]) {
      const target = computeDailyTarget({
        monthlyBillsCentavos: parsePesos("141127"),
        monthlyPayrollCentavos: parsePesos("52000"),
        workingDaysPerMonth: days,
      });
      expect(Number.isInteger(target.targetCentavos), `${days} days`).toBe(true);
    }
  });

  it("refuses an impossible number of working days", () => {
    expect(() =>
      computeDailyTarget({
        monthlyBillsCentavos: parsePesos("141127"),
        monthlyPayrollCentavos: null,
        workingDaysPerMonth: 0,
      }),
    ).toThrow();
  });
});

describe("targetProgress", () => {
  const targetCentavos = parsePesos("5427.97");

  it("works out how far through the day the shop is", () => {
    const progress = targetProgress({
      achievedCentavos: parsePesos("2713.99"),
      targetCentavos,
    });
    expect(progress.percent).toBe(50);
    expect(progress.reached).toBe(false);
    expect(progress.shortfallCentavos).toBe(parsePesos("2713.98"));
  });

  it("marks the target reached when it is met exactly", () => {
    const progress = targetProgress({ achievedCentavos: targetCentavos, targetCentavos });
    expect(progress.reached).toBe(true);
    expect(progress.percent).toBe(100);
    expect(progress.shortfallCentavos).toBe(0);
  });

  it("caps the bar at 100 percent on a very good day", () => {
    const progress = targetProgress({
      achievedCentavos: parsePesos("20000"),
      targetCentavos,
    });
    expect(progress.percent).toBe(100);
    expect(progress.reached).toBe(true);
  });

  it("handles a day with nothing sold yet", () => {
    const progress = targetProgress({ achievedCentavos: 0, targetCentavos });
    expect(progress.percent).toBe(0);
    expect(progress.shortfallCentavos).toBe(targetCentavos);
  });

  /*
    A zero target is what a shop looks like before any bills are entered, which
    since the catalogue was cleared is every shop on its first day. Calling it
    "reached" would put a green tick at the top of the Overview before a single
    sale, so it reports "not known yet" instead - and never divides by zero.
  */
  it("says a target of zero is not known rather than reached", () => {
    expect(targetProgress({ achievedCentavos: 0, targetCentavos: 0 })).toMatchObject({
      percent: 0,
      reached: false,
      unknown: true,
      shortfallCentavos: 0,
    });
  });

  it("does not call a real target unknown, even on a day with nothing sold", () => {
    expect(
      targetProgress({ achievedCentavos: 0, targetCentavos }).unknown,
    ).toBe(false);
    expect(
      targetProgress({ achievedCentavos: targetCentavos, targetCentavos }).unknown,
    ).toBe(false);
  });

  it("does not report a day's takings as reaching nothing", () => {
    // Money taken in against no target is still not an achievement to tick.
    const progress = targetProgress({
      achievedCentavos: parsePesos("3000"),
      targetCentavos: 0,
    });
    expect(progress.reached).toBe(false);
    expect(progress.unknown).toBe(true);
  });

  it("treats a loss-making day as zero progress, not negative", () => {
    const progress = targetProgress({
      achievedCentavos: parsePesos("-500"),
      targetCentavos,
    });
    expect(progress.percent).toBe(0);
    expect(progress.reached).toBe(false);
  });
});

describe("countsAgainstDailyTarget", () => {
  it("counts materials, fuel and meals, which the target does not cover", () => {
    for (const category of [
      "materials_supplies",
      "fuel_transportation",
      "meals_snacks",
      "delivery_shipping",
      "machine_maintenance",
      "new_equipment",
      "meta_ads",
      "miscellaneous",
    ] as const) {
      expect(
        countsAgainstDailyTarget({ direction: "out", category }),
        category,
      ).toBe(true);
    }
  });

  it("does NOT count a bill, a loan payment or a wage - the target IS those", () => {
    // Counting them would subtract them from the day's takings while the
    // target is already asking the takings to cover them: twice over.
    for (const category of [
      "fixed_bills",
      "loan_payments",
      "salaries",
      "cash_advances",
    ] as const) {
      expect(
        countsAgainstDailyTarget({ direction: "out", category }),
        category,
      ).toBe(false);
    }
  });

  it("does NOT count an owner withdrawal, which is not a shop cost at all", () => {
    expect(
      countsAgainstDailyTarget({ direction: "out", category: "owner_withdrawal" }),
    ).toBe(false);
  });

  it("does not count money coming in", () => {
    expect(
      countsAgainstDailyTarget({ direction: "in", category: "photocopy" }),
    ).toBe(false);
  });
});

describe("progress toward the daily target", () => {
  it("takes materials off the takings but leaves the bill alone", () => {
    const totals = totalsFor([
      entry({ direction: "in", category: "photocopy", amountCentavos: parsePesos("5000") }),
      entry({
        direction: "out",
        category: "materials_supplies",
        amountCentavos: parsePesos("2000"),
      }),
      entry({
        direction: "out",
        category: "fixed_bills",
        amountCentavos: parsePesos("3500"),
      }),
    ]);

    // ₱5,000 of tarpaulin sales that used ₱2,000 of vinyl is ₱3,000 toward the
    // target - not ₱5,000, and not -₱500 after also subtracting the bill.
    expect(totals.targetCosts).toBe(parsePesos("2000"));
    expect(totals.towardTarget).toBe(parsePesos("3000"));

    // The full profit figure still counts the bill, because it is a real cost.
    expect(totals.expenses).toBe(parsePesos("5500"));
    expect(totals.profit).toBe(parsePesos("-500"));
  });

  it("is the same as income when nothing was bought", () => {
    const totals = totalsFor([
      entry({ direction: "in", category: "photocopy", amountCentavos: parsePesos("1200") }),
    ]);
    expect(totals.towardTarget).toBe(totals.income);
  });

  it("can go negative on a day that only spent", () => {
    const totals = totalsFor([
      entry({
        direction: "out",
        category: "materials_supplies",
        amountCentavos: parsePesos("800"),
      }),
    ]);
    expect(totals.towardTarget).toBe(parsePesos("-800"));
  });
});
