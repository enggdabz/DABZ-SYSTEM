/**
 * The online shop's figures (docs/spec.md 7.7, 9.5).
 *
 * Nothing is stored. There is no report table and no nightly job: this takes
 * orders and payments and adds them up, and the screen computes it fresh every
 * time it is opened. The cost is one read per visit; the benefit is that a
 * report can never fall out of step with the orders it was built from. That is
 * the same decision Phase 8 made for the shop's own reports.
 *
 * TWO FIGURES, AND THEY ARE NOT THE SAME THING.
 *   Sales booked   - what was ORDERED, counted on the day it was ordered.
 *   Cash collected - what was PAID, counted on the day it came in.
 * A down payment in September on a jersey ordered in August lands in a
 * different bucket of each, which is correct and is why the screen prints a
 * footnote saying so.
 */
import { sumCentavos, type Centavos } from "@/lib/money";
import {
  addDays,
  addMonths,
  civilDateFromTimestamp,
  civilDateToISO,
  compareCivilDates,
  daysInMonth,
  formatPeriod,
  parseISODate,
  periodKey,
  startOfWeek,
  type CivilDate,
  type Period,
} from "@/lib/period";

import { splitQuoteByPieces } from "./totals";
import type { OrderStatus } from "./types";

/** An order, as a report needs it. */
export interface ReportOrder {
  id: string;
  status: OrderStatus;
  /** The stored UTC timestamp. Bucketed by its MANILA date. */
  createdAt: string;
  totalCentavos: Centavos;
  pieces: number;
}

export interface ReportPayment {
  /** A date column, already a Manila date. */
  paidOn: string;
  amountCentavos: Centavos;
  voidedAt: string | null;
}

export interface DateRange {
  from: CivilDate;
  to: CivilDate;
  label: string;
}

function within(date: CivilDate, range: DateRange): boolean {
  return (
    compareCivilDates(date, range.from) >= 0 && compareCivilDates(date, range.to) <= 0
  );
}

/** A cancelled order was never a sale. Everything else counts. */
function counts(order: ReportOrder): boolean {
  return order.status !== "cancelled";
}

export interface PeriodFigures {
  salesBookedCentavos: Centavos;
  cashCollectedCentavos: Centavos;
  ordersReceived: number;
  pieces: number;
  /** Null when no orders came in - dividing by nothing says nothing. */
  averageOrderCentavos: Centavos | null;
}

export function figuresFor(
  orders: readonly ReportOrder[],
  payments: readonly ReportPayment[],
  range: DateRange,
): PeriodFigures {
  const inRange = orders.filter(
    (order) => counts(order) && within(civilDateFromTimestamp(order.createdAt), range),
  );

  const salesBookedCentavos = sumCentavos(inRange.map((order) => order.totalCentavos));

  const cashCollectedCentavos = sumCentavos(
    payments
      .filter((payment) => payment.voidedAt === null)
      .filter((payment) => {
        const date = parseISODate(payment.paidOn);
        return date !== null && within(date, range);
      })
      .map((payment) => payment.amountCentavos),
  );

  return {
    salesBookedCentavos,
    cashCollectedCentavos,
    ordersReceived: inRange.length,
    pieces: inRange.reduce((total, order) => total + order.pieces, 0),
    averageOrderCentavos:
      inRange.length === 0
        ? null
        : Math.round(salesBookedCentavos / inRange.length),
  };
}

// ---------------------------------------------------------------------------
// Comparing one stretch of time with another
// ---------------------------------------------------------------------------

export interface Comparison {
  /** Null when there was nothing to compare with. */
  percent: number | null;
  direction: "up" | "down" | "flat" | "unknown";
  /** What it was compared with, in words. */
  against: string;
}

/**
 * The change, and an honest answer when there isn't one.
 *
 * A PERCENTAGE AGAINST ZERO IS NEVER GIVEN. "Up 100%" from nothing is
 * meaningless and "up infinity%" is worse, so the answer is that there was
 * nothing to compare with - which is what the screen then says.
 */
