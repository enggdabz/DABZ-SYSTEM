/**
 * The sales line on the Overview: money taken in, added up per day, week,
 * month or year.
 *
 * Like Reports, this stores nothing. It takes ledger entries and a list of
 * buckets and adds them up, so the line can never disagree with the target
 * card above it - "taken in" there and the last point here are the same sum
 * over the same rows.
 *
 * "Sales" here means EARNINGS (`countsAsIncome`): borrowed money and owner
 * capital also arrive as money in, and a loan would otherwise show up as the
 * best day the shop ever had.
 */
import {
  countsAsIncome,
  countsAsShopExpense,
  type LedgerCategory,
  type LedgerDirection,
} from "@/lib/ledger";
import { sumCentavos, type Centavos } from "@/lib/money";
import {
  addDays,
  addMonths,
  civilDateFromTimestamp,
  civilDateToISO,
  daysBetween,
  formatPeriod,
  periodKey,
  formatWeekRange,
  startOfWeek,
  type CivilDate,
  type Period,
  type WeekStart,
} from "@/lib/period";

/**
 * What a line adds up. "Sales" is earnings (see above). "Expenses" is the cost
 * of running the shop (`countsAsShopExpense`) - the same figure Reports calls
 * expenses - so an owner withdrawal is left out: taking money home is not a
 * shop cost, and it would otherwise read as the dearest day of the month.
 */
export type TrendMeasure = "sales" | "expenses";

export const TREND_MEASURE_LABELS: Record<TrendMeasure, string> = {
  sales: "Sales",
  expenses: "Expenses",
};

const COUNTS: Record<
  TrendMeasure,
  (entry: { direction: LedgerDirection; category: LedgerCategory }) => boolean
> = {
  sales: countsAsIncome,
  expenses: countsAsShopExpense,
};

export const TREND_VIEWS = ["daily", "weekly", "monthly", "yearly"] as const;
export type TrendView = (typeof TREND_VIEWS)[number];

export const TREND_VIEW_LABELS: Record<TrendView, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

/**
 * How many points each view shows. A month of days, a quarter of weeks, a
 * year of months - each long enough to see a pattern and short enough that
 * every point is still wide enough to tap on a phone.
 */
export const TREND_LENGTH: Record<TrendView, number> = {
  daily: 30,
  weekly: 12,
  monthly: 12,
  yearly: 5,
};

/** What the range is called in a sentence: "over the last 30 days". */
export const TREND_RANGE_WORDS: Record<TrendView, string> = {
  daily: "the last 30 days",
  weekly: "the last 12 weeks",
  monthly: "the last 12 months",
  yearly: "the last 5 years",
};

/** Anything unrecognised in the URL falls back to daily rather than failing. */
export function parseTrendView(value: string | undefined): TrendView {
  return TREND_VIEWS.includes(value as TrendView) ? (value as TrendView) : "daily";
}

export interface TrendBucket {
  /** First Manila day in the bucket. */
  start: CivilDate;
  /** The day AFTER the bucket ends, so buckets meet without a gap. */
  end: CivilDate;
  /** Full name, for the readout and the table: "Fri, 2 Oct 2026". */
  label: string;
  /** Under the axis: "2 Oct", "Oct", "2026". */
  shortLabel: string;
  /** The bucket today falls in - still filling up, so it says "so far". */
  current: boolean;
}

export interface TrendPoint extends TrendBucket {
  centavos: Centavos;
}

const utc = (date: CivilDate) => new Date(Date.UTC(date.year, date.month - 1, date.day));

function format(date: CivilDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-PH", { ...options, timeZone: "UTC" }).format(utc(date));
}

