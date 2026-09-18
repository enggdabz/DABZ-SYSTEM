import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, TAP_AREA, Tag } from "@/components/ui";
import { getSettings, requireOwnerOrAdmin } from "@/lib/auth/dal";
import { getAdvanceBalances, getPayrollWeeks, getStaff } from "@/lib/data/staff";
import { formatPesos, sumCentavos } from "@/lib/money";
import { DAY_TYPE_LABELS } from "@/lib/payroll";
import {
  addDays,
  civilDateToISO,
  formatCivilDate,
  formatWeekRange,
  manilaToday,
  parseISODate,
  startOfWeek,
  weekdayName,
} from "@/lib/period";

import { loadWeek } from "./actions";
import { MarkPaidForm, UnlockWeekForm, WeekForm, type DayRow } from "./PayrollForms";

export const metadata = { title: "Payroll · Dabz System" };

function clockTime(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string; week?: string }>;
}) {
  await connection();

  const actor = await requireOwnerOrAdmin();
  const settings = await getSettings();
  const { staff: staffParam, week: weekParam } = await searchParams;

  const staff = await getStaff();
  const active = staff.filter((member) => member.status === "active");
  const payable = active.filter((member) => member.dailyRateCentavos !== null);

  const thisWeekStart = startOfWeek(manilaToday(), settings.weekStartsOn);
  const requestedWeek = parseISODate(weekParam ?? "") ?? thisWeekStart;
  const weekStart = startOfWeek(requestedWeek, settings.weekStartsOn);

  const selected =
    payable.find((member) => member.id === staffParam) ?? payable[0] ?? null;

  const [balances, allWeeks] = await Promise.all([
    getAdvanceBalances(),
    getPayrollWeeks({ limit: 200 }),
  ]);

  const weeksForSelected = selected
    ? allWeeks.filter((week) => week.staffId === selected.id)
    : [];

  const thisWeekAll = allWeeks.filter(
    (week) => civilDateToISO(week.weekStart) === civilDateToISO(weekStart),
  );

  const loaded = selected
    ? await loadWeek(selected.id, civilDateToISO(weekStart))
    : null;

  const dayRows: DayRow[] =
    loaded?.view.map((day) => ({
      iso: civilDateToISO(day.date),
      weekdayLabel: weekdayName(day.date),
      dayLabel: formatCivilDate(day.date),
      timeInLabel: clockTime(day.attendance.timeIn),
      timeOutLabel: clockTime(day.attendance.timeOut),
      hoursWorked: day.attendance.hoursWorked,
      late: day.attendance.late,
      forgotTimeOut: day.attendance.forgotTimeOut,
      dayType: day.dayType,
      suggestedDayType: day.suggestedDayType,
      hasStoredChoice: day.storedDayType !== null,
      overtimeHours: day.overtimeHours,
      overtimePayCentavos: day.overtimePayCentavos,
    })) ?? [];

  const previousWeek = civilDateToISO(addDays(weekStart, -7));
  const nextWeek = civilDateToISO(addDays(weekStart, 7));
  const today = civilDateToISO(manilaToday());

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Payroll</h1>
        <p className="mt-2 text-muted">
          Weekly wages at a daily rate. A half day pays half the rate, and
          overtime is your choice each day.
        </p>
      </div>

      {active.length === 0 ? (
        <Notice tone="attention" title="No active staff yet">
          <p>
            Add staff on the{" "}
            <Link href="/staff" className={`underline ${TAP_AREA}`}>
              Staff
            </Link>{" "}
            screen first.
          </p>
        </Notice>
      ) : payable.length === 0 ? (
        <Notice tone="attention" title="No daily rates have been set yet">
          <p>
            Payroll cannot work out what to pay anyone until at least one person
            has a daily rate. Set them on the{" "}
            <Link href="/staff" className={`underline ${TAP_AREA}`}>
              Staff
            </Link>{" "}
            screen &mdash; nothing has been guessed.
          </p>
        </Notice>
      ) : null}

      {thisWeekAll.length > 0 ? (
        <Card title={`Week of ${formatWeekRange(weekStart)}`}>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-muted">Total wages</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight">
                {formatPesos(
                  sumCentavos(thisWeekAll.map((week) => week.netCentavos)),
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">Paid</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-success">
                {thisWeekAll.filter((week) => week.status === "paid").length}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">Not yet paid</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight">
                {thisWeekAll.filter((week) => week.status === "draft").length}
              </dd>
            </div>
          </dl>
        </Card>
      ) : null}

      {payable.length > 0 && selected ? (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {payable.map((member) => (
                  <Link
                    key={member.id}
                    href={`/payroll?staff=${member.id}&week=${civilDateToISO(weekStart)}`}
                    className={`rounded-full px-3 py-1.5 text-sm ring-1 transition-colors ${
                      member.id === selected.id
                        ? "bg-accent text-on-accent ring-accent"
                        : "bg-ink/5 ring-line hover:bg-ink/10"
                    }`}
                  >
                    {member.fullName}
                  </Link>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/payroll?staff=${selected.id}&week=${previousWeek}`}
                  className="rounded-control bg-ink/5 px-3 py-1.5 text-sm ring-1 ring-line hover:bg-ink/10"
                >
                  {"←"} Previous week
                </Link>
                <Link
                  href={`/payroll?staff=${selected.id}&week=${nextWeek}`}
                  className="rounded-control bg-ink/5 px-3 py-1.5 text-sm ring-1 ring-line hover:bg-ink/10"
                >
                  Next week {"→"}
                </Link>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  {selected.fullName}
                </h2>
                <p className="text-sm text-muted">
                  {formatWeekRange(weekStart)} &middot;{" "}
                  {formatPesos(
                    loaded?.week?.dailyRateCentavos ?? selected.dailyRateCentavos ?? 0,
                  )}{" "}
                  a day
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {loaded?.week?.status === "paid" ? (
                    <Tag tone="success">
                      {"✓"} Paid
                      {loaded.week.paidOn
                        ? ` ${formatCivilDate(loaded.week.paidOn)}`
                        : ""}
                    </Tag>
                  ) : (
                    <Tag>Draft</Tag>
                  )}
                  {loaded?.week?.unlockReason ? (
                    <Tag tone="attention">
                      {"⚠"} Was unlocked: {loaded.week.unlockReason}
                    </Tag>
                  ) : null}
                </div>
              </div>

              {loaded?.week ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-muted">Gross</dt>
                    <dd className="mt-0.5 text-lg font-semibold">
                      {formatPesos(loaded.week.grossCentavos)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted">Less advance</dt>
                    <dd className="mt-0.5 text-lg font-semibold">
                      {formatPesos(loaded.week.advanceDeductionCentavos)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-muted">Net pay</dt>
                    <dd className="mt-0.5 text-2xl font-semibold tracking-tight">
                      {formatPesos(loaded.week.netCentavos)}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>

            <div className="mt-6 border-t border-line/60 pt-5">
              <WeekForm
                staffId={selected.id}
                weekStartISO={civilDateToISO(weekStart)}
                dailyRateCentavos={
                  loaded?.week?.dailyRateCentavos ?? selected.dailyRateCentavos ?? 0
                }
                days={dayRows}
                bonusCentavos={loaded?.week?.bonusCentavos ?? 0}
                advanceDeductionCentavos={loaded?.week?.advanceDeductionCentavos ?? 0}
                outstandingAdvanceCentavos={balances.get(selected.id) ?? 0}
                locked={loaded?.week?.status === "paid"}
              />
            </div>

            {loaded?.week ? (
              <div className="mt-6 space-y-4 border-t border-line/60 pt-5">
                {loaded.week.status === "paid" ? (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/payroll/${loaded.week.id}/payslip`}
                        className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90"
                      >
                        Open the payslip
                      </Link>
                      <p className="text-sm text-muted">
                        Paid from {loaded.week.paidSource?.replace(/_/g, " ")}
                      </p>
                    </div>
                    {actor.role === "owner" ? (
                      <UnlockWeekForm weekId={loaded.week.id} />
                    ) : (
                      <p className="text-xs text-muted">
                        A paid week is locked. Only the owner can unlock it.
                      </p>
                    )}
                  </>
                ) : (
                  <MarkPaidForm
                    weekId={loaded.week.id}
                    netCentavos={loaded.week.netCentavos}
                    today={today}
                  />
                )}
              </div>
            ) : null}
          </Card>

          {weeksForSelected.length > 0 ? (
            <Card
              title={`${selected.fullName.split(" ")[0]}'s past weeks`}
              description="Every week is kept, with the rate that was actually paid."
            >
              <ul className="divide-y divide-line/60">
                {weeksForSelected.map((week) => (
                  <li
                    key={week.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-2.5"
                  >
                    <Link
                      href={`/payroll?staff=${selected.id}&week=${civilDateToISO(week.weekStart)}`}
                      className={`text-sm underline ${TAP_AREA}`}
                    >
                      {formatWeekRange(week.weekStart)}
                    </Link>
                    <span className="flex items-center gap-2 text-sm">
                      <span className="font-medium">
                        {formatPesos(week.netCentavos)}
                      </span>
                      {week.status === "paid" ? (
                        <Tag tone="success">{"✓"} Paid</Tag>
                      ) : (
                        <Tag>Draft</Tag>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}

      <Card title="How a week is worked out">
        <ul className="space-y-2 text-sm text-muted">
          <li>
            <strong className="text-ink">{DAY_TYPE_LABELS.full}</strong> pays the
            full daily rate. A day with a time-in is suggested as a full day.
          </li>
          <li>
            <strong className="text-ink">{DAY_TYPE_LABELS.half}</strong> pays
            half the daily rate. Suggested when someone worked less than half the
            scheduled hours &mdash; but it is your choice, not the system&apos;s.
          </li>
          <li>
            <strong className="text-ink">{DAY_TYPE_LABELS.absent}</strong> pays
            nothing.
          </li>
          <li>
            Overtime hours are recorded whether or not you pay them. Leaving the
            OT pay blank records the hours and pays nothing.
          </li>
          <li>
            A cash advance deduction never takes net pay below zero; whatever
            will not fit stays owed for next payday.
          </li>
        </ul>
      </Card>
    </div>
  );
}
