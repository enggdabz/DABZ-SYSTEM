"use client";

import { useActionState } from "react";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { centavosToDecimalString } from "@/lib/money";
import {
  RECEIPT_PAPERS,
  RECEIPT_PAPER_LABELS,
  type AppSettings,
} from "@/lib/settings";

import { saveSettingsAction, type SettingsFormState } from "./actions";

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [state, submit, pending] = useActionState<SettingsFormState, FormData>(
    saveSettingsAction,
    {},
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={submit} className="space-y-10">
      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Work schedule</h2>
          <p className="mt-1 text-sm text-muted">
            Used to flag late arrivals and overtime from Phase 3, and to work out
            the daily target from Phase 2.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Working days a month"
            hint="The daily target divides the monthly bills and payroll by this."
            error={errors.workingDaysPerMonth}
          >
            <Input
              name="workingDaysPerMonth"
              type="number"
              min={1}
              max={31}
              defaultValue={settings.workingDaysPerMonth}
              required
            />
          </Field>

          <Field
            label="The week starts on"
            hint="Payroll weeks are counted from this day."
            error={errors.weekStartsOn}
          >
            <Select name="weekStartsOn" defaultValue={settings.weekStartsOn}>
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </Select>
          </Field>

          <Field label="Shop opens at" error={errors.workDayStart}>
            <Input
              name="workDayStart"
              type="time"
              defaultValue={settings.workDayStart}
              required
            />
          </Field>

          <Field label="Shop closes at" error={errors.workDayEnd}>
            <Input
              name="workDayEnd"
              type="time"
              defaultValue={settings.workDayEnd}
              required
            />
          </Field>
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Staff limits</h2>
          <p className="mt-1 text-sm text-muted">
            Above these, a staff member needs your approval. Both discount
            limits apply at once, so whichever is reached first wins.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Expense limit needing approval"
            hint="In pesos. An expense above this is flagged for you."
            error={errors.staffExpenseApprovalLimitPesos}
          >
            <Input
              name="staffExpenseApprovalLimitPesos"
              inputMode="decimal"
              defaultValue={centavosToDecimalString(
                settings.staffExpenseApprovalLimitCentavos,
              )}
              required
            />
          </Field>

          <Field
            label="Discount limit (percent)"
            hint="The largest percentage a staff member may give unaided."
            error={errors.staffDiscountLimitPercent}
          >
            <Input
              name="staffDiscountLimitPercent"
              inputMode="decimal"
              defaultValue={settings.staffDiscountLimitPercent}
              required
            />
          </Field>

          <Field
            label="Discount limit (pesos)"
            hint="The largest peso discount a staff member may give unaided."
            error={errors.staffDiscountLimitPesos}
          >
            <Input
              name="staffDiscountLimitPesos"
              inputMode="decimal"
              defaultValue={centavosToDecimalString(
                settings.staffDiscountLimitCentavos,
              )}
              required
            />
          </Field>

          <Field
            label="Sign out after this many idle minutes"
            hint="For the shared counter computer."
            error={errors.autoLogoutMinutes}
          >
            <Input
              name="autoLogoutMinutes"
              type="number"
              min={1}
              max={480}
              defaultValue={settings.autoLogoutMinutes}
              required
            />
          </Field>
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Receipts</h2>
          <p className="mt-1 text-sm text-muted">
            Which paper the counter prints receipts on. Change this if you get a
            different printer.
          </p>
        </div>

        <Field label="Receipt paper" error={errors.receiptPaper}>
          <Select name="receiptPaper" defaultValue={settings.receiptPaper}>
            {RECEIPT_PAPERS.map((paper) => (
              <option key={paper} value={paper}>
                {RECEIPT_PAPER_LABELS[paper]}
              </option>
            ))}
          </Select>
        </Field>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">DabzTech repairs</h2>
          <p className="mt-1 text-sm text-muted">
            Set now, used from Phase 7. Confirm these against how you actually
            work (open decision 17.11).
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Warranty period (days)"
            hint="Printed on the receipt when a repair is released."
            error={errors.defaultWarrantyDays}
          >
            <Input
              name="defaultWarrantyDays"
              type="number"
              min={0}
              defaultValue={settings.defaultWarrantyDays}
              required
            />
          </Field>

          <Field
            label="Flag unclaimed units after (days)"
            error={errors.unclaimedUnitDays}
          >
            <Input
              name="unclaimedUnitDays"
              type="number"
              min={0}
              defaultValue={settings.unclaimedUnitDays}
              required
            />
          </Field>
        </div>
      </section>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
