"use client";

import { useActionState } from "react";

import { Button, Field, Input, Notice } from "@/components/ui";
import { saveCustomerAction } from "@/app/(app)/pos/actions";

export function CustomerForm() {
  const [state, submit, pending] = useActionState(saveCustomerAction, {});

  return (
    <form action={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name, team or company">
          <Input name="name" required placeholder="e.g. Barangay San Jose" />
        </Field>
        <Field label="Contact number">
          <Input name="contactNumber" />
        </Field>
        <Field
          label="Facebook / Messenger name"
          hint="Most orders arrive through Messenger, so this is worth filling in."
        >
          <Input name="facebookName" />
        </Field>
        <Field label="Email" hint="Optional.">
          <Input name="email" type="email" />
        </Field>
      </div>

      <Field label="Address" hint="Optional.">
        <Input name="address" />
      </Field>

      <Field label="Note" hint="Optional.">
        <Input name="note" />
      </Field>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.customerId ? <Notice tone="success" title="Customer saved." /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add customer"}
      </Button>
    </form>
  );
}
