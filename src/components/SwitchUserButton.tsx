"use client";

import { useTransition } from "react";

import { signOutAction } from "@/app/login/actions";

/**
 * Ends this person's session and returns to the login screen (spec 4.1).
 *
 * Called "Switch user" rather than "Sign out" because that is what it is for:
 * the counter computer is shared, and the next person needs their own name on
 * whatever they enter.
 */
export function SwitchUserButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => void signOutAction())}
      className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/80 transition-colors hover:border-white/40 hover:text-white disabled:opacity-50"
    >
      {pending ? "Signing out…" : "Switch user"}
    </button>
  );
}
