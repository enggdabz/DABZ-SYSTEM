"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice } from "@/components/ui";

import {
  decideVoidAction,
  requestVoidAction,
  type SalesActionState,
} from "./actions";

export function RequestVoidForm({ saleId }: { saleId: string }) {
  const [state, submit, pending] = useActionState<SalesActionState, FormData>(
    requestVoidAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (state.success) return <Notice tone="success" title={state.success} />;

  if (!open) {
    return (
      <Button type="button" variant="quiet" onClick={() => setOpen(true)}>
        Ask to void
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="saleId" value={saleId} />
      <Field
        label="What went wrong?"
        hint="The owner sees this and decides. The sale stands until then."
        error={state.fieldErrors?.reason}
      >
        <Input name="reason" required autoFocus placeholder="e.g. charged for 12 pages, only 10" />
      </Field>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send the request"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function DecideVoidForm({ requestId }: { requestId: string }) {
  const [state, submit, pending] = useActionState<SalesActionState, FormData>(
    decideVoidAction,
    {},
  );

  if (state.success) return <Notice tone="success" title={state.success} />;

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <Field label="Note" hint="Optional. Kept on the record.">
        <Input name="note" placeholder="e.g. refunded in cash" />
      </Field>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approved" disabled={pending}>
          {pending ? "Saving…" : "Approve and void"}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="rejected"
          variant="secondary"
          disabled={pending}
        >
          Reject
        </Button>
      </div>
    </form>
  );
}
