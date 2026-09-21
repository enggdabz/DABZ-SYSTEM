import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { totalMonthlyBills } from "@/lib/bills";
import { computeClosing } from "@/lib/closing";
import type {
  CollectionsBreakdown,
  DivisionBreakdown as DivisionBreakdownRow,
} from "@/lib/collections";
import { getBills } from "@/lib/data/money";
import { getDayClosing } from "@/lib/data/pos";
import { getEstimatedMonthlyPayroll } from "@/lib/data/staff";
import { MONEY_SOURCES, MONEY_SOURCE_LABELS, type MoneySource } from "@/lib/ledger";
import { formatPesos } from "@/lib/money";
import { formatCivilDate, manilaToday } from "@/lib/period";
import { computeDailyTarget } from "@/lib/target";

import { ClosingForm } from "./ClosingForm";
import { readDayBreakdown, readDayTotals, readFeedIncome } from "./totals";

export const metadata = { title: "End of day · Dabz System" };

export default async function ClosingPage() {
  await connection();

  await requirePermission("add_sales");
  const settings = await getSettings();
  const today = manilaToday();

  const [totals, dayBreakdown, feedIncomeCentavos, bills, payroll, existing] =
    await Promise.all([
      readDayTotals(today),
      readDayBreakdown(today),
      // Only the income the feed is a view of - see readFeedIncome.
      readFeedIncome(today),
      getBills(),
      getEstimatedMonthlyPayroll(),
      getDayClosing(today),
    ]);

  const { breakdown, partial: breakdownPartial } = dayBreakdown;

  const target = computeDailyTarget({
    monthlyBillsCentavos: totalMonthlyBills(bills),
    monthlyPayrollCentavos: payroll.centavos,
    workingDaysPerMonth: settings.workingDaysPerMonth,
  });

  // Worked out with zero counted, purely to show what the drawer should hold.
  const expected = computeClosing({
    ...totals,
    countedCashCentavos: 0,
    targetCentavos: target.targetCentavos,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">End of day</h1>
        <p className="mt-2 text-muted">{formatCivilDate(today)}</p>
      </div>

      {existing ? (
        <Notice
          tone={existing.differenceCentavos === 0 ? "success" : "attention"}
          title={
            existing.differenceCentavos === 0
              ? "Today is already closed, and the drawer matched"
              : `Today is already closed - the drawer was ${
                  existing.differenceCentavos < 0 ? "short" : "over"
                } by ${formatPesos(Math.abs(existing.differenceCentavos))}`
          }
        >
          <p>
            Counting again below replaces that record, and the change is written
            to Activity.
          </p>
          {/*
            What was believed at the moment the drawer was counted. It can
            differ from the live table further down - a void since then changes
            today's figures but must not rewrite what was recorded - and a day
            closed before Phase 10 never had one at all.
          */}
          <p className="mt-2">
            {existing.breakdown === null ? (
              "Breakdown not recorded for this day."
            ) : (
              <>
                Recorded then: Counter{" "}
                {formatPesos(existing.breakdown.counterTotalCentavos)}, Apparel{" "}
                {formatPesos(existing.breakdown.apparelTotalCentavos)}, DabzTech{" "}
                {formatPesos(existing.breakdown.dabztechTotalCentavos)}.
              </>
            )}
          </p>
        </Notice>
      ) : null}

      <Card title="What should be in the drawer">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            {/*
              "Cash sales" was the wrong name for this figure and had been
              since the counter could take an apparel down payment: it is every
              peso of cash collected today, through any of the three doors. A
              drawer that is PHP 200 over because a DabzTech down payment went
              in is not a mystery once the screen says so.
            */}
            <dt className="text-muted">
              Cash collected today
              <span className="block text-xs">
                Counter sales, Apparel payments and DabzTech payments
              </span>
            </dt>
            <dd className="font-medium">{formatPesos(totals.cashSalesCentavos)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">
              Paid out of the drawer
              <span className="block text-xs">
                Expenses, cash advances and wages paid in cash
              </span>
            </dt>
            <dd className="font-medium">
              &minus;{formatPesos(totals.cashPaidOutCentavos)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-line/60 pt-2">
            <dt className="font-semibold">Expected in the drawer</dt>
            <dd className="text-2xl font-semibold tracking-tight">
              {formatPesos(expected.expectedCashCentavos)}
            </dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-line/60 pt-5">
          <ClosingForm expectedCashCentavos={expected.expectedCashCentavos} />
        </div>
      </Card>

      <DivisionBreakdown
        breakdown={breakdown}
        ledgerTotalCentavos={feedIncomeCentavos}
        partial={breakdownPartial}
      />

      <Card title="The rest of today">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="GCash" value={formatPesos(totals.gcashCentavos)} />
          <Figure label="Maya" value={formatPesos(totals.mayaCentavos)} />
          <Figure label="Bank" value={formatPesos(totals.bankCentavos)} />
          <Figure
            label="Total collected"
            value={formatPesos(expected.totalSalesCentavos)}
          />
        </dl>

        {/*
          Its own line, never folded into cash: this money never reached the
          drawer, so adding it to the cash figure would make the drawer read as
          short by exactly this much.
        */}
        {totals.ownersPocketCentavos > 0 ? (
          <p className="mt-4 text-sm text-muted">
            {formatPesos(totals.ownersPocketCentavos)} of today&apos;s takings
            went to the owner directly rather than into the drawer. It is
            counted in the total above and deliberately not in the cash.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line/60 pt-5">
          {/*
            A target of zero means nothing has been entered for it to cover,
            not that the day cleared it. Without this the tag would read
            "-PHP 500.00 short", which is worse than saying nothing.
          */}
          {target.targetCentavos <= 0 ? (
            <Tag tone="attention">{"⚠"} No target set</Tag>
          ) : (
            <>
              <span className="text-sm text-muted">
                Target {formatPesos(target.targetCentavos)}
              </span>
              {expected.targetReached ? (
                <Tag tone="success">{"✓"} Target reached</Tag>
              ) : (
                <Tag tone="attention">
                  {"⚠"}{" "}
                  {formatPesos(target.targetCentavos - expected.totalSalesCentavos)} short
                </Tag>
              )}
            </>
          )}
        </div>

        <p className="mt-4 text-xs text-muted">
          {target.targetCentavos <= 0
            ? "There is no daily target until the monthly bills and the staff daily rates are entered, so today is recorded without one."
            : "The target compares against sales, not profit — material costs are not tracked until Phase 5."}
          {payroll.centavos === null && target.targetCentavos > 0
            ? " It also covers bills only, because no staff daily rates are set yet."
            : ""}
        </p>
      </Card>
    </div>
  );
}

/**
 * Which door today's money came through, and by which method.
 *
 * A table from `sm` up and a stack of cards below it. Not a scrolling table on
 * a phone: six columns at 390px would either overflow the screen or squeeze
 * every peso figure onto two lines, and this is read at the counter at closing
 * time, one-handed.
 *
 * The bottom row is asserted against the ledger's own day totals in
 * `closing.test.ts`, and against the ledger itself in the SQL suite. If the
 * two ever part company the warning below says so rather than the screen
 * quietly showing a figure that is not the day's takings.
 */
function DivisionBreakdown({
  breakdown,
  ledgerTotalCentavos,
  partial,
}: {
  breakdown: CollectionsBreakdown;
  /** Income from the three payment tables ONLY - not every income entry. */
  ledgerTotalCentavos: number;
  partial: boolean;
}) {
  /*
    Compared against the income the feed is a view of, never against all
    income: a hand-typed entry on Money in/out is real income the feed has no
    row for, and comparing against it raised this alarm every day such an
    entry existed. An alarm that cries wolf daily is worse than none, because
    the day it is right nobody looks.

    And a read that could not see the whole day is EXPECTED to disagree, so it
    says that instead - the disagreement is the permission, not a fault.
  */
  const disagrees =
    !partial && breakdown.totalCentavos !== ledgerTotalCentavos;

  return (
    <Card
      title="Where today's money came from"
      description="Each door, and how it was paid. Down payments are shown apart from balances, because one is money for work not yet done."
    >
      {partial ? (
        <Notice tone="attention" title="This is not the whole day">
          <p>
            Today&apos;s payments could not all be read, so the figures below
            are what this account can see rather than what the shop took. Close
            the day on the drawer figures above, which come from the ledger.
          </p>
        </Notice>
      ) : null}

      {breakdown.rowCount === 0 && !partial ? (
        <p className="text-sm text-muted">
          Nothing has been collected today at any of the three doors.
        </p>
      ) : (
        <>
          {/* Phone: one card per division. */}
          <div className="space-y-4 sm:hidden">
            {breakdown.divisions.map((entry) => (
              <div
                key={entry.division}
                className="rounded-card bg-surface-sunken p-4 ring-1 ring-line/60"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{entry.label}</h3>
                  <span className="text-lg font-semibold tracking-tight">
                    {formatPesos(entry.totalCentavos)}
                  </span>
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  {MONEY_SOURCES.filter(
                    (source) => entry.bySource[source] !== 0,
                  ).map((source) => (
                    <div key={source} className="flex justify-between gap-2">
                      <dt className="text-muted">{methodLabel(source)}</dt>
                      <dd>{formatPesos(entry.bySource[source])}</dd>
                    </div>
                  ))}
                  {entry.totalCentavos === 0 ? (
                    <p className="text-muted">Nothing today.</p>
                  ) : null}
                </dl>
                <KindSplit entry={entry} />
              </div>
            ))}

            <div className="flex items-baseline justify-between gap-2 border-t border-line/60 pt-3">
              <span className="font-semibold">All three</span>
              <span className="text-xl font-semibold tracking-tight">
                {formatPesos(breakdown.totalCentavos)}
              </span>
            </div>
          </div>

          {/* Tablet and up: the whole matrix. */}
          <div className="hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/60 text-left">
                  <th scope="col" className="pb-2 font-medium text-muted">
                    Door
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
                {breakdown.divisions.map((entry) => (
                  <tr key={entry.division} className="border-b border-line/60">
                    <th scope="row" className="py-3 text-left font-medium">
                      {entry.label}
                      <KindSplit entry={entry} />
                    </th>
                    {MONEY_SOURCES.map((source) => (
                      <td
                        key={source}
                        className={`py-3 text-right whitespace-nowrap ${
                          entry.bySource[source] === 0 ? "text-muted" : ""
                        }`}
                      >
                        {formatPesos(entry.bySource[source])}
                      </td>
                    ))}
                    <td className="py-3 text-right font-semibold whitespace-nowrap">
                      {formatPesos(entry.totalCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="pt-3 text-left font-semibold">
                    All three
                  </th>
                  {MONEY_SOURCES.map((source) => (
                    <td
                      key={source}
                      className="pt-3 text-right font-semibold whitespace-nowrap"
                    >
                      {formatPesos(breakdown.totalBySource[source])}
                    </td>
                  ))}
                  <td className="pt-3 text-right text-base font-semibold whitespace-nowrap">
                    {formatPesos(breakdown.totalCentavos)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {breakdown.voidedCount > 0 ? (
            <p className="mt-4 text-xs text-muted">
              {breakdown.voidedCount === 1
                ? `One voided payment of ${formatPesos(breakdown.voidedCentavos)} is`
                : `${breakdown.voidedCount} voided payments worth ${formatPesos(
                    breakdown.voidedCentavos,
                  )} are`}{" "}
              counted in none of these figures.
            </p>
          ) : null}

          {disagrees ? (
            <div className="mt-4">
              <Notice
                tone="attention"
                title="This table and the ledger do not agree"
              >
                <p>
                  The three doors add up to{" "}
                  {formatPesos(breakdown.totalCentavos)} but the ledger says the
                  day took {formatPesos(ledgerTotalCentavos)}. The ledger is the
                  record; this table is a reading of it. Close the day on the
                  figures above and show this to whoever maintains the system.
                </p>
              </Notice>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** The down payment / balance split, which only Apparel and DabzTech have. */
function KindSplit({ entry }: { entry: DivisionBreakdownRow }) {
  if (entry.division === "printshoppe") return null;
  if (entry.totalCentavos === 0) return null;

  const parts = [
    entry.downPaymentCentavos > 0
      ? `${formatPesos(entry.downPaymentCentavos)} down payments`
      : null,
    entry.balanceCentavos > 0
      ? `${formatPesos(entry.balanceCentavos)} balances`
      : null,
    // Only DabzTech can have these, and only from before Phase 10.
    entry.unlabelledCentavos > 0
      ? `${formatPesos(entry.unlabelledCentavos)} not labelled`
      : null,
  ].filter(Boolean);

  if (parts.length === 0) return null;

  return (
    <span className="mt-1 block text-xs font-normal text-muted">
      {parts.join(" · ")}
    </span>
  );
}

function methodLabel(source: MoneySource): string {
  return source === "cash_drawer" ? "Cash" : MONEY_SOURCE_LABELS[source];
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tracking-tight">{value}</dd>
    </div>
  );
}
