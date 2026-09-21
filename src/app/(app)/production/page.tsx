import Link from "next/link";
import { connection } from "next/server";

import { Card, Disclosure, Notice, TAP_AREA, Tag } from "@/components/ui";
import { ORDER_STATUS_LABELS, isOpenOrder } from "@/lib/apparel";
import {
  projectLabel,
  scheduleAll,
  scheduleNote,
  type ScheduledProject,
} from "@/lib/apparel-calendar";
import { requirePermission } from "@/lib/auth/dal";
import { getApparelOrders, toCalendarOrder } from "@/lib/data/apparel";
import { getProductionSteps, productionFor } from "@/lib/data/production";
import { formatManilaDate } from "@/lib/datetime";
import {
  PRODUCTION_STAGES,
  projectStatusLabel,
  projectStatusNote,
  type ProjectProduction,
} from "@/lib/production";
import { formatCivilDate, manilaToday, parseISODate } from "@/lib/period";

export const metadata = { title: "Production report · Dabz System" };

function showDate(iso: string | null): string {
  if (!iso) return "not set";
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

/**
 * How far along, drawn.
 *
 * The bar is marks made out of marks there are to make, and the words beside
 * it say the same thing - a bar on its own is a colour, and a colour on its
 * own is not allowed to carry meaning here.
 */
function ProgressBar({ project }: { project: ProjectProduction }) {
  return (
    <div className="mt-2">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10"
        role="img"
        aria-label={`${project.marksDone} of ${project.marksTotal} benches marked`}
      >
        <div
          className={`h-full rounded-full ${
            project.complete ? "bg-success" : "bg-accent"
          }`}
          style={{ width: `${project.percentMarked}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted">
        {project.marksDone} of {project.marksTotal} benches marked
      </p>
    </div>
  );
}

/**
 * One project on the list: its status, why, and the way into it.
 *
 * `known` is false when the marks could not be read, and then this row says
 * nothing about where the work is. Without it, every project in the shop
 * would read "Not started" off an empty answer - the same confident wrong
 * claim as the PHP 0.00 that started `src/lib/schema-health.ts`.
 */
function ProjectRow({
  schedule,
  production,
  known,
}: {
  schedule: ScheduledProject;
  production: ProjectProduction;
  known: boolean;
}) {
  const tone = production.noItems
    ? "neutral"
    : production.complete
      ? "success"
      : production.stage === null
        ? "neutral"
        : "accent";

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-4">
      <div className="min-w-0 flex-1">
        <Link
          href={`/production/${schedule.id}`}
          className={`font-medium underline-offset-2 hover:underline ${TAP_AREA}`}
        >
          {projectLabel(schedule)}
        </Link>
        <p className="text-xs text-muted">
          {schedule.orderNumber} &middot; {ORDER_STATUS_LABELS[schedule.status]}
          {schedule.promisedOn
            ? ` · promised ${showDate(schedule.promisedOn)}`
            : " · no promised date"}
        </p>
        {schedule.priority ? (
          <p className="mt-0.5 text-xs text-attention">
            <span aria-hidden="true">{"⚠"} </span>
            {scheduleNote(schedule)}
          </p>
        ) : null}
        {known && production.withMissing.length > 0 ? (
          <p className="mt-0.5 text-xs text-attention">
            <span aria-hidden="true">{"⚠"} </span>
            {production.withMissing.length} item
            {production.withMissing.length === 1 ? " has" : "s have"} a bench
            skipped
          </p>
        ) : null}
      </div>

      <div className="w-full sm:w-64">
        <div className="flex items-center justify-between gap-3">
          <Tag tone={known ? tone : "neutral"}>
            {known ? projectStatusLabel(production) : "Not known"}
          </Tag>
          <span className="text-xs text-muted">
            {production.noItems
              ? "no items"
              : `${production.items.length} item${
                  production.items.length === 1 ? "" : "s"
                }`}
          </span>
        </div>
        {!known ? (
          <p className="mt-2 text-xs text-muted">The benches could not be read.</p>
        ) : production.noItems ? (
          <p className="mt-2 text-xs text-muted">{projectStatusNote(production)}</p>
        ) : (
          <ProgressBar project={production} />
        )}
      </div>
    </li>
  );
}

export default async function ProductionPage() {
  await connection();

  await requirePermission("apparel_job_orders");

  const today = manilaToday();
  const [orders, marks] = await Promise.all([
    getApparelOrders(),
    getProductionSteps(),
  ]);

  /*
    The same ordering as the project calendar, from the same function: a
    project carried over from a day that passed comes first, then by the date
    the customer was promised. Two screens about the same work that disagreed
    about which job is most urgent would be worse than one screen.
  */
  const schedule = scheduleAll({ orders: orders.map(toCalendarOrder), today });

  const byId = new Map(orders.map((detail) => [detail.order.id, detail]));

  const rows = schedule
    .map((entry) => {
      const detail = byId.get(entry.id);
      return detail
        ? { schedule: entry, production: productionFor(detail, marks.steps) }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const onTheBench = rows.filter((row) => isOpenOrder(row.schedule.status));
  const released = rows.filter((row) => !isOpenOrder(row.schedule.status));

  const finished = onTheBench.filter((row) => row.production.complete);
  const notStarted = onTheBench.filter(
    (row) => !row.production.noItems && row.production.stage === null,
  );
  const skipped = onTheBench.filter((row) => row.production.withMissing.length > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Production report
          </h1>
          <p className="mt-2 text-muted">
            Every Dabz Apparel project, and how far each item on it has got
            through the {PRODUCTION_STAGES.length} benches. A project&rsquo;s own
            status is worked out from its items &mdash; it is never typed in.
          </p>
        </div>

        <Link
          href="/apparel"
          className={`shrink-0 text-sm underline underline-offset-2 ${TAP_AREA}`}
        >
          Back to the job orders
        </Link>
      </div>

      {/*
        A failed read is NOT an empty one. Without this the whole screen would
        read "Not started" against every project in the shop - a confident
        wrong answer of exactly the kind that cost a day in September, when a
        missing migration showed up as PHP 0.00 on the Sales screen.
      */}
      {marks.failed ? (
        <Notice
          tone="attention"
          title="The benches could not be read, so nothing below says where the work is"
        >
          {marks.tableMissing ? (
            <p>
              This database does not have the production table yet, which means
              it is behind on its migrations. Nothing has been lost. Run{" "}
              <code className="rounded bg-ink/5 px-1">npm run db:push</code>, or
              open the{" "}
              <Link href="/system" className={`underline ${TAP_AREA}`}>
                System check
              </Link>{" "}
              to see what else is missing.
            </p>
          ) : (
            <p>
              The question did not get an answer. This is a fault, not a shop
              that has done no work &mdash; every mark already made is still
              there. Try again, and show this to whoever maintains the system if
              it keeps happening.
            </p>
          )}
        </Notice>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="On the bench">
          <p className="text-2xl font-semibold">{onTheBench.length}</p>
          <p className="mt-1 text-sm text-muted">
            {onTheBench.length === 0
              ? "No open projects."
              : "Open job orders, cancelled ones aside."}
          </p>
        </Card>

        <Card title="Through every bench">
          <p className="text-2xl font-semibold">
            {marks.failed ? "—" : finished.length}
          </p>
          <p className="mt-1 text-sm text-muted">
            {marks.failed
              ? "Not known while the benches cannot be read."
              : finished.length === 0
                ? "Nothing is finished yet."
                : "Made, checked and packed."}
          </p>
        </Card>

        <Card title="Not started">
          <p className="text-2xl font-semibold">
            {marks.failed ? "—" : notStarted.length}
          </p>
          <p className="mt-1 text-sm text-muted">
            {marks.failed
              ? "Not known while the benches cannot be read."
              : "No bench marked on any item."}
          </p>
        </Card>

        <Card title="Bench skipped">
          <p className="text-2xl font-semibold">
            {marks.failed ? "—" : skipped.length}
          </p>
          <p className="mt-1 text-sm text-muted">
            {marks.failed
              ? "Not known while the benches cannot be read."
              : skipped.length === 0
                ? "Every mark has its earlier benches marked too."
                : "A later bench is ticked with an earlier one blank."}
          </p>
        </Card>
      </div>

      <Card
        title="Projects on the bench"
        description="In the order the project calendar puts them: anything carried over first, then by the date the customer was promised."
      >
        {onTheBench.length === 0 ? (
          <Notice tone="info" title="No projects to report on">
            A job order appears here as soon as it is opened on the Apparel
            screen.
          </Notice>
        ) : (
          <ul className="divide-y divide-line/60">
            {onTheBench.map((row) => (
              <ProjectRow
                key={row.schedule.id}
                schedule={row.schedule}
                production={row.production}
                known={!marks.failed}
              />
            ))}
          </ul>
        )}
      </Card>

      {released.length > 0 ? (
        <Card title={`Released (${released.length})`}>
          <Disclosure label="Show released projects">
            <ul className="divide-y divide-line/60">
              {released.map((row) => (
                <ProjectRow
                  key={row.schedule.id}
                  schedule={row.schedule}
                  production={row.production}
                  known={!marks.failed}
                />
              ))}
            </ul>
          </Disclosure>
        </Card>
      ) : null}

      {marks.steps.length > 0 ? (
        <p className="text-xs text-muted">
          Last marked {formatManilaDate(latestMark(marks.steps))}.
        </p>
      ) : null}
    </div>
  );
}

/** The most recent moment anybody marked a bench, across the whole shop. */
function latestMark(steps: readonly { markedAt: string }[]): string {
  return steps.reduce(
    (latest, step) => (step.markedAt > latest ? step.markedAt : latest),
    steps[0].markedAt,
  );
}
