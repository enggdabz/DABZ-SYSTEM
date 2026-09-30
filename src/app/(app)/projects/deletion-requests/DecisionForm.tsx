"use client";

/**
 * Approve / Reject, with an optional note, for one request. Owner only - the
 * page, the action and the database each check it; this is the button.
 */
import { useActionState } from "react";

import { Button, Field, Input, Notice } from "@/components/ui";

import {
  decideDeletionAction,
  type DeletionState,
} from "../deletion-actions";

export function DecisionForm({
  requestId,
  projectNumber,
}: {
  requestId: string;
  projectNumber: string;
}) {
  const [state, act, pending] = useActionState<DeletionState, FormData>(
    decideDeletionAction,
    {},
  );

  return (
    <form action={act} className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <Field label="Note (optional)" hint="The person who asked will see it.">
        <Input name="note" maxLength={500} autoComplete="off" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="decision"
          value="approve"
          variant="danger"
          disabled={pending}
          aria-label={`Approve deleting project ${projectNumber}`}
        >
          Approve and delete
        </Button>
        <Button
          type="submit"
          name="decision"
          value="reject"
          variant="secondary"
          disabled={pending}
          aria-label={`Reject deleting project ${projectNumber}`}
        >
          Reject
        </Button>
      </div>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.done ? <Notice tone="success" title={state.done} /> : null}
    </form>
  );
}
