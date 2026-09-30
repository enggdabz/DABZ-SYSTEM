"use client";

/**
 * "Delete project" on a project's page.
 *
 * For the owner it deletes; for an admin it only ASKS. The wording says which,
 * so nobody taps a button believing it did the other thing - but the button is
 * the same, because what it does is decided by the database, not by this file.
 *
 * While a request is waiting, the button is replaced by the badge and, for the
 * person who asked (or the owner), "Cancel request".
 */
import Link from "next/link";
import { useActionState, useState } from "react";

import { Modal } from "@/components/Modal";
import { RefundChoiceFields } from "@/components/RefundChoiceFields";
import { Button, Field, Notice, TAP_AREA, Textarea } from "@/components/ui";
import {
  PENDING_BADGE,
  REASON_MAX_LENGTH,
  type DeleteMode,
} from "@/lib/project-deletion";

import {
  cancelDeletionRequestAction,
  deleteProjectAction,
  type DeletionState,
} from "./deletion-actions";

export interface PendingDeletionView {
  requestId: string;
  requestedByName: string;
  reason: string;
  requestedOnLabel: string;
  /** This person is the requester, or the owner. */
  canCancel: boolean;
  /** "₱1,300.00" when a refund was asked for; what approving would hand back now. */
  refundLabel: string | null;
}

export function DeleteProjectPanel({
  projectId,
  projectNumber,
  customerName,
  mode,
  pending,
  pendingUnknown,
  isOwner,
  paidLabel,
}: {
  projectId: string;
  projectNumber: string;
  customerName: string;
  mode: DeleteMode;
  /** The waiting request, when this person may read it. */
  pending: PendingDeletionView | null;
  /**
   * A request is waiting but this person cannot read it (counter staff). The
   * badge still shows; the details do not.
   */
  pendingUnknown: boolean;
  isOwner: boolean;
  /**
   * What the project has been paid, live ("₱2,000.00"), or null when nothing
   * is. Decides whether the refund question is asked at all.
   */
  paidLabel: string | null;
}) {
  const [asking, setAsking] = useState(false);
  const [deleteState, submitDelete, deleting] = useActionState<
    DeletionState,
    FormData
  >(deleteProjectAction, {});
  const [cancelState, submitCancel, cancelling] = useActionState<
    DeletionState,
    FormData
  >(cancelDeletionRequestAction, {});

  if (pending || pendingUnknown) {
    return (
      <div className="space-y-3">
        <Notice tone="attention" title={PENDING_BADGE}>
          {pending ? (
            <p>
              {pending.requestedByName} asked on {pending.requestedOnLabel}:{" "}
              &ldquo;{pending.reason}&rdquo;. Until the owner answers, the
              project cannot be edited or moved to another stage.
              {pending.refundLabel
                ? ` A refund of ${pending.refundLabel} was asked for; nothing is refunded until the owner approves.`
                : ""}
            </p>
          ) : (
            <p>
              Until the owner answers, the project cannot be edited or moved to
              another stage.
            </p>
          )}
        </Notice>

        {pending ? (
          <div className="flex flex-wrap items-center gap-3">
            {pending.canCancel ? (
              <form action={submitCancel}>
                <input type="hidden" name="requestId" value={pending.requestId} />
                <Button type="submit" variant="secondary" disabled={cancelling}>
                  {cancelling ? "Cancelling…" : "Cancel request"}
                </Button>
              </form>
            ) : null}
            {isOwner ? (
              <Link
                href="/projects/deletion-requests"
                className={`text-sm underline underline-offset-2 ${TAP_AREA}`}
              >
                Approve or reject on the Deletion requests page
              </Link>
            ) : null}
          </div>
        ) : null}

        {cancelState.error ? (
          <Notice tone="attention" title={cancelState.error} />
        ) : null}
      </div>
    );
  }

  if (mode === "none") return null;

  const owner = mode === "delete";

  return (
    <div className="space-y-2">
      <Button type="button" variant="danger" onClick={() => setAsking(true)}>
        Delete project
      </Button>
      {deleteState.done ? (
        <Notice tone="success" title={deleteState.done} />
      ) : null}

      <Modal
        open={asking}
        title={`Delete project ${projectNumber}?`}
        onClose={() => setAsking(false)}
        busy={deleting}
      >
        <form action={submitDelete} className="space-y-4">
          <input type="hidden" name="projectId" value={projectId} />

          <Notice
            tone="attention"
            title={
              owner
                ? "This removes it from the lists and the calendar now"
                : "The owner has to approve this before anything is deleted"
            }
          >
            <p>
              {owner
                ? `${customerName}'s project disappears from Projects and the calendar. Money already taken stays in Sales and End of day, marked "Project deleted".`
                : `Your request goes to the owner. The project stays as it is, but it cannot be edited or moved to another stage until the owner answers or you cancel the request.`}
            </p>
          </Notice>

          {/* Only when money has been taken; see RefundChoiceFields. */}
          {paidLabel ? (
            <RefundChoiceFields paidLabel={paidLabel} refundsNow={owner} />
          ) : null}

          <Field label="Why is it being deleted?" hint="Required.">
            <Textarea
              name="reason"
              rows={3}
              required
              maxLength={REASON_MAX_LENGTH}
              placeholder="For example: wrong customer, duplicate entry"
            />
          </Field>

          {deleteState.error ? (
            <Notice tone="attention" title={deleteState.error} />
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={deleting}>
              {deleting
                ? "Sending…"
                : owner
                  ? "Delete project"
                  : "Send request to the owner"}
            </Button>
            <Button
              type="button"
              variant="quiet"
              disabled={deleting}
              onClick={() => setAsking(false)}
            >
              Keep it
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
