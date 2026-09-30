"use client";

/**
 * Production steps, release and cancel for one project.
 *
 * Only the CURRENT step has a button: the first step of the division's list
 * with no mark. There is no "ready" shortcut. The database enforces the same
 * order, so a stale screen cannot skip a step either.
 */
import { useActionState } from "react";

import { Button, Disclosure, Field, Input, Notice } from "@/components/ui";
import { PROJECT_STEP_LABELS } from "@/lib/projects";

import { projectMoveAction, type ProjectMoveState } from "./actions";

export function ProjectMoves({
  projectId,
  steps,
  doneSteps,
  status,
  canTick,
  frozen = false,
}: {
  projectId: string;
  steps: readonly string[];
  doneSteps: readonly string[];
  status: "open" | "released" | "cancelled";
  /** Whether this person may tick this division's steps. */
  canTick: boolean;
  /**
   * A deletion is waiting for the owner. The stage cannot change and the
   * project cannot be released or cancelled until it is answered; the
   * database refuses all of it, this only stops offering it.
   */
  frozen?: boolean;
}) {
  const [state, act, pending] = useActionState<ProjectMoveState, FormData>(
    projectMoveAction,
    {},
  );

  const current = steps.find((step) => !doneSteps.includes(step)) ?? null;
  const lastDone =
    [...steps].reverse().find((step) => doneSteps.includes(step)) ?? null;
  const open = status === "open";
  // Steps can still be READ when frozen; they just cannot be changed.
  const editable = open && !frozen;

  return (
    <div className="space-y-4">
      {state.error ? (
        <Notice tone="attention" title="That did not go through">
          <p>{state.error}</p>
        </Notice>
      ) : null}

      <ol className="space-y-2">
        {steps.map((step, index) => {
          const done = doneSteps.includes(step);
          const isCurrent = step === current;
          return (
            <li
              key={step}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-control px-3 py-2 ring-1 ${
                isCurrent && editable
                  ? "bg-surface-sunken ring-accent/40"
                  : "ring-line/60"
              }`}
            >
              <span className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className={`flex size-6 items-center justify-center rounded-full text-xs ${
                    done ? "bg-success/15 text-success" : "bg-ink/5 text-muted"
                  }`}
                >
                  {done ? "✓" : index + 1}
                </span>
                <span className={done ? "text-muted" : "font-medium"}>
                  {PROJECT_STEP_LABELS[step] ?? step}
                </span>
                {done ? <span className="sr-only">done</span> : null}
              </span>

              {isCurrent && editable && canTick ? (
                <form action={act}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="move" value="step" />
                  <input type="hidden" name="step" value={step} />
                  <Button type="submit" disabled={pending} className="min-h-9">
                    Mark done
                  </Button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ol>

      {!canTick && editable ? (
        <p className="text-xs text-muted">
          <span aria-hidden="true">{"ℹ"} </span>
          Steps for this division are ticked by whoever has its permission.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {editable && canTick && lastDone ? (
          <form action={act}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="move" value="undo" />
            <Button type="submit" variant="quiet" disabled={pending}>
              Take back {PROJECT_STEP_LABELS[lastDone] ?? lastDone}
            </Button>
          </form>
        ) : null}

        {editable && current === null ? (
          <form action={act}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="move" value="release" />
            <Button type="submit" disabled={pending}>
              Mark released to the customer
            </Button>
          </form>
        ) : null}
      </div>

      {frozen ? (
        <p className="text-xs text-muted">
          <span aria-hidden="true">{"⚠"} </span>
          Steps, release and cancelling are switched off while the deletion
          waits for the owner.
        </p>
      ) : null}

      {editable ? (
        <Disclosure label="Cancel this project">
          <form action={act} className="max-w-md space-y-3">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="move" value="cancel" />
            <Notice
              tone="attention"
              title="Money already taken stays in the books"
            >
              <p>
                Cancelling does not refund anything. If money is handed back,
                the owner or an admin voids that sale on the Sales screen and
                the balance follows.
              </p>
            </Notice>
            <Field label="Why is it being cancelled?">
              <Input name="reason" />
            </Field>
            <Button type="submit" variant="danger" disabled={pending}>
              Cancel project
            </Button>
          </form>
        </Disclosure>
      ) : null}
    </div>
  );
}
