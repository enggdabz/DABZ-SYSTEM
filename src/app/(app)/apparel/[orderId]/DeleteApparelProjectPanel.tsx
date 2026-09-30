"use client";

/**
 * "Delete project" for an apparel project that has had money taken (`0026`).
 *
 * The plain Delete card beside it (`DeleteButton`) only ever offers a project
 * nothing has happened to, because a hard delete would take a payment's ledger
 * entries with it. This one is the second way out: a soft delete that keeps
 * every record, with the same refund question a Counter project asks - and
 * only when a payment is live. Owner only; the database says so as well.
 */
import { useActionState, useState } from "react";

import { Modal } from "@/components/Modal";
import { RefundChoiceFields } from "@/components/RefundChoiceFields";
import { Button, Field, Notice, Textarea } from "@/components/ui";
import { REASON_MAX_LENGTH } from "@/lib/project-deletion";

import { deleteApparelProjectWithMoneyAction } from "../actions";

interface State {
  error?: string;
}

export function DeleteApparelProjectPanel({
  orderId,
  orderNumber,
  paidLabel,
}: {
  orderId: string;
  orderNumber: string;
  /** What is paid, live ("₱2,000.00"), or null when every payment was handed back. */
  paidLabel: string | null;
}) {
  const [asking, setAsking] = useState(false);
  const [state, submit, pending] = useActionState<State, FormData>(
    deleteApparelProjectWithMoneyAction,
    {},
  );

  return (
    <div className="space-y-2">
      <Button type="button" variant="danger" onClick={() => setAsking(true)}>
        Delete project
      </Button>

      <Modal
        open={asking}
        title={`Delete project ${orderNumber}?`}
        onClose={() => setAsking(false)}
        busy={pending}
      >
        <form action={submit} className="space-y-4">
          <input type="hidden" name="orderId" value={orderId} />

          <Notice
            tone="attention"
            title="This removes it from the lists and the calendar now"
          >
            <p>
              Nothing is erased: the project, its people and its payments are
              kept, and Sales still shows any money that is not refunded, marked
              &ldquo;Project deleted&rdquo;.
            </p>
          </Notice>

          {/* Only when a payment is live; see RefundChoiceFields. */}
          {paidLabel ? (
            <RefundChoiceFields paidLabel={paidLabel} refundsNow />
          ) : null}

          <Field label="Why is it being deleted?" hint="Required.">
            <Textarea
              name="reason"
              rows={3}
              required
              maxLength={REASON_MAX_LENGTH}
              placeholder="For example: wrong team, duplicate entry"
            />
          </Field>

          {state.error ? <Notice tone="attention" title={state.error} /> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Deleting…" : "Delete project"}
            </Button>
            <Button
              type="button"
              variant="quiet"
              disabled={pending}
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
