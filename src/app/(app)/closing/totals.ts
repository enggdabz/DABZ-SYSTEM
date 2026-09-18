import "server-only";

/**
 * The day's money, worked out from the ledger (spec 15.2).
 *
 * Voided entries are skipped, so a sale that was handed back does not keep
 * counting towards what should be in the drawer.
 */
import { getLedgerEntries, liveEntries } from "@/lib/data/money";
import { countsAsIncome } from "@/lib/ledger";
import { sumCentavos, type Centavos } from "@/lib/money";
import { manilaDayRangeUtc, type CivilDate } from "@/lib/period";

export interface DayTotals {
  cashSalesCentavos: Centavos;
  cashPaidOutCentavos: Centavos;
  gcashCentavos: Centavos;
  mayaCentavos: Centavos;
  bankCentavos: Centavos;
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
  };
}
