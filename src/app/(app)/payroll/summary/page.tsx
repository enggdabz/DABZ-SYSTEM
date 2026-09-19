import Link from "next/link";
import { connection } from "next/server";

import { Button, Card, Field, Input, Notice, TAP_AREA } from "@/components/ui";
import { getSettings, requireOwnerOrAdmin } from "@/lib/auth/dal";
import {
  getPayrollDaysForWeeks,
  getPayrollWeeksTouching,
  getStaff,
} from "@/lib/data/staff";
import { formatPesos } from "@/lib/money";
import { formatHours } from "@/lib/payroll";
import {
  PAID_STATUS_LABELS,
  PART_WEEK_NOTE,
  SUMMARY_PRESETS,
  SUMMARY_PRESET_LABELS,
  buildPayrollSummary,
  describeDayCounts,
  formatDaysPaid,
  rangeForSummaryPreset,
  resolveRange,
  type DateRange,
  type SummaryRow,
} from "@/lib/payroll-summary";
import {
  civilDateToISO,
  formatCivilDate,
  manilaToday,
  parseISODate,
} from "@/lib/period";

export const metadata = { title: "Payroll summary · Dabz System" };

function showDate(iso: string): string {
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

function summaryHref(range: DateRange): string {
  return `/payroll/summary?from=${range.fromISO}&to=${range.toISO}`;
}

/**
 * A printable payroll summary for any run of dates.
 *
 * Laid out like the payslip - black on white, a text wordmark, signature lines
 * - because it goes into the same folder. The difference is the shape: one row
 * per person rather than one row per day, and landscape paper, because ten
 * columns do not fit across an A4 portrait page.
 *
 * Owner and Admin only. Payroll is beyond any staff checkbox (spec 4.3), and a
 * summary shows every colleague's wage on one sheet, so the check here is the
 * same one that guards `/payroll` itself.
 */
export default async function PayrollSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();

  const actor = await requireOwnerOrAdmin();
  const settings = await getSettings();
  const { from, to } = await searchParams;

  const today = manilaToday();
  // With nothing in the address bar, the sheet shows the week being worked -
  // the same week `/payroll` opens on.
  const fallback = rangeForSummaryPreset("this_week", today, settings.weekStartsOn);
  const outcome = resolveRange({ from, to, fallback });

  const shown: DateRange = outcome.ok
    ? { fromISO: outcome.range.fromISO, toISO: outcome.range.toISO }
    : fallback;

  const controls = (
    <div className="space-y-6 print:hidden">
      <div>
        <Link href="/payroll" className={`text-sm underline ${TAP_AREA}`}>
          {"←"} Back to payroll
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Payroll summary
        </h1>
        <p className="mt-2 text-muted">
          Wages for any run of dates, added up from the days already saved on
          the payroll screen.
        </p>
      </div>

      <Card>
        <form method="get" action="/payroll/summary" className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <Field label="Start date">
              <Input type="date" name="from" defaultValue={shown.fromISO} />
            </Field>
            <Field label="End date">
              <Input type="date" name="to" defaultValue={shown.toISO} />
            </Field>
            <Button type="submit" className="w-full lg:w-auto">
              Show summary
            </Button>
          </div>
        </form>

        <nav aria-label="Quick picks" className="mt-5 flex flex-wrap gap-2">
          {SUMMARY_PRESETS.map((preset) => {
            const range = rangeForSummaryPreset(
              preset,
              today,
              settings.weekStartsOn,
            );
            const current =
              range.fromISO === shown.fromISO && range.toISO === shown.toISO;
            return (
              <Link
                key={preset}
                href={summaryHref(range)}
                className={`rounded-full px-3 py-1.5 text-sm ring-1 transition-colors ${
                  current
                    ? "bg-accent text-on-accent ring-accent"
                    : "bg-surface text-ink ring-line hover:ring-accent/50"
                }`}
              >
                {SUMMARY_PRESET_LABELS[preset]}
              </Link>
            );
          })}
        </nav>

        <p className="mt-4 text-sm text-muted">
          Use your browser&apos;s Print (Ctrl+P) to print or save this as a PDF.
        </p>
      </Card>

      {outcome.ok && outcome.range.swapped ? (
        <Notice tone="info" title="Those dates were the wrong way round">
          <p>
            They have been swapped, so this sheet covers{" "}
            {showDate(outcome.range.fromISO)} to {showDate(outcome.range.toISO)}.
          </p>
        </Notice>
      ) : null}

      {outcome.ok ? null : (
        <Notice tone="attention" title={outcome.title}>
          <p>{outcome.detail}</p>
        </Notice>
      )}
    </div>
  );

  if (!outcome.ok) {
    return <div className="space-y-8">{controls}</div>;
  }

  const range = outcome.range;

  const [staff, weeks] = await Promise.all([
    getStaff(),
    getPayrollWeeksTouching(range.fromISO, range.toISO),
  ]);
  const days = await getPayrollDaysForWeeks(weeks.map((week) => week.id));

  const summary = buildPayrollSummary({
    range,
    staff: staff.map((member) => ({
      id: member.id,
      fullName: member.fullName,
      position: member.position,
      dailyRateCentavos: member.dailyRateCentavos,
      status: member.status,
    })),
    weeks: weeks.map((week) => ({
      id: week.id,
      staffId: week.staffId,
      weekStartISO: civilDateToISO(week.weekStart),
      dailyRateCentavos: week.dailyRateCentavos,
      bonusCentavos: week.bonusCentavos,
      advanceDeductionCentavos: week.advanceDeductionCentavos,
      storedGrossCentavos: week.grossCentavos,
      storedNetCentavos: week.netCentavos,
      status: week.status,
    })),
    days: days.map((day) => ({
      payrollWeekId: day.payrollWeekId,
      workDateISO: civilDateToISO(day.workDate),
      dayType: day.dayType,
      overtimeHours: day.overtimeHours,
      overtimePayCentavos: day.overtimePayCentavos,
    })),
  });

  const { totals } = summary;

  return (
    <div className="space-y-8">
      {/*
        Landscape, because ten columns across A4 portrait would shrink the
        figures to the point of being unreadable - and a wage sheet is read by
        somebody checking their own pay.
      */}
      <style>{"@media print { @page { size: landscape; margin: 12mm; } }"}</style>

      {controls}

      <article className="mx-auto w-full max-w-6xl rounded-card bg-white p-6 text-black shadow-sm ring-1 ring-black/10 sm:p-8 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0">
        {/* A text wordmark, not the crest: the logos are built for black
            backgrounds and would vanish on white paper (spec 3.3). */}
        <header className="border-b-2 border-black pb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-lg font-bold tracking-tight">DABZ PRINTSHOPPE</p>
              <p className="text-[10px] font-medium tracking-[0.18em] text-black/60">
                PAYROLL SUMMARY
              </p>
            </div>
            <div className="text-right text-xs text-black/70">
              <p className="text-sm font-bold text-black">
                {showDate(range.fromISO)} to {showDate(range.toISO)}
              </p>
              <p>
                {range.days} {range.days === 1 ? "day" : "days"} &middot; Printed{" "}
                {formatCivilDate(today)}
              </p>
            </div>
          </div>
        </header>

        {summary.rows.length === 0 ? (
          <p className="mt-6 text-sm">
            Nothing was saved for these dates. A person appears here once their
            week has been filled in on the payroll screen.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="border-b border-black/40 text-left text-xs text-black/60">
                  <th className="pb-1.5 pr-3 font-medium">Staff</th>
                  <th className="whitespace-nowrap pb-1.5 pr-3 text-right font-medium">Daily rate</th>
                  <th className="whitespace-nowrap pb-1.5 pr-3 text-right font-medium">Days paid</th>
                  <th className="whitespace-nowrap pb-1.5 pr-3 text-right font-medium">Overtime</th>
                  <th className="whitespace-nowrap pb-1.5 pr-3 text-right font-medium">Bonus</th>
                  <th className="whitespace-nowrap pb-1.5 pr-3 text-right font-medium">Gross</th>
                  <th className="whitespace-nowrap pb-1.5 pr-3 text-right font-medium">Less advance</th>
                  <th className="whitespace-nowrap pb-1.5 pr-3 text-right font-medium">Net pay</th>
                  <th className="pb-1.5 pr-3 font-medium">Status</th>
                  <th className="w-40 pb-1.5 font-medium">Received by</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <Row key={row.staffId} row={row} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black text-sm font-semibold">
                  <td className="pt-2 pr-3">
                    Total &middot; {totals.staffCount}{" "}
                    {totals.staffCount === 1 ? "person" : "people"}
                  </td>
                  <td className="pt-2 pr-3" />
                  <td className="whitespace-nowrap pt-2 pr-3 text-right">
                    {formatDaysPaid(totals.fullDays, totals.halfDays)}
                  </td>
                  <td className="whitespace-nowrap pt-2 pr-3 text-right">
                    {formatPesos(totals.overtimePayCentavos)}
                  </td>
                  <td className="whitespace-nowrap pt-2 pr-3 text-right">
                    {formatPesos(totals.bonusCentavos)}
                  </td>
                  <td className="whitespace-nowrap pt-2 pr-3 text-right">
                    {formatPesos(totals.grossCentavos)}
                  </td>
                  <td className="whitespace-nowrap pt-2 pr-3 text-right">
                    {totals.advanceDeductionCentavos > 0
                      ? `−${formatPesos(totals.advanceDeductionCentavos)}`
                      : formatPesos(0)}
                  </td>
                  <td className="whitespace-nowrap pt-2 pr-3 text-right">
                    {formatPesos(totals.netCentavos)}
                  </td>
                  <td className="pt-2 pr-3" />
                  <td className="pt-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ---- What the sheet comes to ------------------------------------ */}
        <section className="mt-6 grid gap-3 border-t border-black/20 pt-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-black/60">Already paid out</p>
            <p className="text-lg font-semibold">
              {formatPesos(totals.paidNetCentavos)}
            </p>
          </div>
          <div>
            <p className="text-xs text-black/60">Still to pay</p>
            <p className="text-lg font-semibold">
              {formatPesos(totals.unpaidNetCentavos)}
            </p>
          </div>
          <div>
            <p className="text-xs text-black/60">Total net pay</p>
            <p className="text-xl font-bold tracking-tight">
              {formatPesos(totals.netCentavos)}
            </p>
          </div>
        </section>

        {/* ---- What the figures do and do not say ------------------------- */}
        <div className="mt-5 space-y-2 text-xs">
          {summary.anyPartWeek ? (
            <p className="rounded border border-black/30 p-2.5">
              <strong>Some weeks run past these dates.</strong> {PART_WEEK_NOTE}
            </p>
          ) : null}

          {summary.anyNeedsSaving ? (
            <p className="rounded border border-black/50 p-2.5">
              <strong>{"⚠"} A week needs saving again.</strong> For a row
              marked above, the saved days no longer add up to what the week
              records. Open that week on the payroll screen and save it, then
              print this sheet again &mdash; the figures here come from the
              days, so they are the ones to trust.
            </p>
          ) : null}

          {summary.missingNames.length > 0 ? (
            <p className="rounded border border-black/50 p-2.5">
              <strong>{"⚠"} Not on this sheet:</strong>{" "}
              {summary.missingNames.join(", ")}. They are working and have a
              daily rate, but no payroll week was saved for them in these dates.
            </p>
          ) : null}
        </div>

        {/* ---- Who says so ------------------------------------------------ */}
        <section className="mt-10 grid gap-8 sm:grid-cols-2">
          <div>
            <div className="border-b border-black/60" />
            <p className="mt-1.5 text-xs text-black/60">
              Prepared by {actor.fullName} &middot; signature and date
            </p>
          </div>
          <div>
            <div className="border-b border-black/60" />
            <p className="mt-1.5 text-xs text-black/60">
              Approved by Owner &middot; signature and date
            </p>
          </div>
        </section>

        <footer className="mt-6 text-[10px] text-black/50">
          Dabz Printshoppe &middot; Philippine peso ({"₱"}) &middot; A half day
          pays half the daily rate &middot; Figures are added up from each saved
          day
        </footer>
      </article>
    </div>
  );
}

/** One person's line on the sheet. */
function Row({ row }: { row: SummaryRow }) {
  const overtime =
    row.overtimeHours > 0 || row.overtimePayCentavos > 0 ? (
      <>
        {formatPesos(row.overtimePayCentavos)}
        <span className="block text-[11px] text-black/60">
          {formatHours(row.overtimeHours)}
          {row.overtimeUnpaidHours > 0 ? " · not paid" : ""}
        </span>
      </>
    ) : (
      "—"
    );

  return (
    <tr className="border-b border-black/15 align-top">
      <td className="py-2 pr-3">
        <span className="font-medium">{row.fullName}</span>
        {row.position ? (
          <span className="block text-[11px] text-black/60">{row.position}</span>
        ) : null}
        {row.includesPartWeek ? (
          <span className="block text-[11px] text-black/60">
            Includes part of a week
          </span>
        ) : null}
        {row.needsSaving ? (
          <span className="block text-[11px] font-medium">
            {"⚠"} A week needs saving again
          </span>
        ) : null}
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-right">
        {row.ratesCentavos.map((rate) => formatPesos(rate)).join(" / ")}
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-right">
        {formatDaysPaid(row.fullDays, row.halfDays)}
        <span className="block text-[11px] text-black/60">
          {describeDayCounts(row.fullDays, row.halfDays)}
        </span>
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-right">{overtime}</td>
      <td className="whitespace-nowrap py-2 pr-3 text-right">
        {row.bonusCentavos > 0 ? formatPesos(row.bonusCentavos) : "—"}
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-right">
        {formatPesos(row.grossCentavos)}
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-right">
        {row.advanceDeductionCentavos > 0
          ? `−${formatPesos(row.advanceDeductionCentavos)}`
          : "—"}
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-right font-semibold">
        {formatPesos(row.netCentavos)}
      </td>
      <td className="py-2 pr-3">
        {PAID_STATUS_LABELS[row.status]}
        {row.status === "partly" ? (
          <span className="block text-[11px] text-black/60">
            {formatPesos(row.unpaidNetCentavos)} still to pay
          </span>
        ) : null}
      </td>
      {/* Signed on the paper, so the cell is left empty with a line to sign on. */}
      <td className="py-2">
        <span className="mt-4 block border-b border-black/50" />
      </td>
    </tr>
  );
}
