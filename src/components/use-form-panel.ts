"use client";

import { useState } from "react";

/**
 * A form that opens under a button, and forgets last time's answer.
 *
 * `useActionState` holds the server's answer until the NEXT submit, and there
 * is no way to clear it from outside - the same fact `PosScreen` works around
 * with `finishedSaleId`. These panels sit on rows and screens that never
 * unmount, so without this the second visit opens on "PHP 35.00 added" from
 * the first: an answer to a question nobody has asked yet, above an empty
 * form. On the expense pop-up it was worse - the answer REPLACED the form, so
 * the next expense could not be typed at all.
 *
 * Where a dialog can simply be unmounted, that is still the simpler fix: see
 * `QuickExpense` and `TakeOrderPayment`, which keep the state inside the
 * dialog so closing it forgets everything. This hook is for the panels that
 * cannot do that, because they ARE the button and have to stay on screen.
 *
 * The answer is hidden from the moment the panel is OPENED, not from the
 * moment it is closed, because the one place last time's answer is still
 * wanted is beside the button - there it is the receipt for what just
 * happened, and it belongs there until the person starts the next thing.
 */
export function useFormPanel<State extends object>(state: State) {
  const [open, setOpen] = useState(false);

  /*
    The answer that was already on screen when the panel was last opened.
    Identity is the test, not equality: `useActionState` hands back a NEW
    object for each answer and then the same one every render until the next
    submit, so "the object I saw when I opened this" is exactly "nothing has
    been submitted since".
  */
  const [seenBefore, setSeenBefore] = useState<State | null>(null);

  const answer: Partial<State> = state === seenBefore ? {} : state;

  return {
    open,
    /** What the server said about THIS opening. Empty until it says something. */
    answer,
    openPanel() {
      setSeenBefore(state);
      setOpen(true);
    },
    closePanel() {
      setOpen(false);
    },
  };
}
