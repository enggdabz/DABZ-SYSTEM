import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { Card, Notice, TAP_AREA, Tag } from "@/components/ui";
import { requirePermission } from "@/lib/auth/dal";
import { can, isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getPendingRequestForProject } from "@/lib/data/project-deletions";
import { getProject } from "@/lib/data/projects";
import { formatManilaDate } from "@/lib/datetime";
import {
  PENDING_BADGE,
  canCancelDeletionRequest,
  deleteMode,
} from "@/lib/project-deletion";
import { formatPesos } from "@/lib/money";
import { manilaToday } from "@/lib/period";
import {
  PROJECT_DIVISION_LABELS,
  PROJECT_PAYMENT_KIND_LABELS,
  PROJECT_STEPS,
  PROJECT_STEP_PERMISSION,
  paymentLabel,
  productionLabel,
  projectMoney,
} from "@/lib/projects";

import { BalanceForm } from "../BalanceForm";
import { DeleteProjectPanel } from "../DeleteProjectPanel";
import { DueNote } from "../ProjectParts";
import { ProjectMoves } from "../ProjectMoves";

export const metadata = { title: "Project · Dabz System" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await connection();
  const user = await requirePermission("add_sales");

  const { projectId } = await params;
  if (!UUID.test(projectId)) notFound();

  const project = await getProject(projectId);
  if (!project) notFound();

  const today = manilaToday();
  const money = projectMoney(project);

  // A request waiting on the owner freezes the project: no edits and no stage
  // changes. The database refuses them as well - see 0023's triggers - this is
  // only so the page stops offering what would be refused.
  const frozen = project.deletionPending === true;
  const mode = deleteMode(user.role);
  // The request's details are Owner/Admin material; counter staff still get
  // the badge, from `project_deletion_pending`, but not who asked or why.
  const request = isOwnerOrAdmin(user)
    ? await getPendingRequestForProject(project.id)
    : null;
  const canTick = can(user, PROJECT_STEP_PERMISSION[project.division]);
  const payments = [...project.payments].sort((a, b) =>
    a.saleDate.localeCompare(b.saleDate),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{project.number}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {project.customerName}
          </h1>
          <p className="mt-2 max-w-2xl">{project.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Tag>{PROJECT_DIVISION_LABELS[project.division]}</Tag>
            <Tag tone={project.status === "open" ? "neutral" : "accent"}>
              {productionLabel(project)}
            </Tag>
            {frozen ? (
              <Tag tone="attention">
                {"⚠"} {PENDING_BADGE}
              </Tag>
            ) : null}
            <Tag tone={money.fullyPaid ? "success" : "attention"}>
              {money.fullyPaid ? "✓ " : "⚠ "}
              {paymentLabel(money, formatPesos)}
            </Tag>
          </div>
        </div>
        <Link
          href="/projects"
          className={`shrink-0 text-sm underline underline-offset-2 ${TAP_AREA}`}
        >
          Back to Projects
        </Link>
      </div>

      {project.status === "cancelled" ? (
        <Notice tone="attention" title="This project was cancelled">
          <p>{project.cancelReason}</p>
          {!money.fullyPaid || money.paidCentavos > 0 ? (
            <p className="mt-1">
              {formatPesos(money.paidCentavos)} was taken and is still in the
              books. Void the sale on the Sales screen if it was handed back.
            </p>
          ) : null}
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-card bg-surface p-5 ring-1 ring-line/60">
          <p className="text-xs text-muted">Total price</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {formatPesos(project.totalCentavos)}
          </p>
        </div>
        <div className="rounded-card bg-surface p-5 ring-1 ring-line/60">
          <p className="text-xs text-muted">Paid so far</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {formatPesos(money.paidCentavos)}
          </p>
        </div>
        <div
          className={`rounded-card p-5 ring-1 ${
            money.fullyPaid
              ? "bg-surface ring-success/30"
              : "bg-attention-bg ring-attention/40"
          }`}
        >
          <p
            className={`text-xs ${money.fullyPaid ? "text-success" : "text-attention"}`}
          >
            {money.fullyPaid ? "✓ Fully paid" : "⚠ Balance due"}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {formatPesos(money.balanceCentavos)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Details">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Due / target release date</dt>
              <dd>
                <DueNote project={project} today={today} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Contact</dt>
              <dd>
                {project.contact ?? (
                  <span className="text-muted">Not recorded</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        {project.status !== "cancelled" && !money.fullyPaid ? (
          <Card
            title="Record the balance payment"
            description="Posts a new sale for today and reduces the balance."
          >
            <BalanceForm
              projectId={project.id}
              balanceCentavos={money.balanceCentavos}
            />
          </Card>
        ) : null}
      </div>

      <Card
        title="Payments"
        description="Each one is a sale on the day the money came in."
      >
        <ul className="divide-y divide-line/60">
          {payments.map((payment) => (
            <li
              key={payment.saleId}
              className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
            >
              <span className={payment.voided ? "text-muted line-through" : ""}>
                {PROJECT_PAYMENT_KIND_LABELS[payment.kind]} &middot;{" "}
                {formatManilaDate(`${payment.saleDate}T12:00:00+08:00`)}{" "}
                &middot; {payment.method}
              </span>
              <span className="flex items-center gap-3">
                {payment.voided ? <Tag tone="attention">⚠ Voided</Tag> : null}
                <span
                  className={
                    payment.voided ? "text-muted line-through" : "font-medium"
                  }
                >
                  {formatPesos(payment.amountCentavos)}
                </span>
                <Link
                  href={`/sales/${payment.saleId}/receipt`}
                  className={`text-xs underline underline-offset-2 ${TAP_AREA}`}
                >
                  Receipt {payment.saleNumber}
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Production"
        description={`${PROJECT_DIVISION_LABELS[project.division]} steps, in order.`}
      >
        <ProjectMoves
          projectId={project.id}
          steps={PROJECT_STEPS[project.division]}
          doneSteps={project.steps}
          status={project.status}
          canTick={canTick}
          frozen={frozen}
        />
      </Card>

      {mode !== "none" || frozen ? (
        <Card
          title="Delete this project"
          description={
            mode === "delete"
              ? "Removes it from the lists and the calendar. Money already taken stays in Sales and End of day."
              : mode === "request"
                ? "An admin sends a request; the owner approves it before anything is deleted."
                : undefined
          }
        >
          <DeleteProjectPanel
            projectId={project.id}
            projectNumber={project.number}
            customerName={project.customerName}
            mode={mode}
            isOwner={user.role === "owner"}
            pendingUnknown={frozen && request === null}
            pending={
              request
                ? {
                    requestId: request.id,
                    requestedByName: request.requestedByName,
                    reason: request.reason,
                    requestedOnLabel: formatManilaDate(request.createdAt),
                    canCancel: canCancelDeletionRequest({
                      role: user.role,
                      userId: user.id,
                      requestedBy: request.requestedBy,
                    }),
                  }
                : null
            }
          />
        </Card>
      ) : null}
    </div>
  );
}