export function compareTo(
  now: Centavos | number,
  before: Centavos | number,
  against: string,
): Comparison {
  if (before === 0) {
    return { percent: null, direction: "unknown", against };
  }

  const percent = Math.round(((now - before) / before) * 100);
  return {
    percent,
    direction: percent > 0 ? "up" : percent < 0 ? "down" : "flat",
    against,
  };
}

/**
 * This month so far, against the SAME DAYS of last month.
 *
 * Not against the whole of last month: eleven days measured against thirty
 * always reads as a collapse, whatever the shop actually did.
 */
export function monthToDateRanges(today: CivilDate): {
  thisMonth: DateRange;
  lastMonth: DateRange;
} {
  const period: Period = { year: today.year, month: today.month };
  const previous = addMonths(period, -1);

  // A 31st compared with a February needs the last day February has.
  const lastDayPrevious = Math.min(today.day, daysInMonth(previous));

  return {
    thisMonth: {
      from: { year: period.year, month: period.month, day: 1 },
      to: today,
      label: `${formatPeriod(period)} so far`,
    },
    lastMonth: {
      from: { year: previous.year, month: previous.month, day: 1 },
      to: { year: previous.year, month: previous.month, day: lastDayPrevious },
      label: `the first ${lastDayPrevious} day${
        lastDayPrevious === 1 ? "" : "s"
      } of ${formatPeriod(previous)}`,
    },
  };
}

// ---------------------------------------------------------------------------
// The buckets under the charts
// ---------------------------------------------------------------------------

export const CHART_PERIODS = ["8_weeks", "12_weeks", "6_months"] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number];

export const CHART_PERIOD_LABELS: Record<ChartPeriod, string> = {
  "8_weeks": "Last 8 weeks",
  "12_weeks": "Last 12 weeks",
  "6_months": "Last 6 months",
};

export function parseChartPeriod(value: string | null | undefined): ChartPeriod {
  return (CHART_PERIODS as readonly string[]).includes(value ?? "")
    ? (value as ChartPeriod)
    : "8_weeks";
}

export interface Bucket extends DateRange {
  /** What goes under the column: "Sep 15" or "Sep". */
  shortLabel: string;
  key: string;
}

/**
 * The buckets, oldest first, with the week or month we are IN included.
 *
 * Weeks start on Monday (docs/spec.md 0.10) and are labelled by that Monday.
 * A part week at the right-hand end is the normal case, not an error - the
 * screen says so rather than leaving today out of its own report.
 */
export function bucketsFor(period: ChartPeriod, today: CivilDate): Bucket[] {
  if (period === "6_months") {
    const thisMonth: Period = { year: today.year, month: today.month };
    return Array.from({ length: 6 }, (_, index) => {
      const month = addMonths(thisMonth, index - 5);
      const last = daysInMonth(month);
      return {
        key: periodKey(month),
        from: { year: month.year, month: month.month, day: 1 },
        to: { year: month.year, month: month.month, day: last },
        label: formatPeriod(month),
        shortLabel: monthShort(month),
      };
    });
  }

  const weeks = period === "8_weeks" ? 8 : 12;
  const thisWeek = startOfWeek(today, "monday");

  return Array.from({ length: weeks }, (_, index) => {
    const from = addDays(thisWeek, (index - (weeks - 1)) * 7);
    const to = addDays(from, 6);
    return {
      key: civilDateToISO(from),
      from,
      to,
      label: `Week of ${dayShort(from)}`,
      shortLabel: dayShort(from),
    };
  });
}

function monthShort(period: Period): string {
  return new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(period.year, period.month - 1, 1)),
  );
}

function dayShort(date: CivilDate): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
}

export interface BucketFigures extends Bucket {
  figures: PeriodFigures;
}

export function bucketFigures(
  orders: readonly ReportOrder[],
  payments: readonly ReportPayment[],
  buckets: readonly Bucket[],
): BucketFigures[] {
  return buckets.map((bucket) => ({
    ...bucket,
    figures: figuresFor(orders, payments, bucket),
  }));
}

