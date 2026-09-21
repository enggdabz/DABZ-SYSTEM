"use client";

import { useActionState, useState } from "react";

import { Button, Notice } from "@/components/ui";
import {
  PRODUCTION_STAGES,
  PRODUCTION_STAGE_LABELS,
  type ProductionStage,
} from "@/lib/production";

import { saveItemStagesAction, type ProductionState } from "./actions";

/**
 * The ten benches for one item, as ten boxes and one Save.
 *
 * TICKING IS NOT SAVING, AND THE FORM SAYS SO. A box that looks ticked while
 * nothing has reached the database is the same class of mistake as a screen
 * showing a total it has not written: somebody walks away believing the shop
 * floor has been told. So the button counts the changes waiting in it, and a
 * line underneath says they are not saved yet until they are.
 *
 * Ten checkboxes rather than one "move to the next bench" button, because work
 * does not always arrive in order - a printer can finish two jobs while the
 * cutter is still on the first - and because a bench marked by mistake has to
 * be clearable by the same person who ticked it.
 */
export function ItemBenchesForm({
  orderId,
  lineId,
  itemName,
  marked,
  disabled = false,
}: {
  orderId: string;
  lineId: string;
  itemName: string;
  /** What the database says, which is what Save is measured against. */
  marked: readonly ProductionStage[];
  disabled?: boolean;
}) {
  const [state, submit, pending] = useActionState<ProductionState, FormData>(
    saveItemStagesAction,
    {},
  );

  /*
    The boxes are held here rather than left to the browser so the tint and the
    change count can follow a tap immediately.

    `savedKey` is how they come back into step after a save: the screen re-reads
    the marks and hands them down, this notices that what was saved has moved,
    and the boxes are reset to the database's answer. Adjusting state during a
    render like this is React's own answer to "a prop changed" - a remount by
    key would do it too, but it would throw away the message the save just
    produced, which is the one thing worth keeping.
  */
  const savedKey = marked.join(",");
  const [lastSaved, setLastSaved] = useState(savedKey);
  const [chosen, setChosen] = useState<Set<ProductionStage>>(
    () => new Set(marked),
  );

  if (lastSaved !== savedKey) {
    setLastSaved(savedKey);
    setChosen(new Set(marked));
  }

  const toggle = (stage: ProductionStage) => {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const saved = new Set(marked);
  const changes = PRODUCTION_STAGES.filter(
    (stage) => chosen.has(stage) !== saved.has(stage),
  ).length;

  const answer = state.lineId === lineId ? state : {};

  return (
    <form action={submit} className="mt-4">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="lineId" value={lineId} />

      <fieldset disabled={disabled || pending}>
        <legend className="sr-only">Benches passed by {itemName}</legend>

        {/*
          Two columns on a 390px phone, five on a desktop. Each box is a whole
          padded row rather than a bare tick: px-3 py-2 on a 14px line clears
          the 24px the design rules ask for, with the label itself as the
          target so a thumb does not have to find the little square.
        */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {PRODUCTION_STAGES.map((stage, index) => {
            const ticked = chosen.has(stage);
            const moved = ticked !== saved.has(stage);

            return (
              <label
                key={stage}
                className={`flex cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-sm ring-1 transition-colors ${
                  ticked
                    ? "bg-success/10 text-success ring-success/30"
                    : "bg-surface-sunken text-ink ring-line hover:ring-accent/40"
                } ${moved ? "ring-2 ring-accent/60" : ""}`}
              >
                <input
                  type="checkbox"
                  name="stages"
                  value={stage}
                  checked={ticked}
                  onChange={() => toggle(stage)}
                  className="size-4 shrink-0 rounded border-line"
                />
                <span className="min-w-0">
                  <span className="text-muted">{index + 1}. </span>
                  {PRODUCTION_STAGE_LABELS[stage]}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {disabled ? (
        <p className="mt-3 text-xs text-muted">
          This project was cancelled, so its benches are kept as they were.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || changes === 0}>
            {pending
              ? "Saving..."
              : changes === 0
                ? "Saved"
                : `Save ${changes} change${changes === 1 ? "" : "s"}`}
          </Button>
          {changes > 0 && !pending ? (
            <span className="text-xs text-attention">
              <span aria-hidden="true">{"⚠"} </span>
              Not saved yet
            </span>
          ) : null}
        </div>
      )}

      {answer.error ? (
        <div className="mt-3">
          <Notice tone="attention" title={answer.error} />
        </div>
      ) : null}
      {answer.success ? (
        <div className="mt-3">
          <Notice tone="success" title={answer.success} />
        </div>
      ) : null}
    </form>
  );
}
