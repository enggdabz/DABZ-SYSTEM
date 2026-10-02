import "server-only";

/**
 * Reading the ledger for the Overview's sales, expenses and profit lines.
 *
 * Through the ordinary server client, so RLS decides: the ledger is Owner/Admin
 * only, and anybody else would get an empty line rather than the books.
 */
import { cache } from "react";

import { manilaDayRangeUtc, parseISODate, type WeekStart } from "@/lib/period";
import {
  buildSalesTrend,
  profitTrend,
  trendBuckets,
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

/**
 * One read for all three lines. Cached for the request, so when both graphs
 * are on the same view the ledger is read once, not twice. The date is passed
 * as a string because `cache` matches its arguments by identity.
 */
export const getMoneyTrend = cache(
  async (view: TrendView, todayISO: string, weekStartsOn: WeekStart): Promise<MoneyTrend> => {
    const today = parseISODate(todayISO);
    if (!today) throw new Error(`Not a date: ${todayISO}`);

    const buckets = trendBuckets(view, today, weekStartsOn);
    const from = manilaDayRangeUtc(buckets[0].start).from;
    const to = manilaDayRangeUtc(buckets[buckets.length - 1].end).from;

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
  },
);
