"use client";

import { useActionState } from "react";

import { Button, Input, Notice } from "@/components/ui";
import { centavosToDecimalString } from "@/lib/money";

import { setMonthlyTargetAction, type TargetState } from "./actions";

export function TargetForm({ current }: { current: number | null }) {
  const [state, submit, pending] = useActionState<TargetState, FormData>(
    setMonthlyTargetAction,
    {},
  );

  return (
    <form action={submit} className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="text-sm font-medium">Monthly target</span>
        <span className="mt-0.5 block text-xs text-muted">
          Leave it empty if you have not decided. There is then no meter, which
          is honest &mdash; a target of nothing would read as reached.
        </span>
        <Input
          name="target"
          inputMode="decimal"
          placeholder="Not set"
          className="mt-1.5 w-44"
          defaultValue={current === null ? "" : centavosToDecimalString(current)}
        />
      </label>

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save target"}
      </Button>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? (
        <span className="text-sm text-success">{state.success}</span>
      ) : null}
    </form>
  );
}
