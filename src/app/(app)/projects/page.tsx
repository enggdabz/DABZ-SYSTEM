import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, TAP_AREA, Tag, buttonClasses } from "@/components/ui";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getPendingDeletionProjectIds } from "@/lib/data/project-deletions";
import { getProjects } from "@/lib/data/projects";
import { formatPesos } from "@/lib/money";
import {
  addDays,
  addMonths,
  civilDateToISO,
  currentPeriod,
  formatPeriod,
  formatWeekRange,
  manilaToday,
  parseISODate,
  parsePeriodKey,
  periodKey,
  startOfWeek,
  weekDays,
  weekdayName,
} from "@/lib/period";
import {
  PROJECT_DIVISIONS,
  PROJECT_DIVISION_SHORT,
  PROJECT_FILTER_LABELS,
  buildMonthCalendar,
  buildWeekCalendar,
  compareProjectsByDue,
  filterProjects,
  isDueThisWeek,
  isOpenProject,
  isOverdue,
  isProjectDivision,
  isProjectFilter,
  projectMoney,
  undatedProjects,
  type ProjectFilter,
} from "@/lib/projects";
import type { DivisionId } from "@/lib/divisions";

import { DayChip, ProjectRow, showDate } from "./ProjectParts";

export const metadata = { title: "Projects · Dabz System" };

type View = "list" | "month" | "week";
const VIEWS: { id: View; label: string }[] = [
  { id: "list", label: "List" },
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
];

interface Query {
  division: DivisionId | "all";
  show: ProjectFilter;
  view: View;
  month?: string;
  week?: string;
}

/** A link that keeps every other choice in the URL, so a view can be shared. */
function href(query: Query, change: Partial<Query>): string {
  const next = { ...query, ...change };
  const params = new URLSearchParams();
  if (next.division !== "all") params.set("division", next.division);
  if (next.show !== "all") params.set("show", next.show);
  if (next.view !== "list") params.set("view", next.view);
  if (next.month) params.set("month", next.month);
  if (next.week) params.set("week", next.week);
  const text = params.toString();
  return text ? `/projects?${text}` : "/projects";
}

