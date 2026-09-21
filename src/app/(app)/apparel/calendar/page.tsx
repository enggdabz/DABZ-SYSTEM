import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, TAP_AREA, Tag } from "@/components/ui";
import { ORDER_STATUS_LABELS } from "@/lib/apparel";
import {
  PRODUCTION_LEAD_DAYS,
  buildCalendar,
  projectLabel,
  scheduleNote,
  type ScheduledProject,
} from "@/lib/apparel-calendar";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { getApparelOrders, toCalendarOrder } from "@/lib/data/apparel";
import { formatPesos } from "@/lib/money";
import {
  addMonths,
  currentPeriod,
  formatCivilDate,
  formatPeriod,
  manilaToday,
  parseISODate,
  parsePeriodKey,
  periodKey,
  startOfWeek,
  weekDays,
  weekdayName,
} from "@/lib/period";

export const metadata = { title: "Project calendar · Dabz System" };

function showDate(iso: string): string {
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

/**
 * One project as it appears inside a day of the month grid.
 *
 * Not underlined: a chip in a calendar square reads as tappable from its
 * shape, and the padding here is the hit area the design rules ask for -
 * `py-1.5` on a 12px line clears 24px. A warning carries the icon as well as
 * the colour (spec 3.2), because red is the brand colour in this system.
 */
function DayChip({ project }: { project: ScheduledProject }) {
  const tone = project.done
    ? "bg-success/10 text-success ring-success/20"
    : project.priority
      ? "bg-attention-bg text-attention ring-attention/40"
      : "bg-ink/5 text-ink ring-line";

  return (
    <Link
      href={`/apparel/${project.id}`}
      title={`${projectLabel(project)} — ${scheduleNote(project)}`}
      className={`block truncate rounded-control px-1.5 py-1.5 text-[11px] font-medium ring-1 transition-opacity hover:opacity-80 ${tone}`}
    >
      {project.priority ? <span aria-hidden="true">{"⚠ "}</span> : null}
      {project.done ? <span aria-hidden="true">{"✓ "}</span> : null}
      {projectLabel(project)}
    </Link>
  );
}

/** One project in a list: the whole of what the shop needs to act on it. */
function ProjectRow({ project }: { project: ScheduledProject }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
      <span className="min-w-0">
        <Link
          href={`/apparel/${project.id}`}
          className={`font-medium underline-offset-2 hover:underline ${TAP_AREA}`}
        >
          {projectLabel(project)}
        </Link>
        <span className="block text-xs text-muted">
          {project.orderNumber} &middot; {ORDER_STATUS_LABELS[project.status]}
          {project.customerName ? ` · ${project.customerName}` : ""}
          {project.promisedOn
            ? ` · promised ${showDate(project.promisedOn)}`
            : ""}
        </span>
        {project.priority ? (
          <span className="mt-0.5 block text-xs text-attention">
            <span aria-hidden="true">{"⚠"} </span>
            {scheduleNote(project)}
            {project.pastPromised
              ? " · the promised date has gone past"
              : " · the customer's date has not passed yet"}
          </span>
        ) : null}
      </span>

      <span className="flex flex-wrap items-center gap-3 text-right">
        <span className="text-xs text-muted">
          {project.itemCount} item{project.itemCount === 1 ? "" : "s"}
          {project.balanceCentavos > 0
            ? ` · ${formatPesos(project.balanceCentavos)} owed`
            : " · paid"}
        </span>
        {project.done ? <Tag tone="success">Finished</Tag> : null}
      </span>
    </li>
  );
}

