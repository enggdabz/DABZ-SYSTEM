import Link from "next/link";
import { connection } from "next/server";

import { DatabaseBehind } from "@/components/DatabaseBehind";
import { Card, TAP_AREA, Tag } from "@/components/ui";
import { requireOwner } from "@/lib/auth/dal";
import {
  getDeletionRequests,
  type DeletionRequest,
} from "@/lib/data/project-deletions";
import { formatManilaDateTime } from "@/lib/datetime";
import { isDatabaseBehind } from "@/lib/database-behind";
import { formatPesos } from "@/lib/money";
import { DELETION_STATUS_LABELS } from "@/lib/project-deletion";

import { DecisionForm } from "./DecisionForm";

export const metadata = { title: "Deletion requests · Dabz System" };

/**
 * The owner's queue of projects an admin has asked to delete.
 *
 * Owner only: `requireOwner()` here, again in the action, and once more in the
 * database function. Approving deletes the project from the lists and the
 * calendar; the money it took stays in Sales and End of day.
 */
export default async function DeletionRequestsPage() {
  await connection();
  await requireOwner();

  // The owner is the only person here, so the System check link is theirs.
  let requests: Awaited<ReturnType<typeof getDeletionRequests>>;
  try {
    requests = await getDeletionRequests();
  } catch (error) {
    // Deployed before `npm run db:push`: say so, instead of a blank error page.
    if (isDatabaseBehind(error)) {
      return (
        <div className="space-y-6">
          <h1 className="text-3xl font-semibold tracking-tight">
            Deletion requests
          </h1>
          <DatabaseBehind migration={error.migration} canOpenSystemCheck />
        </div>
      );
    }
    throw error;
  }
  const { pending, recent } = requests;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Deletion requests
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            An admin cannot delete a project, only ask. Nothing is removed until
            you approve it here. Money already taken stays in Sales and End of
            day either way.
          </p>
        </div>
        <Link
          href="/projects"
          className={`shrink-0 text-sm underline underline-offset-2 ${TAP_AREA}`}
        >
          Back to Projects
        </Link>
      </div>

      {pending.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            Nothing is waiting for your answer.
          </p>
        </Card>
      ) : (
        <ul className="space-y-4">
          {pending.map((request) => (
            <li key={request.id}>
              <RequestCard request={request} />
            </li>
          ))}
        </ul>
      )}

      {recent.length > 0 ? (
        <Card title="Recently answered" description="The last 20.">
          <ul className="divide-y divide-line/60">
            {recent.map((request) => (
              <li key={request.id} className="space-y-1 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {request.projectNumber} · {request.customerName}
                  </span>
                  <Tag
                    tone={
                      request.status === "approved"
                        ? "accent"
                        : request.status === "rejected"
                          ? "success"
                          : "neutral"
                    }
                  >
                    {DELETION_STATUS_LABELS[request.status]}
                  </Tag>
                </div>
                <p className="text-xs text-muted">
                  Asked by {request.requestedByName} · {request.reason}
                  {request.refundRequested ? " · refund asked for" : ""}
                </p>
                <p className="text-xs text-muted">
                  {request.reviewedAt
                    ? formatManilaDateTime(request.reviewedAt)
                    : ""}
                  {request.reviewedByName
                    ? ` · ${request.reviewedByName}`
                    : ""}
                  {request.reviewNote ? ` · “${request.reviewNote}”` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function RequestCard({ request }: { request: DeletionRequest }) {
  return (
    <Card>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <dl className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="attention">{"⚠"} Waiting for you</Tag>
            <span className="text-xs text-muted">
              {formatManilaDateTime(request.createdAt)}
            </span>
          </div>
          <div>
            <dt className="text-xs text-muted">Project</dt>
            <dd className="font-medium">
              {request.projectNumber}
              {request.projectName ? ` · ${request.projectName}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Customer</dt>
            <dd>{request.customerName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Asked by</dt>
            <dd>{request.requestedByName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Reason</dt>
            <dd className="whitespace-pre-wrap">{request.reason}</dd>
          </div>
          {request.refundRequested ? (
            <div>
              <dt className="text-xs text-muted">Refund</dt>
              <dd className="font-medium">
                <span aria-hidden="true">{"⚠"} </span>
                {request.refundCentavos !== null
                  ? `${formatPesos(request.refundCentavos)} to hand back`
                  : "The payments"}
                <span className="block text-xs font-normal text-muted">
                  Approving voids the payment
                  {request.refundCentavos !== null ? "s" : "s"} and takes it off
                  today&rsquo;s takings. Rejecting refunds nothing.
                </span>
              </dd>
            </div>
          ) : null}
          <div>
            <Link
              href={`/projects/${request.projectId}`}
              className={`text-sm underline underline-offset-2 ${TAP_AREA}`}
            >
              Open the project
            </Link>
          </div>
        </dl>

        <DecisionForm
          requestId={request.id}
          projectNumber={request.projectNumber}
          refundLabel={
            request.refundRequested && request.refundCentavos !== null
              ? formatPesos(request.refundCentavos)
              : null
          }
        />
      </div>
    </Card>
  );
}
