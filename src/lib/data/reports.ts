import "server-only";

/**
 * Reading what the reports add up (spec 15.3).
 *
 * Reports read only what the earlier phases already write - no report table,
 * no nightly job, nothing to fall out of step. The cost is that a report is
 * computed every time it is opened; the benefit is that it can never disagree
 * with the screens it was built from.
 */
import { cache } from "react";

import { getApparelOrders } from "@/lib/data/apparel";
import { getPayables } from "@/lib/data/expenses";
import {
  getBillPayments,
  getBills,
  getLedgerEntries,
  getLoanSummaries,
  liveEntries,
  paidKeysFrom,
} from "@/lib/data/money";
import { getRepairTickets } from "@/lib/data/repairs";
import { getStockOverview } from "@/lib/data/stocks";
import { monthTotals } from "@/lib/bills";
import { totalRemainingDebt } from "@/lib/loans";
import { sumCentavos, type Centavos } from "@/lib/money";
import {
  currentPeriod,
  manilaDayRangeUtc,
  manilaToday,
  parseISODate,
} from "@/lib/period";
import { buildReport, previousRange, type PeriodReport, type ReportRange } from "@/lib/reports";

/**
 * The UTC window that holds a range of Manila days.
 *
 * Manila is +08:00 all year, so a Manila day starts at 16:00 UTC the day
 * before. Comparing a stored timestamp to a bare date would put every early
 * morning sale in the wrong day - see src/lib/period.ts.
 */
function utcWindow(range: ReportRange): { from: string; to: string } {
  const from = parseISODate(range.fromISO);
  const to = parseISODate(range.toISO);

  if (!from || !to) {
    const today = manilaDayRangeUtc(manilaToday());
    return today;
  }

  return {
    from: manilaDayRangeUtc(from).from,
    to: manilaDayRangeUtc(to).to,
  };
}

export async function getReport(range: ReportRange): Promise<PeriodReport> {
  const window = utcWindow(range);

  const entries = liveEntries(
    await getLedgerEntries({ from: window.from, to: window.to, limit: 5000 }),
  );

  return buildReport(entries, range);
}

/** The same report for the period before, so the two can be compared. */
export async function getReportWithComparison(
  range: ReportRange,
): Promise<{ current: PeriodReport; previous: PeriodReport }> {
  const earlier = previousRange(range);

  const [current, previous] = await Promise.all([
    getReport(range),
    getReport(earlier),
  ]);

  return { current, previous };
}

// ---------------------------------------------------------------------------
// Where the shop stands, as of today
// ---------------------------------------------------------------------------

export interface Standing {
  /** Owed TO the shop: unpaid balances on job orders and repairs. */
  owedToShopCentavos: Centavos;
  apparelOwedCentavos: Centavos;
  repairsOwedCentavos: Centavos;

  /** Owed BY the shop. */
  billsUnpaidThisMonthCentavos: Centavos;
  loanDebtCentavos: Centavos;
  supplierPayablesCentavos: Centavos;
  owedByShopCentavos: Centavos;

  /** What is on the shelves, and how much of it could not be valued. */
  stockValueCentavos: Centavos;
  stockUnpricedCount: number;
}

/**
 * A point-in-time picture, not a period one.
 *
 * Kept apart from the report on purpose: "we are owed PHP 40,000" is true
 * today, not "in September", and putting it in a monthly column would invite
 * it to be added to the month's income - which would count the same money
 * twice, once when it was earned and once when it is still owed.
 */
export const getStanding = cache(async (): Promise<Standing> => {
  const today = manilaToday();
  const period = currentPeriod();

  const [bills, payments, loans, payables, apparel, repairs, stock] =
    await Promise.all([
      getBills(),
      getBillPayments(period),
      getLoanSummaries(),
      getPayables(),
      getApparelOrders(),
      getRepairTickets(),
      getStockOverview(),
    ]);

  const billTotals = monthTotals({
    bills,
    paidKeys: paidKeysFrom(payments),
    period,
    today,
  });

  // A cancelled order owes nothing, whatever was written on it.
  const apparelOwedCentavos = sumCentavos(
    apparel
      .filter((entry) => entry.order.status !== "cancelled")
      .map((entry) => entry.totals.balanceCentavos),
  );

  const repairsOwedCentavos = sumCentavos(
    repairs.map((entry) => entry.totals.balanceCentavos),
  );

  const supplierPayablesCentavos = sumCentavos(
    payables
      .filter((payable) => payable.status === "unpaid")
      .map((payable) => payable.amountCentavos),
  );

  const loanDebtCentavos = totalRemainingDebt(loans);

  return {
    owedToShopCentavos: apparelOwedCentavos + repairsOwedCentavos,
    apparelOwedCentavos,
    repairsOwedCentavos,

    billsUnpaidThisMonthCentavos: billTotals.unpaid,
    loanDebtCentavos,
    supplierPayablesCentavos,
    owedByShopCentavos:
      billTotals.unpaid + loanDebtCentavos + supplierPayablesCentavos,

    stockValueCentavos: stock.value.valueCentavos,
    stockUnpricedCount: stock.value.unpricedCount,
  };
});