export default async function ApparelCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await connection();

  await requirePermission("apparel_job_orders");

  const { month } = await searchParams;
  const period = parsePeriodKey(month ?? "") ?? currentPeriod();
  const today = manilaToday();

  const [orders, settings] = await Promise.all([getApparelOrders(), getSettings()]);

  const calendar = buildCalendar({
    orders: orders.map(toCalendarOrder),
    period,
    today,
    weekStartsOn: settings.weekStartsOn,
  });

  // The weekday headings come from a real week, so Monday and Sunday starts
  // both line up with the grid underneath without a second list to keep in step.
  const headings = weekDays(startOfWeek(today, settings.weekStartsOn)).map(weekdayName);

  const previous = periodKey(addMonths(period, -1));
  const next = periodKey(addMonths(period, 1));
  const isThisMonth = periodKey(period) === periodKey(currentPeriod());

  // The agenda below `md`, where seven columns cannot be read: the same days,
  // one under the other, and only the ones with work on them.
  const agenda = calendar.weeks
    .flat()
    .filter((day) => day.inMonth && day.projects.length > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Project calendar
          </h1>
          <p className="mt-2 text-muted">
            Every Dabz Apparel job order on the day the shop means to have it
            finished
            &mdash; one day before the customer was promised it. Anything not
            finished by then is carried to today and marked priority.
          </p>
        </div>

        <Link
          href="/apparel"
          className={`shrink-0 text-sm underline underline-offset-2 ${TAP_AREA}`}
        >
          Back to the job orders
        </Link>
      </div>

      {calendar.priority.length > 0 ? (
        <Notice
          tone="attention"
          title={`${calendar.priority.length} priority project${
            calendar.priority.length === 1 ? "" : "s"
          } today`}
        >
          <p>
            These passed the day they were meant to be finished and are still on
            the bench, so they have been carried to today
            {isThisMonth ? "" : " — whichever month you are looking at"}. They
            come first.
          </p>
          <ul className="mt-2 divide-y divide-attention/20">
            {calendar.priority.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </ul>
        </Notice>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {formatPeriod(period)}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {calendar.scheduledThisMonth === 0
                ? "Nothing is due off the bench this month."
                : `${calendar.scheduledThisMonth} unfinished project${
                    calendar.scheduledThisMonth === 1 ? "" : "s"
                  } targeted at this month.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <Link
              href={`/apparel/calendar?month=${previous}`}
              className={`underline underline-offset-2 ${TAP_AREA}`}
            >
              {"←"} {formatPeriod(addMonths(period, -1))}
            </Link>
            {isThisMonth ? null : (
              <Link
                href="/apparel/calendar"
                className={`underline underline-offset-2 ${TAP_AREA}`}
              >
                This month
              </Link>
            )}
            <Link
              href={`/apparel/calendar?month=${next}`}
              className={`underline underline-offset-2 ${TAP_AREA}`}
            >
              {formatPeriod(addMonths(period, 1))} {"→"}
            </Link>
          </div>
        </div>

        {/*
          The grid from `md` up. Seven columns on a 390px phone gives each day
          about 50px, which cannot hold a team name, so the phone gets the
          agenda below instead of a grid nobody can read.
        */}
        <div className="mt-6 hidden md:block">
          <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-muted">
            {headings.map((name) => (
              <div key={name} className="pb-2">
                {name}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-card bg-line/60 ring-1 ring-line/60">
            {calendar.weeks.flat().map((day) => (
              <div
                key={day.date}
                className={`min-h-24 space-y-1 p-1.5 ${
                  day.inMonth ? "bg-surface" : "bg-surface-sunken"
                }`}
              >
                <p
                  className={`text-right text-xs ${
                    day.isToday
                      ? "font-semibold text-accent"
                      : day.inMonth
                        ? "text-muted"
                        : "text-muted/50"
                  }`}
                >
                  {day.isToday ? <span className="sr-only">Today, </span> : null}
                  {day.day}
                </p>
                {day.projects.map((project) => (
                  <DayChip key={project.id} project={project} />
                ))}
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-muted">
            A project sits {PRODUCTION_LEAD_DAYS} day before its promised date.{" "}
            <span className="text-attention">
              <span aria-hidden="true">{"⚠"}</span> marks a priority project
            </span>{" "}
            carried over from a day that passed;{" "}
            <span className="text-success">
              <span aria-hidden="true">{"✓"}</span> marks one that is finished
            </span>
            .
          </p>
        </div>

        {/* The same month, one day under the other, for a phone. */}
        <div className="mt-6 md:hidden">
          {agenda.length === 0 ? (
            <Notice tone="info" title="Nothing on the calendar this month">
              A project appears here one day before the date it was promised
              for.
            </Notice>
          ) : (
            <ul className="space-y-5">
              {agenda.map((day) => (
                <li key={day.date}>
                  <p
                    className={`text-sm font-semibold ${
                      day.isToday ? "text-accent" : ""
                    }`}
                  >
                    {showDate(day.date)}
                    {day.isToday ? " · today" : ""}
                  </p>
                  <ul className="divide-y divide-line/60">
                    {day.projects.map((project) => (
                      <ProjectRow key={project.id} project={project} />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {calendar.unscheduled.length > 0 ? (
        <Card
          title={`Not on the calendar (${calendar.unscheduled.length})`}
          description="Open job orders with no promised date. They cannot be placed until somebody says when they are due."
        >
          <Notice tone="attention" title="No promised date">
            The system will not guess one. A date invented here would be worked
            to, and the customer was never told it. Open the order and set the
            date the customer was actually promised.
          </Notice>
          <ul className="mt-4 divide-y divide-line/60">
            {calendar.unscheduled.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
