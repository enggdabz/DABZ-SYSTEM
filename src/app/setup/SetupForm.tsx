"use client";

import { useActionState } from "react";

import { Button, Field, Input, Notice } from "@/components/ui";

import { createOwnerAction, type SetupState } from "./actions";

export function SetupForm() {
  const [state, submit, pending] = useActionState<SetupState, FormData>(
    createOwnerAction,
    {},
  );
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={submit} className="space-y-5">
      <Field
        label="Your full name"
        error={fieldErrors.fullName}
      >
        <Input name="fullName" required defaultValue="Eddie boy Garcia" />
      </Field>

      <Field
        label="Username"
        hint="What you will type to sign in. Lowercase, no spaces."
        error={fieldErrors.username}
      >
        <Input
          name="username"
          required
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="eddie"
        />
      </Field>

      <Field
        label="Password"
        hint="At least 8 characters, with a letter and a number. Nobody will ever be able to see it, including you - only reset it."
        error={fieldErrors.password}
      >
        <Input name="password" type="password" required autoComplete="new-password" />
      </Field>

      <Field label="Repeat the password" error={fieldErrors.confirmPassword}>
        <Input
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
        />
      </Field>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating the account…" : "Create the owner account"}
      </Button>
    </form>
  );
}