function dayBucket(start: CivilDate, current: boolean): TrendBucket {
  return {
    start,
    end: addDays(start, 1),
    label: format(start, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    shortLabel: format(start, { day: "numeric", month: "short" }),
    current,
  };
}

function monthBucket(period: Period, current: boolean): TrendBucket {
  const next = addMonths(period, 1);
  return {
    start: { ...period, day: 1 },
    end: { ...next, day: 1 },
    label: formatPeriod(period),
    shortLabel: format({ ...period, day: 1 }, { month: "short" }),
    current,
  };
}

/** The buckets for a view, oldest first, ending with the one today is in. */
export function trendBuckets(
  view: TrendView,
  today: CivilDate,
  weekStartsOn: WeekStart,
): TrendBucket[] {
  const count = TREND_LENGTH[view];
  const buckets: TrendBucket[] = [];

  for (let back = count - 1; back >= 0; back -= 1) {
    const current = back === 0;

    if (view === "daily") {
      buckets.push(dayBucket(addDays(today, -back), current));
    } else if (view === "weekly") {
      const start = addDays(startOfWeek(today, weekStartsOn), -7 * back);
      buckets.push({
        start,
        end: addDays(start, 7),
        label: formatWeekRange(start),
        shortLabel: format(start, { day: "numeric", month: "short" }),
        current,
      });
    } else if (view === "monthly") {
      buckets.push(monthBucket(addMonths({ year: today.year, month: today.month }, -back), current));
    } else {
      const year = today.year - back;
      buckets.push({
        start: { year, month: 1, day: 1 },
        end: { year: year + 1, month: 1, day: 1 },
        label: String(year),
        shortLabel: String(year),
        current,
      });
    }
  }

  return buckets;
}

/**
 * The longest range drawn a day at a time. Two months of days is about as many
 * points as a phone can still show one tap apart; past that, the Reports graph
 * goes a month at a time.
 */
export const RANGE_DAILY_LIMIT = 62;

/**
 * Buckets for a fixed range of Manila dates, inclusive at both ends - the
 * Reports page's chosen period. Days for a short range, months for a long one.
 * A month bucket may run past the range at either end; that is harmless,
 * because only the range is ever read from the ledger.
 */
export function bucketsForRange(
  from: CivilDate,
  to: CivilDate,
  today: CivilDate,
): TrendBucket[] {
  const todayISO = civilDateToISO(today);
  const contains = (bucket: TrendBucket) =>
    todayISO >= civilDateToISO(bucket.start) && todayISO < civilDateToISO(bucket.end);
  const buckets: TrendBucket[] = [];

  if (daysBetween(from, to) + 1 <= RANGE_DAILY_LIMIT) {
    for (let day = from; civilDateToISO(day) <= civilDateToISO(to); day = addDays(day, 1)) {
      buckets.push(dayBucket(day, false));
    }
  } else {
    const last = periodKey(to);
    let month: Period = { year: from.year, month: from.month };
    for (; periodKey(month) <= last; month = addMonths(month, 1)) {
      buckets.push(monthBucket(month, false));
    }
  }

  return buckets.map((bucket) => ({ ...bucket, current: contains(bucket) }));
}

/** The ledger fields the line needs - nothing else is read. */
export interface TrendEntry {
  occurredAt: string;
  direction: LedgerDirection;
  category: LedgerCategory;
  amountCentavos: Centavos;
  voidedAt: string | null;
}

/**
 * Adds the live income (or, for expenses, the live shop costs) in each bucket.
 * Entries of the other kind are simply skipped, so one read of the ledger can
 * feed both lines.
 *
 * A voided entry is skipped (money handed back was not taken in), and an
 * entry is placed by its MANILA date - a sale at 7am Manila is 11pm the day
 * before in UTC, and would otherwise land on the wrong day.
 */
export function buildSalesTrend(
  entries: readonly TrendEntry[],
  buckets: readonly TrendBucket[],
  measure: TrendMeasure = "sales",
): TrendPoint[] {
  const counts = COUNTS[measure];
  const starts = buckets.map((bucket) => civilDateToISO(bucket.start));
  const ends = buckets.map((bucket) => civilDateToISO(bucket.end));
  const amounts: Centavos[][] = buckets.map(() => []);

  for (const entry of entries) {
    if (entry.voidedAt !== null || !counts(entry)) continue;
    // ISO dates compare correctly as strings.
    const day = civilDateToISO(civilDateFromTimestamp(entry.occurredAt));
    const index = starts.findIndex((start, i) => day >= start && day < ends[i]);
    if (index >= 0) amounts[index].push(entry.amountCentavos);
  }

  return buckets.map((bucket, i) => ({ ...bucket, centavos: sumCentavos(amounts[i]) }));
}

/**
 * Profit per point: sales less expenses, the same sum Reports calls profit.
 * Both lists must come from the same buckets - they always do, because the
 * Overview builds them from one read.
 */
export function profitTrend(
  sales: readonly TrendPoint[],
  expenses: readonly TrendPoint[],
): TrendPoint[] {
  if (sales.length !== expenses.length) {
    throw new Error("Sales and expenses must cover the same periods");
  }
  return sales.map((point, i) => ({ ...point, centavos: point.centavos - expenses[i].centavos }));
}

/**
 * The top of the chart's scale: the highest point rounded UP to a figure a
 * person would write on an axis (1, 2, 2.5 or 5 times a power of ten), in
 * whole pesos. Never zero, so an empty line still has somewhere to sit.
 */
export function niceAxisMax(maxCentavos: Centavos): Centavos {
  const pesos = Math.ceil(Math.max(maxCentavos, 0) / 100);
  if (pesos <= 0) return 100;
  const power = 10 ** Math.floor(Math.log10(pesos));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * power >= pesos) return Math.round(step * power) * 100;
  }
  return 10 * power * 100;
}

