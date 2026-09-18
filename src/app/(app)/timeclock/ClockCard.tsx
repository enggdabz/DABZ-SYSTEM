"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice, Tag } from "@/components/ui";

import {
  correctShiftAction,
  deleteShiftAction,
  timeInAction,
  timeOutAction,
  type ClockState,
} from "./actions";

/** Initials, for when there is no photo yet. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * One person's card on the time clock (spec 13.2).
 *
 * Tapping asks for confirmation first, because the shop's wages depend on
 * these two buttons and a mis-tap on a shared screen is easy.
 */
export function ClockCard({
  staffId,
  fullName,
  position,
  entryId,
  timeInLabel,
  timeOutLabel,
  isIn,
  isDone,
  onBehalf = false,
}: {
  staffId: string;
  fullName: string;
  position: string | null;
  entryId: string | null;
  timeInLabel: string | null;
  timeOutLabel: string | null;
  isIn: boolean;
  isDone: boolean;
  /** True when an Owner/Admin is recording for someone else, not clocking in. */
  onBehalf?: boolean;
}) {
  const [inState, submitIn, inPending] = useActionState<ClockState, FormData>(
    timeInAction,
    {},
  );
  const [outState, submitOut, outPending] = useActionState<ClockState, FormData>(
    timeOutAction,
    {},
  );
  const [confirming, setConfirming] = useState<"in" | "out" | null>(null);

  const error = inState.error ?? outState.error;

  return (
    <div className="rounded-card bg-surface p-5 shadow-sm ring-1 ring-line/60">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink/10 text-lg font-semibold"
        >
          {initials(fullName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold tracking-tight">{fullName}</p>
          {position ? (
            <p className="truncate text-xs text-muted">{position}</p>
          ) : null}
          <div className="mt-1.5">
            {isDone ? (
              <Tag>
                {timeInLabel} &ndash; {timeOutLabel}
              </Tag>
            ) : isIn ? (
              <Tag tone="success">In since {timeInLabel}</Tag>
            ) : (
              <Tag>Not in yet</Tag>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4">
        {isDone ? (
          <p className="text-sm text-muted">Shift finished for today.</p>
        ) : isIn && entryId ? (
          confirming === "out" ? (
            <form action={submitOut} className="space-y-2">
              <input type="hidden" name="entryId" value={entryId} />
              <p className="text-sm">
                {onBehalf
                  ? `Record ${fullName.split(" ")[0]} timing out now? This is logged as your correction.`
                  : `Time out now?`}
              </p>
              <div className="flex gap-2">
                <Button type="submit" disabled={outPending}>
                  {outPending ? "Saving…" : "Yes, time out"}
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => setConfirming("out")}
            >
              Time out
            </Button>
          )
        ) : confirming === "in" ? (
          <form action={submitIn} className="space-y-2">
            <input type="hidden" name="staffId" value={staffId} />
            <p className="text-sm">
              {onBehalf
                ? `Record ${fullName.split(" ")[0]} timing in now? This is logged as your correction.`
                : `Time in now?`}
            </p>
            <div className="flex gap-2">
              <Button type="submit" disabled={inPending}>
                {inPending ? "Saving…" : "Yes, time in"}
              </Button>
              <Button
                type="button"
                variant="quiet"
                onClick={() => setConfirming(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            className="w-full"
            onClick={() => setConfirming("in")}
          >
            {onBehalf ? `Record time in` : "Time in"}
          </Button>
        )}
      </div>

      {error ? (
        <div className="mt-3">
          <Notice tone="attention" title={error} />
        </div>
      ) : null}
    </div>
  );
}

/** Owner/Admin fixing a forgotten time-out (spec 13.2). */
export function CorrectShiftForm({
  entryId,
  workDate,
  timeIn,
  timeOut,
}: {
  entryId: string;
  workDate: string;
  timeIn: string;
  timeOut: string;
}) {
  const [state, submit, pending] = useActionState<ClockState, FormData>(
    correctShiftAction,
    {},
  );
  const [removeState, submitRemove, removePending] = useActionState<ClockState, FormData>(
    deleteShiftAction,
    {},
  );

  return (
    <div className="space-y-3">
      <form action={submit} className="space-y-3">
        <input type="hidden" name="entryId" value={entryId} />
        <input type="hidden" name="workDate" value={workDate} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Time in" hint="Manila time.">
            <Input name="timeIn" type="time" defaultValue={timeIn} />
          </Field>
          <Field label="Time out" hint="Leave blank if still unknown.">
            <Input name="timeOut" type="time" defaultValue={timeOut} />
          </Field>
        </div>
        {state.error ? <Notice tone="attention" title={state.error} /> : null}
        {state.success ? <Notice tone="success" title={state.success} /> : null}
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save correction"}
        </Button>
      </form>

      <form action={submitRemove}>
        <input type="hidden" name="entryId" value={entryId} />
        <Button type="submit" variant="danger" disabled={removePending}>
          {removePending ? "Removing…" : "Remove this shift"}
        </Button>
      </form>
      {removeState.error ? (
        <Notice tone="attention" title={removeState.error} />
      ) : null}
    </div>
  );
}
