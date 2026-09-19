"use client";

/**
 * The Delete button for a bill, a loan or a product.
 *
 * One component for all three because the rule is the same in all three
 * places, and the rule is the interesting part: a row with money behind it can
 * only be STOPPED, and a row with nothing behind it can go. The wording lives
 * in `src/lib/deletable.ts` and the refusal is enforced by the delete policies
 * in migration 0011 - this is only the button.
 *
 * Two things it deliberately does.
 *
 * It asks first. Deleting is the one action on these screens that cannot be
 * undone from the screen, and the counter is a place where people tap quickly.
 * The confirmation names the row, because "Are you sure?" beside eleven
 * identical cards is a question about nothing in particular. It is a step in
 * the page rather than a browser `confirm()`, which cannot be styled, cannot
 * be read by the same people the rest of the system was built for, and is
 * blocked outright in some browsers.
 *
 * And when the row cannot be deleted it says so, instead of hiding the button.
 * A missing button teaches nothing; a sentence explaining that the bill has
 * been paid and offering Stop instead teaches the rule once.
 */
import { useActionState, useState } from "react";

import { Button, Notice } from "@/components/ui";
import {
  canDelete,
  deleteConfirmation,
  deleteRefusal,
  type CatalogueKind,
} from "@/lib/deletable";

/**
 * The shape every one of these actions returns. The three screens' own state
 * types add a `fieldErrors` this button has no use for, and each is assignable
 * to this.
 */
export interface DeleteActionState {
  error?: string;
  success?: string;
}

export function DeleteButton({
  kind,
  name,
  idField,
  id,
  hasHistory,
  action,
  /** Anything else worth saying before the row goes, e.g. a bill it unlinks. */
  consequence,
}: {
  kind: CatalogueKind;
  name: string;
  idField: string;
  id: string;
  hasHistory: boolean;
  action: (
    previous: DeleteActionState,
    formData: FormData,
  ) => Promise<DeleteActionState>;
  consequence?: string;
}) {
  const [state, submit, pending] = useActionState<DeleteActionState, FormData>(
    action,
    {},
  );
  const [asking, setAsking] = useState(false);

  if (!canDelete(hasHistory)) {
    return (
      <p className="text-sm text-muted">{deleteRefusal(kind, true)}</p>
    );
  }

  if (!asking) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="danger" onClick={() => setAsking(true)}>
          Delete {name}
        </Button>
        {state.error ? <Notice tone="attention" title={state.error} /> : null}
        {state.success ? <Notice tone="success" title={state.success} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/*
        The question and the refusal are never shown together. Leaving both up
        put "has no history, so nothing else is affected" directly above
        "Nothing was deleted: this bill now has history behind it" - two
        sentences contradicting each other, with no way to tell which was the
        current one.
      */}
      {state.error ? (
        <Notice tone="attention" title={state.error} />
      ) : (
        /* Notice carries the ⚠ and a word of its own, never colour alone. */
        <Notice tone="attention" title={deleteConfirmation(kind, name)}>
          {consequence ? <p>{consequence}</p> : null}
        </Notice>
      )}

      <form action={submit} className="flex flex-wrap gap-2">
        <input type="hidden" name={idField} value={id} />
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting…" : `Yes, delete ${name}`}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </form>
    </div>
  );
}
