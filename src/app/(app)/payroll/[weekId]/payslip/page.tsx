import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getSignedInUser } from "@/lib/auth/dal";
import { getPayrollDays, getPayrollWeeks, getStaff } from "@/lib/data/staff";
import { formatPesos } from "@/lib/money";
import { DAY_TYPE_LABELS, formatHours } from "@/lib/payroll";
import {
  addDays,
  civilDateToISO,
  formatCivilDate,
  formatWeekRange,
  weekdayName,
} from "@/lib/period";

export const metadata = { title: "Payslip · Dabz System" };

/**
 * A printable payslip (spec 13.3).
 *
 * Deliberately plain: black on white, no navigation, and a signature line, so
 * it prints on ordinary paper and can be signed as received. The Dabz logos are
 * built for black backgrounds, so this uses a text wordmark rather than a white
 * crest that would vanish on the page (spec 3.3).
 *
 * Readable by the Owner, an Admin, or the person it belongs to - and nobody
 * else, which Row Level Security enforces on the query below.
 */
export default async function PayslipPage({
  params,
}: {
  params: Promise<{ weekId: string }>;
}) {
  await connection();

  const { weekId } = await params;
  const user = await getSignedInUser();
  if (!user) notFound();

  const weeks = await getPayrollWeeks({ limit: 500 });
  const week = weeks.find((entry) => entry.id === weekId);
  // Not found rather than "forbidden": if the policies did not return it, it
  // is not this person's to know about.
  if (!week) notFound();

  const [staff, days] = await Promise.all([getStaff(), getPayrollDays(weekId)]);
  const member = staff.find((entry) => entry.id === week.staffId);

  const halfRate = Math.round(week.dailyRateCentavos / 2);

  /*
    Every figure on this slip is added up from the rows printed below it, not
    worked backwards from a stored total. A payslip is signed as received, so
    the arithmetic has to be checkable by hand: if the rows say PHP 2,750 then
    the day pay line has to say PHP 2,750.

    The stored totals are still compared against these, and a mismatch is
    printed rather than quietly absorbed - it means the week needs saving
    again, which is exactly the thing nobody should discover afterwards.
  */
  const dayPayTotal = days.reduce((total, day) => {
    if (day.dayType === "full") return total + week.dailyRateCentavos;
    if (day.dayType === "half") return total + halfRate;
    return total;
  }, 0);

  const overtimeTotal = days.reduce(
    (total, day) => total + day.overtimePayCentavos,
    0,
  );
  const overtimeHours = days.reduce((total, day) => total + day.overtimeHours, 0);

  const computedGross = dayPayTotal + overtimeTotal + week.bonusCentavos;
  const computedNet = Math.max(0, computedGross - week.advanceDeductionCentavos);
  const figuresDisagree =
    computedGross !== week.grossCentavos || computedNet !== week.netCentavos;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Hidden when printing: the screen-only controls. */}
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/payroll" className="text-sm underline">
          {"←"} Back to payroll
        </Link>
        <span className="text-sm text-muted">
          Use your browser&apos;s Print (Ctrl+P) to print or save this.
        </span>
      </div>

      <article className="rounded-card bg-white p-8 text-black shadow-sm ring-1 ring-black/10 print:rounded-none print:p-0 print:shadow-none print:ring-0">
        <header className="border-b border-black/20 pb-4">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-lg font-bold tracking-tight">DABZ PRINTSHOPPE</p>
              <p className="text-[10px] font-medium tracking-[0.18em] text-black/60">
                PAYSLIP
              </p>
            </div>
            <div className="text-right text-xs text-black/70">
              <p>Week of {formatWeekRange(week.weekStart)}</p>
              {week.paidOn ? <p>Paid {formatCivilDate(week.paidOn)}</p> : <p>Not yet paid</p>}
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-black/60">Staff member</p>
            <p className="font-semibold">{member?.fullName ?? "Staff"}</p>
            {member?.position ? (
              <p className="text-xs text-black/70">{member.position}</p>
            ) : null}
          </div>
          <div className="sm:text-right">
            <p className="text-xs text-black/60">Daily rate</p>
            <p className="font-semibold">{formatPesos(week.dailyRateCentavos)}</p>
            <p className="text-xs text-black/70">
              Half day {formatPesos(halfRate)}
            </p>
          </div>
        </section>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-black/20 text-left text-xs text-black/60">
              <th className="pb-1.5 font-medium">Day</th>
              <th className="pb-1.5 font-medium">Counts as</th>
              <th className="pb-1.5 font-medium">Overtime</th>
              <th className="pb-1.5 text-right font-medium">Pay</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 7 }, (_, index) => addDays(week.weekStart, index)).map(
              (date) => {
                const iso = civilDateToISO(date);
                const day = days.find(
                  (entry) => civilDateToISO(entry.workDate) === iso,
                );
                const type = day?.dayType ?? "absent";
                const pay =
                  type === "full"
                    ? week.dailyRateCentavos
                    : type === "half"
                      ? halfRate
                      : 0;

                return (
                  <tr key={iso} className="border-b border-black/10">
                    <td className="py-1.5">
                      {weekdayName(date)} {date.day}
                    </td>
                    <td className="py-1.5">{DAY_TYPE_LABELS[type]}</td>
                    <td className="py-1.5">
                      {day && day.overtimeHours > 0
                        ? `${formatHours(day.overtimeHours)}${
                            day.overtimePayCentavos > 0
                              ? ` · ${formatPesos(day.overtimePayCentavos)}`
                              : " · not paid"
                          }`
                        : "—"}
                    </td>
                    <td className="py-1.5 text-right">{formatPesos(pay)}</td>
                  </tr>
                );
              },
            )}
          </tbody>
        </table>

        <section className="mt-5 space-y-1.5 text-sm">
          <Line label="Day pay" value={formatPesos(dayPayTotal)} />
          {overtimeTotal > 0 ? (
            <Line
              label={`Overtime (${formatHours(overtimeHours)})`}
              value={formatPesos(overtimeTotal)}
            />
          ) : null}
          {week.bonusCentavos > 0 ? (
            <Line label="Bonus" value={formatPesos(week.bonusCentavos)} />
          ) : null}
          <div className="border-t border-black/20 pt-1.5">
            <Line label="Gross pay" value={formatPesos(computedGross)} bold />
          </div>
          {week.advanceDeductionCentavos > 0 ? (
            <Line
              label="Less cash advance"
              value={`−${formatPesos(week.advanceDeductionCentavos)}`}
            />
          ) : null}
          <div className="border-t-2 border-black pt-2">
            <Line label="NET PAY" value={formatPesos(computedNet)} bold large />
          </div>
        </section>

        {figuresDisagree ? (
          <p className="mt-4 rounded border border-black/40 p-3 text-xs">
            <strong>{"\u26a0"} These figures do not match what is recorded.</strong>{" "}
            The days above add up to {formatPesos(computedGross)} gross and{" "}
            {formatPesos(computedNet)} net, but the week is stored as{" "}
            {formatPesos(week.grossCentavos)} and {formatPesos(week.netCentavos)}.
            Open the week on the payroll screen and save it again before handing
            this over.
          </p>
        ) : null}

        <section className="mt-10 border-t border-black/20 pt-6">
          <p className="text-xs text-black/60">Received by</p>
          <div className="mt-8 border-b border-black/60" />
          <p className="mt-1.5 text-xs text-black/60">
            {member?.fullName ?? "Staff member"} &middot; signature and date
          </p>
        </section>

        <footer className="mt-6 text-[10px] text-black/50">
          Dabz Printshoppe &middot; Philippine peso ({"₱"}) &middot; A half
          day pays half the daily rate
        </footer>
      </article>
    </div>
  );
}

function Line({
  label,
  value,
  bold = false,
  large = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  large?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={bold ? "font-semibold" : ""}>{label}</span>
      <span
        className={`${bold ? "font-semibold" : ""} ${large ? "text-xl tracking-tight" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
