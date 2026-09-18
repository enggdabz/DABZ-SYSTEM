"use client";

import { useActionState } from "react";

import { Button, Field, Input, Notice } from "@/components/ui";

import { changePasswordAction, type ChangePasswordState } from "./actions";

export function ChangePasswordForm() {
  const [state, submit, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    {},
  );
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={submit} className="space-y-5">
      <Field
        label="New password"
        hint="At least 8 characters, with a letter and a number."
        error={fieldErrors.password}
      >
        <Input
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="new-password"
        />
      </Field>

      <Field label="Repeat the new password" error={fieldErrors.confirmPassword}>
        <Input
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
        />
      </Field>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Set my new password"}
      </Button>
    </form>
  );
}