/**
 * Both ends of the scale. Zero is always on it - a profit line that only dips
 * below zero must still show where zero is, or a loss reads as a small gain -
 * and each end is rounded out to an axis figure on its own.
 */
export function niceAxisRange(values: readonly Centavos[]): { min: Centavos; max: Centavos } {
  const highest = Math.max(0, ...values);
  const lowest = Math.min(0, ...values);
  const min = lowest < 0 ? -niceAxisMax(-lowest) : 0;
  const max = highest > 0 || lowest === 0 ? niceAxisMax(highest) : 0;
  return { min, max };
}

/** Totals for the line under the chart. */
export function trendSummary(points: readonly TrendPoint[]): {
  totalCentavos: Centavos;
  best: TrendPoint | null;
} {
  const totalCentavos = sumCentavos(points.map((point) => point.centavos));
  let best: TrendPoint | null = null;
  for (const point of points) {
    if (point.centavos > 0 && (best === null || point.centavos > best.centavos)) best = point;
  }
  return { totalCentavos, best };
}

/**
 * A short figure for the chart's axis: "₱0", "₱2.5K", "₱10K", "₱1.2M", "-₱2K".
 * Display only - the readout and the table carry the exact amount.
 */
export function formatAxisPesos(amount: Centavos): string {
  const compact = new Intl.NumberFormat("en-PH", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Math.abs(amount) / 100);
  // The sign goes before the peso sign, as formatPesos writes it: "-₱2K".
  return `${amount < 0 ? "-" : ""}₱${compact}`;
}

/** The two graphs on the Overview, each with its own Daily / Weekly / ... choice. */
export const TREND_CHARTS = ["money", "profit"] as const;
export type TrendChartId = (typeof TREND_CHARTS)[number];

/**
 * The Overview address for both graphs' views. Each graph keeps its own
 * choice, so switching profit to monthly must not put the other back to
 * daily. Daily is the default and is left out, so the plain `/overview` stays
 * the plain page.
 */
export function overviewTrendHref(views: Record<TrendChartId, TrendView>): string {
  const params = new URLSearchParams();
  for (const chart of TREND_CHARTS) {
    if (views[chart] !== "daily") params.set(chart, views[chart]);
  }
  const query = params.toString();
  return query ? `/overview?${query}` : "/overview";
}