function Chip({
  to,
  selected,
  children,
}: {
  to: string;
  selected: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={to}
      aria-current={selected ? "page" : undefined}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        selected
          ? "bg-ink text-surface"
          : "bg-ink/5 text-muted ring-1 ring-line hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    division?: string;
    show?: string;
    view?: string;
    month?: string;
    week?: string;
    deleted?: string;
  }>;
}) {
  await connection();
  // Reading a project needs the same permission as reading the sales that paid
  // it - see 0022_projects.sql for why.
  const user = await requirePermission("add_sales");

  const params = await searchParams;
  const query: Query = {
    division:
      params.division && isProjectDivision(params.division)
        ? params.division
        : "all",
    show: params.show && isProjectFilter(params.show) ? params.show : "all",
    view:
      params.view === "month" || params.view === "week" ? params.view : "list",
    month: params.month,
    week: params.week,
  };

  const today = manilaToday();
  const [projects, settings, pendingDeletionIds] = await Promise.all([
    getProjects(),
    getSettings(),
    // A deleted project is not in this list at all. One waiting for the
    // owner's answer is, with a badge - the request table is Owner/Admin only,
    // so for anyone else the badge is on the project's own page instead.
    isOwnerOrAdmin(user)
      ? getPendingDeletionProjectIds()
      : Promise.resolve(new Set<string>()),
  ]);
  const all = projects.map((project) => ({
    ...project,
    deletionPending: pendingDeletionIds.has(project.id),
  }));
  const weekStartsOn = settings.weekStartsOn;

  const open = all.filter(isOpenProject);
  const shown = filterProjects(all, {
    division: query.division,
    filter: query.show,
    today,
    weekStartsOn,
  }).sort(compareProjectsByDue);

  // The tiles are always about ALL open projects, not the filtered ones, so
  // choosing a filter never changes what "overdue" means.
  const owed = open.reduce(
    (sum, project) => sum + projectMoney(project).balanceCentavos,
    0,
  );
  const overdueCount = open.filter((project) =>
    isOverdue(project, today),
  ).length;
  const dueWeekCount = open.filter((project) =>
    isDueThisWeek(project, today, weekStartsOn),
  ).length;

  const counts = {
    all: open.length,
    unpaid: open.filter((project) => !projectMoney(project).fullyPaid).length,
    due_week: dueWeekCount,
    overdue: overdueCount,
  } satisfies Record<ProjectFilter, number>;

  const headings = weekDays(startOfWeek(today, weekStartsOn)).map(weekdayName);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Jobs taken at the Counter with a down payment or the full price.
            Each one sits on the calendar on its due date. The balance stays on
            the project until it is paid.
          </p>
        </div>
        <Link href="/pos" className={buttonClasses("feature")}>
          New project at the Counter
        </Link>
      </div>

      {params.deleted ? (
        <Notice tone="success" title={`Project ${params.deleted} was deleted`}>
          <p>
            It is off this list and the calendar. Any money it took is still in
            Sales and End of day, marked &ldquo;Project deleted&rdquo;.
          </p>
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-card bg-surface p-5 ring-1 ring-line/60">
          <p className="text-xs text-muted">Balance still owed</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {formatPesos(owed)}
          </p>
          <p className="mt-1 text-xs text-muted">
            across {counts.unpaid} project{counts.unpaid === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-card bg-surface p-5 ring-1 ring-line/60">
          <p className="text-xs text-muted">Due this week</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {dueWeekCount}
          </p>
        </div>
        <div
          className={`rounded-card p-5 ring-1 ${
            overdueCount > 0
              ? "bg-attention-bg ring-attention/40"
              : "bg-surface ring-line/60"
          }`}
        >
          <p
            className={`text-xs ${overdueCount > 0 ? "text-attention" : "text-muted"}`}
          >
            {overdueCount > 0 ? <span aria-hidden="true">{"⚠ "}</span> : null}
            Overdue
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {overdueCount}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <nav
          aria-label="Division"
          className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          <ul className="flex w-max gap-2">
            <li>
              <Chip
                to={href(query, { division: "all" })}
                selected={query.division === "all"}
              >
                All divisions
              </Chip>
            </li>
            {PROJECT_DIVISIONS.map((id) => (
              <li key={id}>
                <Chip
                  to={href(query, { division: id })}
                  selected={query.division === id}
                >
                  {PROJECT_DIVISION_SHORT[id]}
                </Chip>
              </li>
            ))}
          </ul>
        </nav>

        <nav
          aria-label="Show"
          className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          <ul className="flex w-max gap-2">
            {(Object.keys(PROJECT_FILTER_LABELS) as ProjectFilter[]).map(
              (filter) => (
                <li key={filter}>
                  <Chip
                    to={href(query, { show: filter })}
                    selected={query.show === filter}
                  >
                    {filter === "overdue" && counts.overdue > 0 ? (
                      <span aria-hidden="true">{"⚠"}</span>
                    ) : null}
                    {PROJECT_FILTER_LABELS[filter]}
                    <span
                      className={
                        query.show === filter ? "opacity-70" : "opacity-80"
                      }
                    >
                      {counts[filter]}
                    </span>
                  </Chip>
                </li>
              ),
            )}
          </ul>
        </nav>

        <nav aria-label="View" className="flex gap-2">
          {VIEWS.map((entry) => (
            <Chip
              key={entry.id}
              to={href(query, { view: entry.id })}
              selected={query.view === entry.id}
            >
              {entry.label}
            </Chip>
          ))}
        </nav>
      </div>

      {query.view === "list" ? (
        <Card>
          {shown.length === 0 ? (
            <Notice
              tone="info"
              title={open.length === 0 ? "No open projects" : "Nothing matches"}
            >
              <p>
                {open.length === 0
                  ? "Start one at the Counter: choose Project, pick a division and take the down payment."
                  : "No open project fits those filters. Choose All open to see everything."}
              </p>
            </Notice>
          ) : (
            <ul className="divide-y divide-line/60">
              {shown.map((project) => (
                <ProjectRow key={project.id} project={project} today={today} />
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <CalendarView
          query={query}
          projects={shown}
          today={today}
          weekStartsOn={weekStartsOn}
          headings={headings}
        />
      )}
    </div>
  );
}

function CalendarView({
  query,
  projects,
  today,
  weekStartsOn,
  headings,
}: {
  query: Query;
  projects: ReturnType<typeof filterProjects>;
  today: ReturnType<typeof manilaToday>;
  weekStartsOn: "monday" | "sunday";
  headings: string[];
}) {
  const undated = undatedProjects(projects);
  const overdue = projects.filter((project) => isOverdue(project, today));

  return (
    <div className="space-y-6">
      {overdue.length > 0 ? (
        <Notice
          tone="attention"
          title={`${overdue.length} overdue project${overdue.length === 1 ? "" : "s"}`}
        >
          <p>
            These passed their due date and are still open or still owed money.
            They stay on the day they were due; nothing is moved.
          </p>
          <ul className="mt-2 divide-y divide-attention/20">
            {overdue.sort(compareProjectsByDue).map((project) => (
              <li key={project.id} className="py-2">
                <Link
                  href={`/projects/${project.id}`}
                  className={`font-medium underline underline-offset-2 ${TAP_AREA}`}
                >
                  {project.customerName}
                </Link>{" "}
                <span className="text-xs">
                  {PROJECT_DIVISION_SHORT[project.division]} · due{" "}
                  {showDate(project.dueOn)} ·{" "}
                  {formatPesos(projectMoney(project).balanceCentavos)} owed
                </span>
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {query.view === "month" ? (
        <MonthCalendar
          query={query}
          projects={projects}
          today={today}
          weekStartsOn={weekStartsOn}
          headings={headings}
        />
      ) : (
        <WeekCalendar
          query={query}
          projects={projects}
          today={today}
          weekStartsOn={weekStartsOn}
        />
      )}

      {undated.length > 0 ? (
        <Card
          title={`Not on the calendar (${undated.length})`}
          description="Full-payment projects with no due date. They cannot be placed until one is given."
        >
          <ul className="divide-y divide-line/60">
            {undated.map((project) => (
              <li
                key={project.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <Link
                  href={`/projects/${project.id}`}
                  className={`font-medium underline underline-offset-2 ${TAP_AREA}`}
                >
                  {project.customerName}
                </Link>
                <span className="text-xs text-muted">
                  {PROJECT_DIVISION_SHORT[project.division]} ·{" "}
                  {project.description}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function MonthCalendar({
  query,
  projects,
  today,
  weekStartsOn,
  headings,
}: {
  query: Query;
  projects: ReturnType<typeof filterProjects>;
  today: ReturnType<typeof manilaToday>;
  weekStartsOn: "monday" | "sunday";
  headings: string[];
}) {
  const period = parsePeriodKey(query.month ?? "") ?? currentPeriod();
  const isThisMonth = periodKey(period) === periodKey(currentPeriod());
  const weeks = buildMonthCalendar({ projects, period, today, weekStartsOn });
  const agenda = weeks
    .flat()
    .filter((day) => day.inMonth && day.projects.length > 0);
  const link = (month: string | undefined) =>
    href(query, { view: "month", month });

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {formatPeriod(period)}
        </h2>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link
            href={link(periodKey(addMonths(period, -1)))}
            className={`underline underline-offset-2 ${TAP_AREA}`}
          >
            {"←"} {formatPeriod(addMonths(period, -1))}
          </Link>
          {isThisMonth ? null : (
            <Link
              href={link(undefined)}
              className={`underline underline-offset-2 ${TAP_AREA}`}
            >
              This month
            </Link>
          )}
          <Link
            href={link(periodKey(addMonths(period, 1)))}
            className={`underline underline-offset-2 ${TAP_AREA}`}
          >
            {formatPeriod(addMonths(period, 1))} {"→"}
          </Link>
        </div>
      </div>

      {/* The grid from `md` up; a phone gets the agenda below, which it can read. */}
      <div className="mt-6 hidden md:block">
        <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-muted">
          {headings.map((name) => (
            <div key={name} className="pb-2">
              {name}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-card bg-line/60 ring-1 ring-line/60">
          {weeks.flat().map((day) => (
            <div
              key={day.date}
              className={`min-h-24 min-w-0 space-y-1 p-1.5 ${
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
                <DayChip key={project.id} project={project} today={today} />
              ))}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Each project sits on its due date, showing the customer, division and
          the balance due.{" "}
          <span className="text-attention">
            <span aria-hidden="true">{"⚠"}</span> marks an overdue one
          </span>
          ;{" "}
          <span className="text-success">
            <span aria-hidden="true">{"✓"}</span> marks one that is fully paid
          </span>
          .
        </p>
      </div>

      <div className="mt-6 md:hidden">
        {agenda.length === 0 ? (
          <Notice tone="info" title="Nothing on the calendar this month">
            A project appears here on the day it is due.
          </Notice>
        ) : (
          <ul className="space-y-5">
            {agenda.map((day) => (
              <li key={day.date}>
                <p
                  className={`text-sm font-semibold ${day.isToday ? "text-accent" : ""}`}
                >
                  {showDate(day.date)}
                  {day.isToday ? " · today" : ""}
                </p>
                <ul className="divide-y divide-line/60">
                  {day.projects.map((project) => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      today={today}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function WeekCalendar({
  query,
  projects,
  today,
  weekStartsOn,
}: {
  query: Query;
  projects: ReturnType<typeof filterProjects>;
  today: ReturnType<typeof manilaToday>;
  weekStartsOn: "monday" | "sunday";
}) {
  const requested = query.week ? parseISODate(query.week) : null;
  const weekStart = startOfWeek(requested ?? today, weekStartsOn);
  const isThisWeek =
    civilDateToISO(weekStart) ===
    civilDateToISO(startOfWeek(today, weekStartsOn));
  const days = buildWeekCalendar({ projects, weekStart, today });
  const link = (week: string | undefined) =>
    href(query, { view: "week", week });
  const total = days.reduce((sum, day) => sum + day.projects.length, 0);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {formatWeekRange(weekStart)}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {total === 0
              ? "Nothing is due this week."
              : `${total} project${total === 1 ? "" : "s"} due.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link
            href={link(civilDateToISO(addDays(weekStart, -7)))}
            className={`underline underline-offset-2 ${TAP_AREA}`}
          >
            {"←"} Previous week
          </Link>
          {isThisWeek ? null : (
            <Link
              href={link(undefined)}
              className={`underline underline-offset-2 ${TAP_AREA}`}
            >
              This week
            </Link>
          )}
          <Link
            href={link(civilDateToISO(addDays(weekStart, 7)))}
            className={`underline underline-offset-2 ${TAP_AREA}`}
          >
            Next week {"→"}
          </Link>
        </div>
      </div>

      <ol className="mt-6 grid gap-3 md:grid-cols-7">
        {days.map((day) => (
          <li
            key={day.date}
            className={`min-w-0 rounded-card p-3 ring-1 ${
              day.isToday ? "ring-accent/50" : "ring-line/60"
            } bg-surface`}
          >
            <p
              className={`text-xs font-semibold ${day.isToday ? "text-accent" : "text-muted"}`}
            >
              {weekdayName(parseISODate(day.date)!)} {day.day}
              {day.isToday ? " · today" : ""}
            </p>
            <div className="mt-2 space-y-1.5">
              {day.projects.length === 0 ? (
                <p className="text-xs text-muted">—</p>
              ) : (
                day.projects.map((project) => (
                  <DayChip key={project.id} project={project} today={today} />
                ))
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">
        <Tag>Tip</Tag> Tap a project to open it and record the balance payment.
      </p>
    </Card>
  );
}
