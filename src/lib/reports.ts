/**
 * Reports (spec 15.3).
 *
 * Reports come last on purpose: they invent nothing. Every figure here is a
 * sum over rows the earlier phases already write, which is why this file has
 * no database reads in it at all - hand it ledger entries and a date range and
 * it will add them up the same way every time.
 *
 * THE FIGURE THAT MATTERS
 * Profit is income less what it cost to run the shop. Borrowed money and the
 * owner's own capital are NOT income, and an owner withdrawal is not a shop
 * cost - so a month where PHP 100,000 was borrowed does not look like a good
 * month. That rule lives in ledger.ts and this file just obeys it.
 */
import { divisionName, type ExpenseTag } from "./divisions";
import {
  CATEGORY_LABELS,
  countsAgainstDailyTarget,
  countsAsIncome,
  countsAsShopExpense,
  totalsFor,
  type LedgerEntry,
} from "./ledger";
import { sumCentavos, type Centavos } from "./money";

// ---------------------------------------------------------------------------
// The period being reported on
// ---------------------------------------------------------------------------

export interface ReportRange {
  /** Manila calendar dates, inclusive at both ends. */
  fromISO: string;
  toISO: string;
  label: string;
}

export const RANGE_PRESETS = [
  "today",
  "this_week",
  "this_month",
  "last_month",
  "this_year",
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  today: "Today",
  this_week: "This week",
  this_month: "This month",
  last_month: "Last month",
  this_year: "This year",
};

export function rangeForPreset(
  preset: RangePreset,
  todayISO: string,
  weekStartsOn: "monday" | "sunday" = "monday",
): ReportRange {
  const [year, month, day] = todayISO.split("-").map(Number);

  switch (preset) {
    case "today":
      return { fromISO: todayISO, toISO: todayISO, label: "Today" };

    case "this_week": {
      // getUTCDay() is 0 for Sunday. Built on a UTC date made from the parts,
      // so no timezone anywhere else can shift which day it thinks it is.
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      const back =
        weekStartsOn === "monday" ? (weekday + 6) % 7 : weekday;
      return {
        fromISO: addDaysISO(todayISO, -back),
        toISO: todayISO,
        label: "This week so far",
      };
    }

    case "this_month":
      return {
        fromISO: `${pad4(year)}-${pad2(month)}-01`,
        toISO: todayISO,
        label: "This month so far",
      };

    case "last_month": {
      const lastMonth = month === 1 ? 12 : month - 1;
      const lastYear = month === 1 ? year - 1 : year;
      return {
        fromISO: `${pad4(lastYear)}-${pad2(lastMonth)}-01`,
        toISO: `${pad4(lastYear)}-${pad2(lastMonth)}-${pad2(
          daysInMonth(lastYear, lastMonth),
        )}`,
        label: "Last month",
      };
    }

    case "this_year":
      return {
        fromISO: `${pad4(year)}-01-01`,
        toISO: todayISO,
        label: "This year so far",
      };
  }
}

/**
 * The same length of time, immediately before this one.
 *
 * Used for "compared with", so the comparison is like for like: eleven days of
 * this month against the eleven days before it, not against a whole month.
 */
export function previousRange(range: ReportRange): ReportRange {
  const days = daysBetweenISO(range.fromISO, range.toISO);
  return {
    fromISO: addDaysISO(range.fromISO, -(days + 1)),
    toISO: addDaysISO(range.fromISO, -1),
    label: "the same length of time before",
  };
}

