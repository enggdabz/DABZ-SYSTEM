"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice, Select, Tag } from "@/components/ui";
import { MONEY_SOURCES, MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { centavosToDecimalString, formatPesos } from "@/lib/money";
import { DAY_TYPE_LABELS, formatHours, type DayType } from "@/lib/payroll";

import {
  markPayrollPaidAction,
  saveWeekAction,
  unlockWeekAction,
  type PayrollActionState,
} from "./actions";

export interface DayRow {
  iso: string;
  weekdayLabel: string;
  dayLabel: string;
  timeInLabel: string | null;
  timeOutLabel: string | null;
  hoursWorked: number | null;
  late: boolean;
  forgotTimeOut: boolean;
  dayType: DayType;
  suggestedDayType: DayType;
  hasStoredChoice: boolean;
  overtimeHours: number;
  overtimePayCentavos: number;
}

/**
 * The week's table of days (spec 13.3).
 *
 * Two things on each row are the OWNER'S choice, not the system's: whether the
 * day was full, half or absent, and whether any overtime is paid. The system
 * shows what it would guess, and says so, but never decides.
 */
export function WeekForm({
  staffId,
  weekStartISO,
  dailyRateCentavos,
  days,
  bonusCentavos,
  advanceDeductionCentavos,
  outstandingAdvanceCentavos,
  locked,
}: {
  staffId: string;
  weekStartISO: string;
  dailyRateCentavos: number;
  days: DayRow[];
  bonusCentavos: number;
  advanceDeductionCentavos: number;
  outstandingAdvanceCentavos: number;
  locked: boolean;
}) {
  const [state, submit, pending] = useActionState<PayrollActionState, FormData>(
    saveWeekAction,
    {},
  );
  const [types, setTypes] = useState<Record<string, DayType>>(
    Object.fromEntries(days.map((day) => [day.iso, day.dayType])),
  );

  const halfDayPay = Math.round(dailyRateCentavos / 2);

  // Shown live as the owner changes the choices, so they can see the effect
  // before saving. The server recomputes it authoritatively on save.
  const previewDayPay = days.reduce((total, day) => {
    const type = types[day.iso] ?? day.dayType;
    if (type === "full") return total + dailyRateCentavos;
    if (type === "half") return total + halfDayPay;
    return total;
  }, 0);

  return (
    <form action={submit} className="space-y-6">
      <input type="hidden" name="staffId" value={staffId} />
      <input type="hidden" name="weekStart" value={weekStartISO} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="pb-2 pr-3 font-medium">Day</th>
              <th className="pb-2 pr-3 font-medium">In / out</th>
              <th className="pb-2 pr-3 font-medium">Hours</th>
              <th className="pb-2 pr-3 font-medium">Counts as</th>
              <th className="pb-2 pr-3 font-medium">Day pay</th>
              <th className="pb-2 pr-3 font-medium">OT hours</th>
              <th className="pb-2 font-medium">OT pay</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const type = types[day.iso] ?? day.dayType;
              const pay =
                type === "full"
                  ? dailyRateCentavos
                  : type === "half"
                    ? halfDayPay
                    : 0;

              return (
                <tr key={day.iso} className="border-b border-line/50">
                  <td className="py-3 pr-3">
                    <span className="font-medium">{day.weekdayLabel}</span>
                    <span className="block text-xs text-muted">{day.dayLabel}</span>
                  </td>

                  <td className="py-3 pr-3 text-muted">
                    {day.timeInLabel ?? "—"}
                    {day.timeInLabel ? ` – ${day.timeOutLabel ?? "?"}` : ""}
                    <span className="mt-1 flex flex-wrap gap-1">
                      {day.late ? <Tag tone="attention">{"⚠"} Late</Tag> : null}
                      {day.forgotTimeOut ? (
                        <Tag tone="attention">{"⚠"} No time out</Tag>
                      ) : null}
                    </span>
                  </td>

                  <td className="py-3 pr-3">{formatHours(day.hoursWorked)}</td>

                  <td className="py-3 pr-3">
                    <Select
                      name={`dayType:${day.iso}`}
                      value={type}
                      disabled={locked}
                      onChange={(event) =>
                        setTypes((current) => ({
                          ...current,
                          [day.iso]: event.target.value as DayType,
                        }))
                      }
                      className="min-w-28"
                    >
                      {(["full", "half", "absent"] as const).map((option) => (
                        <option key={option} value={option}>
                          {DAY_TYPE_LABELS[option]}
                        </option>
                      ))}
                    </Select>
                    {!day.hasStoredChoice && day.suggestedDayType === type ? (
                      <span className="mt-1 block text-[11px] text-muted">
                        Suggested from the time clock
                      </span>
                    ) : null}
                  </td>

                  <td className="py-3 pr-3 font-medium">{formatPesos(pay)}</td>

                  <td className="py-3 pr-3">
                    <Input
                      name={`otHours:${day.iso}`}
                      type="number"
                      step="0.25"
                      min="0"
                      defaultValue={day.overtimeHours}
                      disabled={locked}
                      className="w-20"
                    />
                  </td>

                  <td className="py-3">
                    <Input
                      name={`otPay:${day.iso}`}
                      inputMode="decimal"
                      defaultValue={
                        day.overtimePayCentavos
                          ? centavosToDecimalString(day.overtimePayCentavos)
                          : ""
                      }
                      disabled={locked}
                      placeholder="0"
                      className="w-24"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Leave OT pay blank to record the hours without paying them &mdash; that
        is a choice you make each day, not a missing value. A half day pays{" "}
        {formatPesos(halfDayPay)}, half of the {formatPesos(dailyRateCentavos)}{" "}
        daily rate.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Bonus" hint="Optional extra for the week." error={state.fieldErrors?.bonus}>
          <Input
            name="bonus"
            inputMode="decimal"
            defaultValue={bonusCentavos ? centavosToDecimalString(bonusCentavos) : ""}
            disabled={locked}
            placeholder="0"
          />
        </Field>

        <Field
          label="Take off a cash advance"
          hint={
            outstandingAdvanceCentavos > 0
              ? `They owe ${formatPesos(outstandingAdvanceCentavos)}. Leave blank to take nothing this week.`
              : "Nothing owed."
          }
          error={state.fieldErrors?.advanceDeduction}
        >
          <Input
            name="advanceDeduction"
            inputMode="decimal"
            defaultValue={
              advanceDeductionCentavos
                ? centavosToDecimalString(advanceDeductionCentavos)
                : ""
            }
            disabled={locked || outstandingAdvanceCentavos === 0}
            placeholder="0"
          />
        </Field>
      </div>

      <div className="rounded-control bg-surface-sunken p-4 ring-1 ring-line/60">
        <p className="text-xs font-medium text-muted">Day pay as chosen above</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">
          {formatPesos(previewDayPay)}
        </p>
        <p className="mt-1 text-xs text-muted">
          Overtime and any bonus are added when you save.
        </p>
      </div>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      {!locked ? (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save this week"}
        </Button>
      ) : null}
    </form>
  );
}

export function MarkPaidForm({
  weekId,
  netCentavos,
  today,
}: {
  weekId: string;
  netCentavos: number;
  today: string;
}) {
  const [state, submit, pending] = useActionState<PayrollActionState, FormData>(
    markPayrollPaidAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" onClick={() => setOpen(true)} disabled={netCentavos <= 0}>
          Mark {formatPesos(netCentavos)} paid
        </Button>
        {netCentavos <= 0 ? (
          <p className="text-xs text-muted">
            Nothing to pay for this week yet. Save the days first.
          </p>
        ) : null}
        {state.error ? <Notice tone="attention" title={state.error} /> : null}
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="weekId" value={weekId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date paid">
          <Input name="paidOn" type="date" defaultValue={today} required />
        </Field>
        <Field label="Paid from">
          <Select name="source" defaultValue="cash_drawer">
            {MONEY_SOURCES.map((source) => (
              <option key={source} value={source}>
                {MONEY_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <p className="text-sm text-muted">
        This records {formatPesos(netCentavos)} leaving the shop, takes any cash
        advance off what they owe, and locks the week.
      </p>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Confirm paid"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function UnlockWeekForm({ weekId }: { weekId: string }) {
  const [state, submit, pending] = useActionState<PayrollActionState, FormData>(
    unlockWeekAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="quiet" onClick={() => setOpen(true)}>
          Unlock this week
        </Button>
        {state.success ? <Notice tone="success" title={state.success} /> : null}
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="weekId" value={weekId} />
      <Field
        label="Why is this being unlocked?"
        hint="Kept on the record. The wages entry is voided rather than erased."
        error={state.fieldErrors?.reason}
      >
        <Input name="reason" required autoFocus placeholder="e.g. overtime was missed" />
      </Field>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Unlocking…" : "Unlock"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
