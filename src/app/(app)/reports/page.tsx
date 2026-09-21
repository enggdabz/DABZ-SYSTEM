import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, TAP_AREA, Tag } from "@/components/ui";
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
  RANGE_PRESET_LABELS,
  categoryAmount,
  compareTo,
  rangeForPreset,
  type RangePreset,
  type ReportRange,
} from "@/lib/reports";

function methodLabel(source: MoneySource): string {
  return source === "cash_drawer" ? "Cash" : MONEY_SOURCE_LABELS[source];
}

export const metadata = { title: "Reports · Dabz System" };

function showDate(iso: string): string {
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

/** A row of the summary, with its comparison against the period before. */
function Line({
  label,
  amountCentavos,
  previousCentavos,
  tone = "plain",
  hint,
}: {
  label: string;
  amountCentavos: number;
  previousCentavos: number;
  tone?: "plain" | "good" | "bad" | "headline";
  hint?: string;
}) {
  const change = compareTo(amountCentavos, previousCentavos);

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line/60 py-3 first:border-0">
      <span>
        <span
          className={tone === "headline" ? "text-base font-semibold" : "font-medium"}
        >
          {label}
        </span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
      <span className="text-right">
        <span
          className={`${
            tone === "headline" ? "text-2xl" : "text-lg"
          } font-semibold tracking-tight ${
            tone === "good" ? "text-success" : tone === "bad" ? "text-attention" : ""
          }`}
        >
          {formatPesos(amountCentavos)}
        </span>
        <span className="block text-xs text-muted">
          {change.percent === null
            ? change.label
            : `${change.label} on ${formatPesos(previousCentavos)}`}
        </span>
      </span>
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await connection();

  // Full reports are Owner/Admin only and can never be granted to staff
  // (spec 4.3). A staff member's own day's takings are on the Sales screen.
  await requireOwnerOrAdmin();

  const settings = await getSettings();
  const { period } = await searchParams;

  const preset: RangePreset = RANGE_PRESETS.includes(period as RangePreset)
    ? (period as RangePreset)
    : "this_month";

  const range: ReportRange = rangeForPreset(
    preset,
    civilDateToISO(manilaToday()),
    settings.weekStartsOn,
  );

  const [{ current, previous }, standing, collections] = await Promise.all([
    getReportWithComparison(range),
    getStanding(),
    getCollectionsReport(range),
  ]);

  const nothingYet = current.entryCount === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-2 text-muted">
            {range.label} &middot; {showDate(range.fromISO)} to{" "}
            {showDate(range.toISO)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/reports/print?period=${preset}`}
            className="rounded-control bg-ink/5 px-4 py-2 text-sm font-medium ring-1 ring-line hover:bg-ink/10"
          >
            Print
          </Link>
          <a
            href={`/reports/export?period=${preset}`}
            className="rounded-control bg-ink/5 px-4 py-2 text-sm font-medium ring-1 ring-line hover:bg-ink/10"
          >
            Download as a spreadsheet
          </a>
        </div>
      </div>

      {/* ---- Which period ------------------------------------------------- */}
      <nav aria-label="Report period" className="flex flex-wrap gap-2">
        {RANGE_PRESETS.map((option) => (
          <Link
            key={option}
            href={`/reports?period=${option}`}
            className={`rounded-full px-3 py-1.5 text-sm ring-1 transition-colors ${
              option === preset
                ? "bg-accent text-on-accent ring-accent"
                : "bg-surface text-ink ring-line hover:ring-accent/50"
            }`}
          >
            {RANGE_PRESET_LABELS[option]}
          </Link>
        ))}
      </nav>

      {nothingYet ? (
        <Notice tone="info" title="Nothing recorded in this period">
          Reports add up what the rest of the system writes, so they fill in by
          themselves as the shop runs. Try a longer period.
        </Notice>
      ) : null}

      {/* ---- The money ---------------------------------------------------- */}
      <Card
        title="Money"
        description="Compared with the same length of time immediately before, so half a month is never measured against a whole one."
      >
        <Line
          label="Income"
          hint="Sales and job orders. Borrowed money and your own capital are not in here."
          amountCentavos={current.incomeCentavos}
          previousCentavos={previous.incomeCentavos}
          tone="good"
        />
        <Line
          label="Shop expenses"
          hint="Everything it cost to run. An owner withdrawal is not in here."
          amountCentavos={current.expensesCentavos}
          previousCentavos={previous.expensesCentavos}
          tone="bad"
        />
        <Line
          label="Profit"
          hint="Income less shop expenses. This is the number that matters."
          amountCentavos={current.profitCentavos}
          previousCentavos={previous.profitCentavos}
          tone="headline"
        />

        {current.nonIncomeInCentavos > 0 || current.ownerWithdrawalsCentavos > 0 ? (
          <div className="mt-5 space-y-3 rounded-card bg-surface-sunken p-4 text-sm ring-1 ring-line/60">
            <p className="font-medium">
              Money that moved but is not income or a shop cost
            </p>
            {current.nonIncomeInCentavos > 0 ? (
              <p className="flex flex-wrap justify-between gap-2">
                <span className="text-muted">
                  Borrowed money and your own capital coming in
                </span>
                <span>{formatPesos(current.nonIncomeInCentavos)}</span>
              </p>
            ) : null}
            {current.ownerWithdrawalsCentavos > 0 ? (
              <p className="flex flex-wrap justify-between gap-2">
                <span className="text-muted">You taking money out</span>
                <span>{formatPesos(current.ownerWithdrawalsCentavos)}</span>
              </p>
            ) : null}
            <p className="text-xs text-muted">
              Kept out of the figures above on purpose. A month where you
              borrowed ₱100,000 is not a month where you earned ₱100,000.
            </p>
          </div>
        ) : null}
      </Card>

      {/* ---- Divisions ---------------------------------------------------- */}
      {current.byDivision.length > 0 ? (
        <Card
          title="Where the income came from"
          description="Each division, and what it sold."
        >
          <ul className="space-y-6">
            {current.byDivision.map((division) => (
              <li
                key={division.tag}
                className="border-t border-line/60 pt-6 first:border-0 first:pt-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{division.name}</h3>
                  <span className="text-right">
                    <span className="text-lg font-semibold">
                      {formatPesos(division.incomeCentavos)}
                    </span>
                    <span className="ml-2 text-sm text-muted">
                      {division.shareLabel}
                    </span>
                  </span>
                </div>

                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink/10"
                  role="img"
                  aria-label={`${division.shareLabel} of income`}
                >
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${division.shareLabel}` }}
                  />
                </div>

                <ul className="mt-3 divide-y divide-line/60">
                  {division.categories.map((line) => (
                    <li
                      key={line.category}
                      className="flex flex-wrap justify-between gap-2 py-1.5 text-sm"
                    >
                      <span className="text-muted">{line.label}</span>
                      <span>
                        {formatPesos(line.amountCentavos)}
                        <span className="ml-2 text-xs text-muted">
                          {line.shareLabel}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-xs text-muted">
            The percentages are rounded to whole numbers, so they may not add up
            to exactly 100. The amounts do.
          </p>
        </Card>
      ) : null}

      {/* ---- Collections by division and kind (Phase 10) ------------------- */}
      {collections.lines.length > 0 ? (
        <Card
          title="Collections by division and kind"
          description="Which door the money came through, and what it was for. The card above splits income by what was SOLD; this splits it by how it was taken."
        >
          {/* Phone: a block per line. Eight columns will not fit at 390px. */}
          <ul className="space-y-4 sm:hidden">
            {collections.lines.map((line) => (
              <li
                key={line.key}
                className="rounded-card bg-surface-sunken p-4 ring-1 ring-line/60"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{line.label}</span>
                  <span className="text-lg font-semibold tracking-tight">
                    {formatPesos(line.amountCentavos)}
                  </span>
                </div>
                <dl className="mt-2 space-y-1 text-sm">
                  {MONEY_SOURCES.filter((source) => line.bySource[source] !== 0).map(
                    (source) => (
                      <div key={source} className="flex justify-between gap-2">
                        <dt className="text-muted">{methodLabel(source)}</dt>
                        <dd>{formatPesos(line.bySource[source])}</dd>
                      </div>
                    ),
                  )}
                </dl>
                <p className="mt-2 text-xs text-muted">
                  {line.count} payment{line.count === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ul>

          <div className="hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/60 text-left">
                  <th scope="col" className="pb-2 font-medium text-muted">
                    Door and kind
                  </th>
                  {MONEY_SOURCES.map((source) => (
                    <th
                      key={source}
                      scope="col"
                      className="pb-2 text-right font-medium text-muted"
                    >
                      {methodLabel(source)}
                    </th>
                  ))}
                  <th scope="col" className="pb-2 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {collections.lines.map((line) => (
                  <tr key={line.key} className="border-b border-line/60">
                    <th scope="row" className="py-2.5 text-left font-normal">
                      {line.label}
                    </th>
                    {MONEY_SOURCES.map((source) => (
                      <td
                        key={source}
                        className={`py-2.5 text-right whitespace-nowrap ${
                          line.bySource[source] === 0 ? "text-muted" : ""
                        }`}
                      >
                        {formatPesos(line.bySource[source])}
                      </td>
                    ))}
                    <td className="py-2.5 text-right font-semibold whitespace-nowrap">
                      {formatPesos(line.amountCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="pt-3 text-left font-semibold">
                    All collections
                  </th>
                  {MONEY_SOURCES.map((source) => (
                    <td
                      key={source}
                      className="pt-3 text-right font-semibold whitespace-nowrap"
                    >
                      {formatPesos(collections.totalBySource[source])}
                    </td>
                  ))}
                  <td className="pt-3 text-right text-base font-semibold whitespace-nowrap">
                    {formatPesos(collections.totalCentavos)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/*
            Beside the table rather than in it: the checking fee is a slice of
            DabzTech income by CATEGORY, and putting it in a column of doors
            would invite somebody to add it to the total twice.
          */}
          <p className="mt-5 text-sm text-muted">
            DabzTech checking fees in this period:{" "}
            <span className="font-medium text-ink">
              {formatPesos(categoryAmount(current, "checking_fee"))}
            </span>
            . Charged even when the customer decides not to go ahead, so it is
            already inside the DabzTech figures above.
          </p>

          <p className="mt-2 text-xs text-muted">
            A DabzTech payment taken before this was recorded reads as
            &ldquo;Payment&rdquo;: nobody can now say whether it was a down
            payment or a balance, so nothing guesses.
          </p>
        </Card>
      ) : null}

      {/* ---- Expenses ----------------------------------------------------- */}
      {current.expensesByCategory.length > 0 ? (
        <Card title="What the money went on" description="Biggest first.">
          <ul className="divide-y divide-line/60">
            {current.expensesByCategory.map((line) => (
              <li
                key={line.category}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2.5"
              >
                <span>{line.label}</span>
                <span className="text-right">
                  <span className="font-medium">
                    {formatPesos(line.amountCentavos)}
                  </span>
                  <span className="ml-2 text-xs text-muted">
                    {line.shareLabel}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-sm text-muted">
            Of that, {formatPesos(current.runningCostsCentavos)} was the cost of
            doing the work &mdash; materials, fuel, meals. The rest is the bills
            and wages your daily target already exists to cover.
          </p>
        </Card>
      ) : null}

      {/* ---- Where the shop stands --------------------------------------- */}
      <Card
        title="Where the shop stands today"
        description="Not part of the period above — these are true right now, whichever period you are looking at."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-muted">Owed to you</h3>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-success">
              {formatPesos(standing.owedToShopCentavos)}
            </p>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Apparel job orders</dt>
                <dd>{formatPesos(standing.apparelOwedCentavos)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Repairs</dt>
                <dd>{formatPesos(standing.repairsOwedCentavos)}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted">Owed by you</h3>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-attention">
              {formatPesos(standing.owedByShopCentavos)}
            </p>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Bills left this month</dt>
                <dd>{formatPesos(standing.billsUnpaidThisMonthCentavos)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Loans</dt>
                <dd>{formatPesos(standing.loanDebtCentavos)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Suppliers</dt>
                <dd>{formatPesos(standing.supplierPayablesCentavos)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-6 border-t border-line/60 pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-muted">
              Materials on the shelves
            </h3>
            <span className="text-lg font-semibold">
              {formatPesos(standing.stockValueCentavos)}
            </span>
          </div>
          {standing.stockUnpricedCount > 0 ? (
            <p className="mt-1 text-xs text-attention">
              <span aria-hidden="true">{"⚠"} </span>
              {standing.stockUnpricedCount} material
              {standing.stockUnpricedCount === 1 ? " is" : "s are"} left out,
              with no price set.{" "}
              <Link href="/stocks" className={`underline ${TAP_AREA}`}>
                Set them on Stocks
              </Link>
              .
            </p>
          ) : null}
        </div>

        <p className="mt-5 text-xs text-muted">
          These are counted separately from the income above on purpose. Money
          you are owed has already been counted as income when the work was
          done &mdash; adding it again here would count it twice.
        </p>
      </Card>

      <p className="text-xs text-muted">
        Every figure on this screen is added up from the ledger when you open
        it. There is no stored report to fall out of step with the screens it
        came from. <Tag>{current.entryCount} entries in this period</Tag>
      </p>
    </div>
  );
}
