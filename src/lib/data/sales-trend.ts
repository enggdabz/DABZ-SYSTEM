import "server-only";

/**
 * Reading the ledger for the Overview's sales and expenses lines.
 *
 * Through the ordinary server client, so RLS decides: the ledger is Owner/Admin
 * only, and anybody else would get an empty line rather than the books.
 */
import { manilaDayRangeUtc, type CivilDate, type WeekStart } from "@/lib/period";
import {
  TREND_MEASURE_DIRECTION,
  buildSalesTrend,
  trendBuckets,
  type TrendMeasure,
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

export interface SalesTrend {
  points: TrendPoint[];
  /** The read stopped at the cap, so the older points are too low. */
  truncated: boolean;
  /** The read failed outright - not the same as a shop that sold nothing. */
  failed: boolean;
}

export async function getSalesTrend(
  view: TrendView,
  today: CivilDate,
  weekStartsOn: WeekStart,
  measure: TrendMeasure = "sales",
): Promise<SalesTrend> {
  const buckets = trendBuckets(view, today, weekStartsOn);
  const from = manilaDayRangeUtc(buckets[0].start).from;
  const to = manilaDayRangeUtc(buckets[buckets.length - 1].end).from;

  const supabase = await createSupabaseServerClient();
  const entries: TrendEntry[] = [];
  let truncated = false;

  for (let page = 0; ; page += 1) {
    if (page === MAX_PAGES) {
      truncated = true;
      break;
    }

    // Only the one direction, only live rows, only the five columns the line needs.
    // Newest first, so a cap cuts off the OLD end, not today.
    const { data, error } = await supabase
      .from("ledger_entries")
      .select("occurred_at, direction, category, amount_centavos, voided_at")
      .eq("direction", TREND_MEASURE_DIRECTION[measure])
      .is("voided_at", null)
      .gte("occurred_at", from)
      .lt("occurred_at", to)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (error || !data) {
      return { points: buildSalesTrend([], buckets, measure), truncated: false, failed: true };
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

  return { points: buildSalesTrend(entries, buckets, measure), truncated, failed: false };
}
