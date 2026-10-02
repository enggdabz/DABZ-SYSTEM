import "server-only";

/**
 * Reading the ledger for the sales, expenses and profit lines on the
 * Overview and the Reports page.
 *
 * Through the ordinary server client, so RLS decides: the ledger is Owner/Admin
 * only, and anybody else would get an empty line rather than the books.
 */
import { cache } from "react";

import { manilaDayRangeUtc, parseISODate, type WeekStart } from "@/lib/period";
import {
  buildSalesTrend,
  bucketsForRange,
  profitTrend,
  trendBuckets,
  type TrendBucket,
  type TrendEntry,
  type TrendPoint,
  type TrendView,
} from "@/lib/sales-trend";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * PostgREST hands back at most 1,000 rows a request (`max_rows`), so the range
 * is read a page at a time. The cap is there so five busy years cannot stall
 * the home screen; if it is ever hit the screen SAYS the line is incomplete
 * rather than drawing a dip that never happened.
 */
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

export interface MoneyTrend {
  sales: TrendPoint[];
  expenses: TrendPoint[];
  /** Sales less expenses, per point. */
  profit: TrendPoint[];
  /** The read stopped at the cap, so the older points are wrong. */
  truncated: boolean;
  /** The read failed outright - not the same as a shop that sold nothing. */
  failed: boolean;
}

/** Reads exactly the days a run of buckets covers. */
async function trendFromBuckets(buckets: TrendBucket[]): Promise<MoneyTrend> {
  const from = manilaDayRangeUtc(buckets[0].start).from;
  const to = manilaDayRangeUtc(buckets[buckets.length - 1].end).from;
  return trendBetween(buckets, from, to);
}

/**
 * Reads every live ledger row between two instants and adds up the three
 * lines per bucket.
 */
async function trendBetween(
  buckets: TrendBucket[],
  from: string,
  to: string,
): Promise<MoneyTrend> {
  const supabase = await createSupabaseServerClient();
  const entries: TrendEntry[] = [];
  let truncated = false;
  let failed = false;

  for (let page = 0; ; page += 1) {
    if (page === MAX_PAGES) {
      truncated = true;
      break;
    }

    // Only live rows and only the five columns the lines need. Newest first,
    // so a cap cuts off the OLD end, not today.
    const { data, error } = await supabase
      .from("ledger_entries")
      .select("occurred_at, direction, category, amount_centavos, voided_at")
      .is("voided_at", null)
      .gte("occurred_at", from)
      .lt("occurred_at", to)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (error || !data) {
      failed = true;
      entries.length = 0;
      break;
    }

    for (const row of data) {
      entries.push({
        occurredAt: row.occurred_at,
        direction: row.direction === "out" ? "out" : "in",
        category: row.category,
        amountCentavos: Number(row.amount_centavos),
        voidedAt: row.voided_at,
      });
    }

    if (data.length < PAGE_SIZE) break;
  }

  const sales = buildSalesTrend(entries, buckets, "sales");
  const expenses = buildSalesTrend(entries, buckets, "expenses");
  return { sales, expenses, profit: profitTrend(sales, expenses), truncated, failed };
}

/**
 * The Overview's lines. Cached for the request, so when both graphs are on the
 * same view the ledger is read once, not twice. The date is passed as a string
 * because `cache` matches its arguments by identity.
 */
export const getMoneyTrend = cache(
  async (view: TrendView, todayISO: string, weekStartsOn: WeekStart): Promise<MoneyTrend> => {
    const today = parseISODate(todayISO);
    if (!today) throw new Error(`Not a date: ${todayISO}`);
    return trendFromBuckets(trendBuckets(view, today, weekStartsOn));
  },
);

/**
 * The lines for a Reports period: Manila dates, inclusive at both ends. Only
 * the range itself is read - a month bucket that runs past it does not pull
 * in the days outside, so the line adds up to the same total as the report.
 */
export const getRangeMoneyTrend = cache(
  async (fromISO: string, toISO: string, todayISO: string): Promise<MoneyTrend> => {
    const from = parseISODate(fromISO);
    const to = parseISODate(toISO);
    const today = parseISODate(todayISO);
    if (!from || !to || !today) throw new Error(`Not a date range: ${fromISO} to ${toISO}`);
    return trendBetween(
      bucketsForRange(from, to, today),
      manilaDayRangeUtc(from).from,
      manilaDayRangeUtc(to).to,
    );
  },
);