// ---------------------------------------------------------------------------
// Sales by product
// ---------------------------------------------------------------------------

export interface ProductSalesLine {
  productName: string;
  centavos: Centavos;
  pieces: number;
}

/**
 * What each product brought in over a period.
 *
 * A quote is ONE figure for a whole order, so an order's quote is split across
 * its quote items by pieces (`splitQuoteByPieces`), and the parts add back up
 * to the quote exactly. The product NAME is the snapshot on the line, not the
 * catalogue's current name, so a product renamed last week does not rewrite
 * the month before it.
 */
export function salesByProduct(
  orders: readonly (ReportOrder & {
    quoteAmountCentavos: Centavos | null;
    items: readonly {
      productName: string;
      pricingMode: "fixed" | "quote";
      unitPriceCentavos: Centavos | null;
      qty: number;
    }[];
  })[],
  range: DateRange,
): ProductSalesLine[] {
  const byName = new Map<string, ProductSalesLine>();

  const add = (productName: string, centavos: Centavos, pieces: number) => {
    const line = byName.get(productName) ?? { productName, centavos: 0, pieces: 0 };
    line.centavos += centavos;
    line.pieces += pieces;
    byName.set(productName, line);
  };

  for (const order of orders) {
    if (!counts(order)) continue;
    if (!within(civilDateFromTimestamp(order.createdAt), range)) continue;

    for (const item of order.items) {
      if (item.pricingMode === "fixed") {
        add(item.productName, (item.unitPriceCentavos ?? 0) * item.qty, item.qty);
      } else {
        // Counted for pieces now; its share of the quote is added below.
        add(item.productName, 0, item.qty);
      }
    }

    if (order.quoteAmountCentavos !== null) {
      const quoteItems = order.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.pricingMode === "quote");

      const shares = splitQuoteByPieces(
        order.quoteAmountCentavos,
        quoteItems.map(({ item, index }) => ({ key: String(index), pieces: item.qty })),
      );

      for (const share of shares) {
        const entry = quoteItems.find(({ index }) => String(index) === share.key);
        if (entry) add(entry.item.productName, share.centavos, 0);
      }
    }
  }

  return [...byName.values()].sort(
    (a, b) => b.centavos - a.centavos || a.productName.localeCompare(b.productName),
  );
}

/**
 * A share as a percentage, where real money never reads as "0%".
 *
 * A category that rounds below half a percent shows "<1%": a zero beside money
 * that was actually spent reads as a bug in the report.
 */
export function sharePercentLabel(part: Centavos, whole: Centavos): string {
  if (whole <= 0) return "—";
  const percent = (part / whole) * 100;
  if (part > 0 && percent < 0.5) return "<1%";
  return `${Math.round(percent)}%`;
}

// ---------------------------------------------------------------------------
// The target meter
// ---------------------------------------------------------------------------

export interface TargetMeter {
  /** Null when the owner has not set a target. The screen then says so. */
  targetCentavos: Centavos | null;
  bookedCentavos: Centavos;
  percent: number | null;
  remainingCentavos: Centavos | null;
  reached: boolean;
}

/**
 * How the month is going against the target.
 *
 * WITH NO TARGET SET THERE IS NO METER, and no "0% of PHP 0.00" either. The
 * same rule as a daily target of zero meaning "not known" rather than
 * "reached": the most confidently wrong thing this screen could print is a
 * full bar on the first of the month.
 */
export function targetMeter(
  bookedCentavos: Centavos,
  targetCentavos: Centavos | null,
): TargetMeter {
  if (targetCentavos === null || targetCentavos <= 0) {
    return {
      targetCentavos: null,
      bookedCentavos,
      percent: null,
      remainingCentavos: null,
      reached: false,
    };
  }

  const percent = Math.round((bookedCentavos / targetCentavos) * 100);
  return {
    targetCentavos,
    bookedCentavos,
    percent,
    remainingCentavos: Math.max(0, targetCentavos - bookedCentavos),
    reached: bookedCentavos >= targetCentavos,
  };
}
