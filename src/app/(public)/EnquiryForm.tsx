"use client";

import { useActionState } from "react";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { DIVISION_IDS, DIVISIONS } from "@/lib/divisions";
import { ENQUIRY_LIMITS } from "@/lib/enquiries";

import { sendEnquiryAction, type EnquiryState } from "./actions";

/**
 * The enquiry form on the public page.
 *
 * Four boxes, because a customer on a phone will abandon a fifth. The division
 * is a guess the shop can correct; the "how did you hear about us" is optional
 * and is the only advertising measurement this system has - a customer saying
 * "I saw your Facebook post" is worth more than a tracking pixel and needs no
 * Meta app to collect.
 */
export function EnquiryForm() {
  const [state, submit, pending] = useActionState<EnquiryState, FormData>(
    sendEnquiryAction,
    {},
  );

  if (state.success) {
    return (
      <Notice tone="success" title={state.success}>
        If it is urgent, please call or message us on Facebook rather than
        waiting for a reply here.
      </Notice>
    );
  }

  return (
    <form action={submit} className="space-y-4">
      {/*
        The honeypot. Hidden from people and from screen readers, and left out
        of the tab order - so anything that fills it in is not a person. The
        server thanks it and stores nothing.
      */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" error={state.fieldErrors?.name}>
          <Input name="name" maxLength={ENQUIRY_LIMITS.name} required autoComplete="name" />
        </Field>

        <Field
          label="Phone or email"
          hint="So we can get back to you."
          error={state.fieldErrors?.contact}
        >
          <Input
            name="contact"
            maxLength={ENQUIRY_LIMITS.contact}
            required
            autoComplete="tel"
          />
        </Field>
      </div>

      <Field label="What is it about?">
        <Select name="division" defaultValue="">
          <option value="">Not sure / something else</option>
          {DIVISION_IDS.map((id) => (
            <option key={id} value={id}>
              {DIVISIONS[id].name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="How can we help?" error={state.fieldErrors?.message}>
        <textarea
          name="message"
          rows={5}
          required
          maxLength={ENQUIRY_LIMITS.message}
          placeholder="e.g. I need 20 jerseys for a tournament on the 30th"
          className="w-full rounded-control bg-surface-sunken px-3 py-2 text-sm text-ink ring-1 ring-line placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/50"
        />
      </Field>

      <Field
        label="How did you hear about us?"
        hint="Optional, and genuinely useful — it is how we know which posts are working."
        error={state.fieldErrors?.heardFrom}
      >
        <Input
          name="heardFrom"
          maxLength={ENQUIRY_LIMITS.heardFrom}
          placeholder="e.g. Facebook, a friend, walked past"
        />
      </Field>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Sending..." : "Send the message"}
      </Button>
    </form>
  );
}
