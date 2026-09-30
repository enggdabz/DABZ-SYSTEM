import Link from "next/link";

import { Tag, TAP_AREA } from "@/components/ui";
import { formatPesos } from "@/lib/money";
import {
  PROJECT_DIVISION_SHORT,
  daysUntilDue,
  isOverdue,
  paymentLabel,
  productionLabel,
  projectMoney,
  type Project,
} from "@/lib/projects";
import { formatCivilDate, parseISODate, type CivilDate } from "@/lib/period";

export function showDate(iso: string | null): string {
  if (!iso) return "No due date";
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

/**
 * How the due date reads next to today. An overdue project says so in words
 * and carries the warning icon: red is the brand colour here, so colour alone
 * would read as a button (spec 3.2).
 */
export function DueNote({
  project,
  today,
}: {
  project: Project;
  today: CivilDate;
}) {
  const days = daysUntilDue(project, today);
  if (days === null) return <span className="text-muted">No due date</span>;

  if (isOverdue(project, today)) {
    return (
      <span className="text-attention">
        <span aria-hidden="true">{"⚠"} </span>
        Overdue by {Math.abs(days)} day{Math.abs(days) === 1 ? "" : "s"}{" "}
        &middot; {showDate(project.dueOn)}
      </span>
    );
  }
  if (days === 0) return <span className="font-medium">Due today</span>;
  return (
    <span className="text-muted">
      Due {showDate(project.dueOn)} &middot; in {days} day
      {days === 1 ? "" : "s"}
    </span>
  );
}

export function DivisionTag({ project }: { project: Project }) {
  return <Tag>{PROJECT_DIVISION_SHORT[project.division]}</Tag>;
}

/** One project in a list: everything the shop needs to act on it. */
export function ProjectRow({
  project,
  today,
}: {
  project: Project;
  today: CivilDate;
}) {
  const money = projectMoney(project);

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/projects/${project.id}`}
            className={`font-medium underline-offset-2 hover:underline ${TAP_AREA}`}
          >
            {project.customerName}
          </Link>
          <DivisionTag project={project} />
        </div>
        <p className="mt-0.5 text-sm">{project.description}</p>
        <p className="mt-0.5 text-xs text-muted">
          {project.number}
          {project.contact ? ` · ${project.contact}` : ""}
        </p>
        <p className="mt-1 text-xs">
          <DueNote project={project} today={today} />
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 text-right text-sm">
        <span className={money.fullyPaid ? "text-success" : "font-medium"}>
          {money.fullyPaid ? <span aria-hidden="true">{"✓ "}</span> : null}
          {paymentLabel(money, formatPesos)}
        </span>
        <span className="text-xs text-muted">
          {formatPesos(money.paidCentavos)} of{" "}
          {formatPesos(project.totalCentavos)} paid
        </span>
        <Tag tone={project.status === "open" ? "neutral" : "accent"}>
          {productionLabel(project)}
        </Tag>
      </div>
    </li>
  );
}

/**
 * A project inside a day of the month grid: customer and balance, and the
 * whole of it in the tooltip. The padding is the hit area the design rules ask
 * for - `py-1.5` on a 12px line clears 24px.
 */
export function DayChip({
  project,
  today,
}: {
  project: Project;
  today: CivilDate;
}) {
  const money = projectMoney(project);
  const overdue = isOverdue(project, today);
  const tone = money.fullyPaid
    ? "bg-success/10 text-success ring-success/20"
    : overdue
      ? "bg-attention-bg text-attention ring-attention/40"
      : "bg-ink/5 text-ink ring-line";

  return (
    <Link
      href={`/projects/${project.id}`}
      title={`${project.customerName} · ${PROJECT_DIVISION_SHORT[project.division]} · ${project.description} · ${paymentLabel(money, formatPesos)} · ${productionLabel(project)}`}
      className={`block rounded-control px-1.5 py-1.5 text-[11px] font-medium leading-tight ring-1 transition-opacity hover:opacity-80 ${tone}`}
    >
      <span className="block truncate">
        {overdue ? <span aria-hidden="true">{"⚠ "}</span> : null}
        {money.fullyPaid ? <span aria-hidden="true">{"✓ "}</span> : null}
        {project.customerName}
      </span>
      <span className="block truncate opacity-80">
        {PROJECT_DIVISION_SHORT[project.division]} ·{" "}
        {money.fullyPaid ? "Paid" : formatPesos(money.balanceCentavos)}
      </span>
    </Link>
  );
}
