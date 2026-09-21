"use client";

import { useActionState } from "react";

import { Button, Field, Notice } from "@/components/ui";
import { useFormPanel } from "@/components/use-form-panel";
import type { Enquiry } from "@/lib/enquiries";

import { setEnquiryStatusAction, type EnquiryActionState } from "./actions";

/**
 * What the shop does with one message.
 *
 * The system deliberately does NOT send the reply. The shop answers on
 * Messenger, by text or by phone - wherever the customer wrote from - and
 * records here that it happened and what was said. Pretending to send an email
 * from a mail account the shop has not set up would be worse than not offering
 * it: the customer would be waiting for something that never left.
 *
 * Which button was pressed carries the new status, as the submitter's own
 * name/value. A piece of React state set in an onClick would not have reached
 * the form data in time.
 */
export function EnquiryReply({ enquiry }: { enquiry: Enquiry }) {
  const [state, submit, pending] = useActionState<EnquiryActionState, FormData>(
    setEnquiryStatusAction,
    {},
  );
  const { open, answer, openPanel, closePanel } = useFormPanel(state);

  if (enquiry.status !== "new") {
    return (
      <form action={submit} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="enquiryId" value={enquiry.id} />
        <input type="hidden" name="replyNote" value={enquiry.replyNote ?? ""} />
        <Button
          type="submit"
          name="status"
          value="new"
          variant="quiet"
          disabled={pending}
        >
          {pending ? "Saving..." : "Put back on the list"}
        </Button>
        {answer.error ? <Notice tone="attention" title={answer.error} /> : null}
      </form>
    );
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" onClick={openPanel}>
          Answer this
        </Button>
        {answer.success ? <Notice tone="success" title={answer.success} /> : null}
        {answer.error ? <Notice tone="attention" title={answer.error} /> : null}
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="enquiryId" value={enquiry.id} />

      <Field
        label="What did you tell them?"
        hint="For your own records — the customer never sees this."
        error={answer.fieldErrors?.replyNote}
      >
        <textarea
          name="replyNote"
          rows={3}
          maxLength={1000}
          defaultValue={enquiry.replyNote ?? ""}
          placeholder="e.g. quoted per jersey for 15, she will confirm Friday"
          className="w-full rounded-control bg-surface-sunken px-3 py-2 text-sm text-ink ring-1 ring-line placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/50"
        />
      </Field>

      {answer.error ? <Notice tone="attention" title={answer.error} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="status" value="replied" disabled={pending}>
          {pending ? "Saving..." : "Mark replied"}
        </Button>
        <Button
          type="submit"
          name="status"
          value="closed"
          variant="secondary"
          disabled={pending}
        >
          Close without replying
        </Button>
        <Button type="button" variant="quiet" onClick={closePanel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
