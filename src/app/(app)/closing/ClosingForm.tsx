"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice } from "@/components/ui";
import { formatPesos, parsePesos } from "@/lib/money";

import { saveClosingAction, type ClosingState } from "./actions";

export function ClosingForm({
  expectedCashCentavos,
}: {
  expectedCashCentavos: number;
}) {
  const [state, submit, pending] = useActionState<ClosingState, FormData>(
    saveClosingAction,
    {},
  );
  const [counted, setCounted] = useState("");

  // Shown live as they count, so a mistake is spotted at the drawer rather
  // than after the form is submitted. The server works it out again anyway.
  let difference: number | null = null;
  if (counted.trim() !== "") {
    try {
      difference = parsePesos(counted) - expectedCashCentavos;
    } catch {
      difference = null;
    }
  }

  return (
    <form action={submit} className="space-y-5">
      <Field
        label="Counted cash in the drawer"
        hint="Count it and type the total."
        error={state.fieldErrors?.countedCash}
      >
        <Input
          name="countedCash"
          inputMode="decimal"
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          required
          autoFocus
          placeholder="e.g. 4500"
        />
      </Field>

      {difference !== null ? (
        <div className="rounded-control bg-surface-sunken p-4 ring-1 ring-line/60">
          <p className="text-xs text-muted">Difference</p>
          <p
            className={`mt-1 text-3xl font-semibold tracking-tight ${
              difference === 0 ? "text-success" : "text-attention"
            }`}
          >
            {difference === 0 ? (
              <>
                <span aria-hidden="true">{"✓"} </span>
                Matches
              </>
            ) : (
              <>
                <span aria-hidden="true">{"⚠"} </span>
                {formatPesos(Math.abs(difference))} {difference < 0 ? "short" : "over"}
              </>
            )}
          </p>
        </div>
      ) : null}

      <Field label="Note" hint="Optional. Anything worth remembering about today.">
        <Input name="note" placeholder="e.g. gave change from my own pocket" />
      </Field>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Close the day"}
      </Button>
    </form>
  );
}
