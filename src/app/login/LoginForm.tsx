"use client";

import { useActionState } from "react";

import { Button, Field, Input, Notice } from "@/components/ui";

import { signInAction, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, submit, pending] = useActionState<LoginState, FormData>(
    signInAction,
    {},
  );

  return (
    <form action={submit} className="space-y-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Field label="Username">
        <Input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
          placeholder="e.g. eddie"
        />
      </Field>

      <Field label="Password">
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      {state.error ? (
        <Notice tone="attention" title={state.error}>
          {state.attemptsRemaining !== undefined && state.attemptsRemaining > 0 ? (
            <p>
              {state.attemptsRemaining === 1
                ? "1 attempt left before this account is locked for 15 minutes."
                : `${state.attemptsRemaining} attempts left before this account is locked for 15 minutes.`}
            </p>
          ) : null}
        </Notice>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
