"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signIn } from "@/app/actions/auth";
import { emptyActionState } from "@/lib/action-state";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="label-caps w-full rounded-lg bg-brand px-4 py-3 text-white transition hover:bg-brand-strong disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

// The card is always white, so these inputs are styled for a light surface
// rather than following the app's light/dark tokens.
const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";

export function SignInForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signIn, emptyActionState);

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <label className="block space-y-1.5">
        <span className="label-caps text-zinc-600">Username</span>
        <input
          name="username"
          type="text"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className={inputClass}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="label-caps text-zinc-600">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border-l-2 border-brand bg-brand-soft px-3 py-2 text-sm text-brand-strong"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />

      <p className="text-center text-xs text-zinc-500">
        Accounts are created by the owner or an admin.
      </p>
    </form>
  );
}
