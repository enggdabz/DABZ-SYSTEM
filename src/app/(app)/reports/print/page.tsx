import { Fragment } from "react";

import Link from "next/link";
import { connection } from "next/server";

import { TAP_AREA } from "@/components/ui";
import { getSettings, requireOwnerOrAdmin } from "@/lib/auth/dal";
import {
  getCollectionsReport,
  getReportWithComparison,
  getStanding,
} from "@/lib/data/reports";
import { MONEY_SOURCES, MONEY_SOURCE_LABELS, type MoneySource } from "@/lib/ledger";
import { formatPesos } from "@/lib/money";
import { civilDateToISO, formatCivilDate, manilaToday, parseISODate } from "@/lib/period";
import {
  RANGE_PRESETS,
  categoryAmount,
  compareTo,
  rangeForPreset,
  type RangePreset,
} from "@/lib/reports";

export const metadata = { title: "Report · Dabz System" };

function methodLabel(source: MoneySource): string {
  return source === "cash_drawer" ? "Cash" : MONEY_SOURCE_LABELS[source];
}

function showDate(iso: string): string {
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

/**
 * The printed report (spec 15.3).
 *
 * Black on white and laid out for A4, because this is the sheet that goes to
 * an accountant or into a folder. Every figure on it is added up from the same
 * ledger rows the screen uses, so the paper and the screen cannot disagree.
 */
export default async function PrintReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await connection();

  await requireOwnerOrAdmin();

  const settings = await getSettings();
  const { period } = await searchParams;

  const preset: RangePreset = RANGE_PRESETS.includes(period as RangePreset)
    ? (period as RangePreset)
    : "this_month";

  const range = rangeForPreset(
    preset,
    civilDateToISO(manilaToday()),
    settings.weekStartsOn,
  );

  const [{ current, previous }, standing, collections] = await Promise.all([
    getReportWithComparison(range),
    getStanding(),
    getCollectionsReport(range),
  ]);

  // Only the methods that actually took money, so a printed sheet does not
  // spend a third of its width on three columns of PHP 0.00.
  const usedMethods = MONEY_SOURCES.filter(
    (source) => collections.totalBySource[source] !== 0,
  );

  const profitChange = compareTo(current.profitCentavos, previous.profitCentavos);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/reports?period=${preset}`} className={`text-sm underline ${TAP_AREA}`}>
          {"←"} Back to reports
        </Link>
        <span className="text-sm text-muted">
          Use your browser&apos;s Print (Ctrl+P).
        </span>
      </div>

      <article className="mx-auto max-w-3xl bg-white p-8 text-black shadow-sm ring-1 ring-black/10 print:rounded-none print:p-0 print:shadow-none print:ring-0">
        {/* A text wordmark, not the crest: the logos are built for black
            backgrounds and would vanish on white paper (spec 3.3). */}
        <header className="border-b-2 border-black pb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-lg font-bold tracking-tight">DABZ PRINTSHOPPE</p>
              <p className="text-xs">
                Dabz Apparel &middot; DabzTech Solutions &middot; San Carlos
                City, Pangasinan
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold">{range.label}</p>
              <p className="text-xs">
                {showDate(range.fromISO)} to {showDate(range.toISO)}
              </p>
            </div>
          </div>
        </header>

        <section className="mt-5">
          <h2 className="border-b border-black pb-1 text-sm font-bold">Money</h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs">
                <th className="pb-1 font-semibold">&nbsp;</th>
                <th className="w-32 pb-1 text-right font-semibold">This period</th>
                <th className="w-32 pb-1 text-right font-semibold">Before</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-black/20">
                <td className="py-1">Income</td>
                <td className="py-1 text-right">
                  {formatPesos(current.incomeCentavos)}
                </td>
                <td className="py-1 text-right">
                  {formatPesos(previous.incomeCentavos)}
                </td>
              </tr>
              <tr className="border-t border-black/20">
                <td className="py-1">Shop expenses</td>
                <td className="py-1 text-right">
                  {formatPesos(current.expensesCentavos)}
                </td>
                <td className="py-1 text-right">
                  {formatPesos(previous.expensesCentavos)}
                </td>
              </tr>
              <tr className="border-t border-black font-bold">
                <td className="py-1">Profit</td>
                <td className="py-1 text-right">
                  {formatPesos(current.profitCentavos)}
                </td>
                <td className="py-1 text-right">
                  {formatPesos(previous.profitCentavos)}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="mt-1 text-xs">
            Profit is {profitChange.label}
            {profitChange.percent === null ? "" : " on the period before"}.
          </p>

          {current.nonIncomeInCentavos > 0 ||
          current.ownerWithdrawalsCentavos > 0 ? (
            <p className="mt-2 border border-black/40 p-2 text-xs">
              <span className="font-semibold">Not counted above: </span>
              {current.nonIncomeInCentavos > 0
                ? `${formatPesos(current.nonIncomeInCentavos)} of borrowed money and owner capital came in. `
                : ""}
              {current.ownerWithdrawalsCentavos > 0
                ? `${formatPesos(current.ownerWithdrawalsCentavos)} was taken out by the owner. `
                : ""}
              Neither is income or a shop cost.
            </p>
          ) : null}
        </section>

        {current.byDivision.length > 0 ? (
          <section className="mt-5">
            <h2 className="border-b border-black pb-1 text-sm font-bold">
              Income by division
            </h2>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {current.byDivision.map((division) => (
                  // A Fragment with a key: a bare <> in a map has no key, and
                  // React needs one per division to keep the rows straight.
                  <Fragment key={division.tag}>
                    <tr className="border-t border-black/40 font-semibold">
                      <td className="py-1">{division.name}</td>
                      <td className="w-20 py-1 text-right">
                        {division.shareLabel}
                      </td>
                      <td className="w-32 py-1 text-right">
                        {formatPesos(division.incomeCentavos)}
                      </td>
                    </tr>
                    {division.categories.map((line) => (
                      <tr key={`${division.tag}-${line.category}`} className="text-xs">
                        <td className="py-0.5 pl-4">{line.label}</td>
                        <td className="py-0.5 text-right">{line.shareLabel}</td>
                        <td className="py-0.5 text-right">
                          {formatPesos(line.amountCentavos)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[10px]">
              Percentages are rounded, so they may not total 100. The amounts do.
            </p>
          </section>
        ) : null}

        {/*
          Which door the money came through (Phase 10). Narrower than the
          screen's table on purpose: an A4 sheet has room for the methods that
          were actually used, and a column of zeroes wastes the width the peso
          figures need.
        */}
        {collections.lines.length > 0 ? (
          <section className="mt-5">
            <h2 className="border-b border-black pb-1 text-sm font-bold">
              Collections by division and kind
            </h2>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-xs">
                  <th scope="col" className="py-1 text-left font-normal">
                    Door and kind
                  </th>
                  {usedMethods.map((source) => (
                    <th
                      key={source}
                      scope="col"
                      className="py-1 text-right font-normal"
                    >
                      {methodLabel(source)}
                    </th>
                  ))}
                  <th scope="col" className="w-28 py-1 text-right font-normal">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {collections.lines.map((line) => (
                  <tr key={line.key} className="border-t border-black/20">
                    <td className="py-1">{line.label}</td>
                    {usedMethods.map((source) => (
                      <td key={source} className="py-1 text-right">
                        {formatPesos(line.bySource[source])}
                      </td>
                    ))}
                    <td className="py-1 text-right font-semibold">
                      {formatPesos(line.amountCentavos)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-black font-bold">
                  <td className="py-1">All collections</td>
                  {usedMethods.map((source) => (
                    <td key={source} className="py-1 text-right">
                      {formatPesos(collections.totalBySource[source])}
                    </td>
                  ))}
                  <td className="py-1 text-right">
                    {formatPesos(collections.totalCentavos)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-[10px]">
              DabzTech checking fees in this period:{" "}
              {formatPesos(categoryAmount(current, "checking_fee"))}, already
              inside the DabzTech figures above. A DabzTech payment taken before
              the kind was recorded reads as &ldquo;Payment&rdquo;.
            </p>
          </section>
        ) : null}

        {current.expensesByCategory.length > 0 ? (
          <section className="mt-5">
            <h2 className="border-b border-black pb-1 text-sm font-bold">
              Expenses
            </h2>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {current.expensesByCategory.map((line) => (
                  <tr key={line.category} className="border-t border-black/20">
                    <td className="py-1">{line.label}</td>
                    <td className="w-20 py-1 text-right">{line.shareLabel}</td>
                    <td className="w-32 py-1 text-right">
                      {formatPesos(line.amountCentavos)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-black font-bold">
                  <td className="py-1">Total</td>
                  <td className="py-1" />
                  <td className="py-1 text-right">
                    {formatPesos(current.expensesCentavos)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        ) : null}

        <section className="mt-5">
          <h2 className="border-b border-black pb-1 text-sm font-bold">
            Where the shop stands, {showDate(civilDateToISO(manilaToday()))}
          </h2>
          <div className="mt-2 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="font-semibold">
                Owed to the shop: {formatPesos(standing.owedToShopCentavos)}
              </p>
              <p className="text-xs">
                Apparel {formatPesos(standing.apparelOwedCentavos)} &middot;
                repairs {formatPesos(standing.repairsOwedCentavos)}
              </p>
            </div>
            <div>
              <p className="font-semibold">
                Owed by the shop: {formatPesos(standing.owedByShopCentavos)}
              </p>
              <p className="text-xs">
                Bills {formatPesos(standing.billsUnpaidThisMonthCentavos)} &middot;
                loans {formatPesos(standing.loanDebtCentavos)} &middot; suppliers{" "}
                {formatPesos(standing.supplierPayablesCentavos)}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs">
            Materials on the shelves: {formatPesos(standing.stockValueCentavos)}
            {standing.stockUnpricedCount > 0
              ? ` (${standing.stockUnpricedCount} left out, no price set)`
              : ""}
          </p>
          <p className="mt-1 text-[10px]">
            These are true today, not for the period above. Money owed to the
            shop was already counted as income when the work was done.
          </p>
        </section>

        <footer className="mt-8 border-t border-black pt-2 text-center text-[10px]">
          Dabz System &middot; every figure added up from the money in and out
          records &middot; printed{" "}
          {showDate(civilDateToISO(manilaToday()))}
        </footer>
      </article>
    </div>
  );
}
