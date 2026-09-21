import "server-only";

/**
 * The day's money, worked out from the ledger (spec 15.2).
 *
 * Voided entries are skipped, so a sale that was handed back does not keep
 * counting towards what should be in the drawer.
 *
 * THESE FIGURES ARE THE TRUTH, and the collections feed has to agree with
 * them. The feed is a view of sales, apparel payments and repair payments;
 * this reads the ledger those three wrote to. If they ever disagree the feed
 * is wrong - which is why `12_phase10_rls.test.sql` asserts, per method, that
 * they do not.
 */
import { getCollectionsForDay } from "@/lib/data/collections";
import { getLedgerEntries, liveEntries } from "@/lib/data/money";
import {
  breakdownCollections,
  isPartialRead,
  type CollectionsBreakdown,
} from "@/lib/collections";
import { countsAsIncome } from "@/lib/ledger";
import { sumCentavos, type Centavos } from "@/lib/money";
import { manilaDayRangeUtc, type CivilDate } from "@/lib/period";

export interface DayTotals {
  cashSalesCentavos: Centavos;
  cashPaidOutCentavos: Centavos;
  gcashCentavos: Centavos;
  mayaCentavos: Centavos;
  bankCentavos: Centavos;
  /** Takings that went to the owner, not to the drawer. Never folded into cash. */
  ownersPocketCentavos: Centavos;
}

export async function readDayTotals(date: CivilDate): Promise<DayTotals> {
  const range = manilaDayRangeUtc(date);
  const entries = liveEntries(
    await getLedgerEntries({ from: range.from, to: range.to, limit: 2000 }),
  );

  const income = entries.filter(countsAsIncome);

  const bySource = (source: string) =>
    sumCentavos(
      income
        .filter((entry) => entry.source === source)
        .map((entry) => entry.amountCentavos),
    );

  return {
    cashSalesCentavos: bySource("cash_drawer"),
    // Everything that left the cash drawer today: expenses, cash advances,
    // wages paid in cash. These reduce what should be in it.
    cashPaidOutCentavos: sumCentavos(
      entries
        .filter((entry) => entry.direction === "out" && entry.source === "cash_drawer")
        .map((entry) => entry.amountCentavos),
    ),
    gcashCentavos: bySource("gcash"),
    mayaCentavos: bySource("maya"),
    bankCentavos: bySource("bank"),
    ownersPocketCentavos: bySource("owners_pocket"),
  };
}

/**
 * The same day, split by which door the money came through (Phase 10).
 *
 * This is the ONLY thing the collections feed is used for on this screen: the
 * drawer figure above still comes from the ledger. The feed adds the one thing
 * the ledger cannot say - a ledger entry knows it was tagged `apparel`, but
 * not whether it arrived as a job order down payment or as an apparel item
 * rung up at the counter.
 */
export interface DayBreakdown {
  breakdown: CollectionsBreakdown;
  /**
   * The read behind it was not the whole day - it failed, or hit its cap.
   * Nothing built on it may be presented, or stored, as the day's takings.
   */
  partial: boolean;
}

export async function readDayBreakdown(date: CivilDate): Promise<DayBreakdown> {
  const read = await getCollectionsForDay(date);
  return {
    breakdown: breakdownCollections(read.rows),
    partial: isPartialRead(read),
  };
}

/**
 * Income the collections feed is a view of - and only that.
 *
 * The feed covers sales, apparel payments and repair payments. The ledger
 * holds those AND everything typed in by hand on Money in/out, so comparing
 * the feed against all income raises a false alarm on every day somebody
 * enters income manually. `12_phase10_rls.test.sql` restricts the ledger side
 * the same way; this is the screen's copy of that rule.
 */
const FEED_SOURCE_TABLES = ["sales", "apparel_payments", "repair_payments"];

export async function readFeedIncome(date: CivilDate): Promise<Centavos> {
  const range = manilaDayRangeUtc(date);
  const entries = liveEntries(
    await getLedgerEntries({ from: range.from, to: range.to, limit: 2000 }),
  );

  return sumCentavos(
    entries
      .filter(countsAsIncome)
      .filter(
        (entry) =>
          entry.sourceTable !== null &&
          FEED_SOURCE_TABLES.includes(entry.sourceTable),
      )
      .map((entry) => entry.amountCentavos),
  );
}