/** Does this entry fall inside the range? Both ends are included. */
export function inRange(occurredAtManilaISO: string, range: ReportRange): boolean {
  return (
    occurredAtManilaISO >= range.fromISO && occurredAtManilaISO <= range.toISO
  );
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface CategoryLine {
  category: string;
  label: string;
  amountCentavos: Centavos;
  /**
   * Percentage of the group's total, rounded to a whole number FOR DISPLAY.
   *
   * These deliberately do not add up to exactly 100 - forcing them to would
   * mean printing a share that is not the one the money actually makes. The
   * amounts are the truth; the percentages are a reading aid.
   */
  sharePercent: number;
  /** The percentage as words. Real money never reads as "0%". */
  shareLabel: string;
}

export interface DivisionLine {
  tag: ExpenseTag;
  name: string;
  incomeCentavos: Centavos;
  sharePercent: number;
  shareLabel: string;
  categories: CategoryLine[];
}

export interface PeriodReport {
  range: ReportRange;
  entryCount: number;

  incomeCentavos: Centavos;
  expensesCentavos: Centavos;
  profitCentavos: Centavos;

  /** Money in that is not earnings: borrowed money, owner capital. */
  nonIncomeInCentavos: Centavos;
  /** Money out that is not a shop cost: the owner taking money. */
  ownerWithdrawalsCentavos: Centavos;

  /** What it cost to do the work - materials, fuel, meals (spec 12.3). */
  runningCostsCentavos: Centavos;

  byDivision: DivisionLine[];
  incomeByCategory: CategoryLine[];
  expensesByCategory: CategoryLine[];
}

function share(amount: Centavos, total: Centavos): number {
  if (total <= 0) return 0;
  return Math.round((amount / total) * 100);
}

/**
 * The share as words.
 *
 * A real PHP 180 among PHP 59,510 rounds to 0%, and printing "0%" beside money
 * that was actually spent reads as a mistake in the report. "<1%" is both
 * shorter and true.
 */
function shareLabel(amount: Centavos, total: Centavos): string {
  const percent = share(amount, total);
  if (percent === 0 && amount !== 0 && total > 0) {
    return amount > 0 ? "<1%" : ">-1%";
  }
  return `${percent}%`;
}

function categoryLines(
  amounts: Map<string, Centavos>,
  total: Centavos,
): CategoryLine[] {
  return [...amounts.entries()]
    .filter(([, amount]) => amount !== 0)
    .map(([category, amountCentavos]) => ({
      category,
      label: CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category,
      amountCentavos,
      sharePercent: share(amountCentavos, total),
      shareLabel: shareLabel(amountCentavos, total),
    }))
    .sort((a, b) => b.amountCentavos - a.amountCentavos);
}

/**
 * Adds up a period.
 *
 * Takes entries that have ALREADY been filtered to the range and to live
 * (non-voided) rows - that filtering belongs with the database read, and doing
 * it twice is how the two end up disagreeing.
 */
export function buildReport(
  entries: readonly LedgerEntry[],
  range: ReportRange,
): PeriodReport {
  const totals = totalsFor(entries);

  const incomeByTag = new Map<ExpenseTag, Centavos>();
  const categoriesByTag = new Map<ExpenseTag, Map<string, Centavos>>();
  const incomeCategories = new Map<string, Centavos>();
  const expenseCategories = new Map<string, Centavos>();

  for (const entry of entries) {
    if (countsAsIncome(entry)) {
      incomeByTag.set(
        entry.tag,
        (incomeByTag.get(entry.tag) ?? 0) + entry.amountCentavos,
      );

      const own = categoriesByTag.get(entry.tag) ?? new Map<string, Centavos>();
      own.set(entry.category, (own.get(entry.category) ?? 0) + entry.amountCentavos);
      categoriesByTag.set(entry.tag, own);

      incomeCategories.set(
        entry.category,
        (incomeCategories.get(entry.category) ?? 0) + entry.amountCentavos,
      );
    } else if (countsAsShopExpense(entry)) {
      expenseCategories.set(
        entry.category,
        (expenseCategories.get(entry.category) ?? 0) + entry.amountCentavos,
      );
    }
  }

  const byDivision: DivisionLine[] = [...incomeByTag.entries()]
    .map(([tag, incomeCentavos]) => ({
      tag,
      name: divisionName(tag),
      incomeCentavos,
      sharePercent: share(incomeCentavos, totals.income),
      shareLabel: shareLabel(incomeCentavos, totals.income),
      categories: categoryLines(
        categoriesByTag.get(tag) ?? new Map(),
        incomeCentavos,
      ),
    }))
    .sort((a, b) => b.incomeCentavos - a.incomeCentavos);

  return {
    range,
    entryCount: entries.length,
    incomeCentavos: totals.income,
    expensesCentavos: totals.expenses,
    profitCentavos: totals.profit,
    nonIncomeInCentavos: totals.nonIncomeIn,
    ownerWithdrawalsCentavos: totals.ownerWithdrawals,
    runningCostsCentavos: sumCentavos(
      entries.filter(countsAgainstDailyTarget).map((e) => e.amountCentavos),
    ),
    byDivision,
    incomeByCategory: categoryLines(incomeCategories, totals.income),
    expensesByCategory: categoryLines(expenseCategories, totals.expenses),
  };
}

// ---------------------------------------------------------------------------
// Comparing with the period before
// ---------------------------------------------------------------------------

export interface Change {
  /** This period less the one before. Negative means it fell. */
  differenceCentavos: Centavos;
  /** Null when there is nothing to compare against - never shown as 0%. */
  percent: number | null;
  direction: "up" | "down" | "same";
  label: string;
}

/**
 * How this period compares with the one before.
 *
 * When the earlier period was zero there is no percentage to give: "up 100%"
 * from nothing is meaningless, and "up ∞%" is worse. It says so instead.
 */
export function compareTo(
  currentCentavos: Centavos,
  previousCentavos: Centavos,
): Change {
  const differenceCentavos = currentCentavos - previousCentavos;

  const direction =
    differenceCentavos > 0 ? "up" : differenceCentavos < 0 ? "down" : "same";

  if (previousCentavos === 0) {
    return {
      differenceCentavos,
      percent: null,
      direction,
      label:
        currentCentavos === 0
          ? "nothing either time"
          : "nothing to compare with",
    };
  }

  const percent = Math.round(
    (differenceCentavos / Math.abs(previousCentavos)) * 100,
  );

  return {
    differenceCentavos,
    percent,
    direction,
    label:
      direction === "same"
        ? "the same"
        : `${direction === "up" ? "up" : "down"} ${Math.abs(percent)}%`,
  };
}

// ---------------------------------------------------------------------------
// Taking it away (spec 15.3)
// ---------------------------------------------------------------------------

/**
 * The report as comma-separated rows, for a spreadsheet or a bookkeeper.
 *
 * Amounts are written as plain decimals with two places - no peso sign, no
 * thousands separator - because a spreadsheet has to read them as numbers. A
 * comma inside a label would split a row, so every field is quoted.
 */
export function toCsv(report: PeriodReport): string {
  const rows: string[][] = [
    ["Dabz System report"],
    ["From", report.range.fromISO],
    ["To", report.range.toISO],
    [],
    ["Summary", "Amount"],
    ["Income", pesos(report.incomeCentavos)],
    ["Shop expenses", pesos(report.expensesCentavos)],
    ["Profit", pesos(report.profitCentavos)],
    ["Money in that is not income", pesos(report.nonIncomeInCentavos)],
    ["Owner withdrawals", pesos(report.ownerWithdrawalsCentavos)],
    [],
    ["Income by division", "Amount", "Share %"],
    // The CSV keeps the plain number, not the "<1%" wording: a spreadsheet
    // has to read this column as a number.
    ...report.byDivision.map((line) => [
      line.name,
      pesos(line.incomeCentavos),
      String(line.sharePercent),
    ]),
    [],
    ["Income by category", "Amount", "Share %"],
    ...report.incomeByCategory.map((line) => [
      line.label,
      pesos(line.amountCentavos),
      String(line.sharePercent),
    ]),
    [],
    ["Expenses by category", "Amount", "Share %"],
    ...report.expensesByCategory.map((line) => [
      line.label,
      pesos(line.amountCentavos),
      String(line.sharePercent),
    ]),
  ];

  return rows.map((row) => row.map(csvField).join(",")).join("\n");
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Centavos as a plain decimal a spreadsheet will read as a number. */
function pesos(centavos: Centavos): string {
  const negative = centavos < 0;
  const absolute = Math.abs(centavos);
  return `${negative ? "-" : ""}${Math.floor(absolute / 100)}.${String(
    absolute % 100,
  ).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Dates, built from the parts
// ---------------------------------------------------------------------------

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function pad4(value: number): string {
  return String(value).padStart(4, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function utcOf(iso: string): number {
  return Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
}

function daysBetweenISO(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / 86_400_000);
}

function addDaysISO(from: string, days: number): string {
  return new Date(utcOf(from) + days * 86_400_000).toISOString().slice(0, 10);
}
