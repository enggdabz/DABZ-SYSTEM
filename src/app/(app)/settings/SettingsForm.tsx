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
            hint="For the shared counter computer. Owner and admin accounts always follow this."
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

        {/*
          Below the grid rather than in it: it qualifies the idle minutes just
          above, and a sentence this long wraps badly in half a column.
        */}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="staffStaySignedIn"
            defaultChecked={settings.staffStaySignedIn}
            className="mt-0.5 size-4 shrink-0 rounded border-line"
          />
          <span>
            Keep staff accounts signed in until they sign out
            <span className="mt-1 block text-xs text-muted">
              When ticked, the idle minutes above apply to owner and admin
              accounts only. Staff should still use Switch user or Sign out
              when they leave the counter.
            </span>
          </span>
        </label>
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
          <h2 className="text-lg font-semibold tracking-tight">
            Your public page
          </h2>
          <p className="mt-1 text-sm text-muted">
            What customers see at the front of this site. Everything here starts
            empty and the page simply leaves out whatever you have not filled in
            &mdash; it will never print a made-up address to somebody who might
            drive there.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="publicPageEnabled"
            defaultChecked={settings.publicPageEnabled}
            className="size-4 rounded border-line"
          />
          <span>Show the public page</span>
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Address" hint="Where customers should come.">
            <Input
              name="shopAddress"
              defaultValue={settings.shopAddress ?? ""}
              placeholder="e.g. Rizal Avenue, San Carlos City, Pangasinan"
            />
          </Field>

          <Field label="Phone number">
            <Input
              name="shopPhone"
              inputMode="tel"
              defaultValue={settings.shopPhone ?? ""}
              placeholder="e.g. 0917 555 0000"
            />
          </Field>

          <Field label="Email" hint="Optional.">
            <Input
              name="shopEmail"
              type="email"
              defaultValue={settings.shopEmail ?? ""}
            />
          </Field>

          <Field
            label="Opening hours, in your own words"
            hint="Free text, so half-days and holidays can be said properly."
          >
            <Input
              name="publicOpeningHours"
              defaultValue={settings.publicOpeningHours ?? ""}
              placeholder="e.g. Mon-Sat 8am-6pm, closed Sunday"
            />
          </Field>

          <Field label="Facebook page" hint="The full link to your page.">
            <Input
              name="facebookPageUrl"
              defaultValue={settings.facebookPageUrl ?? ""}
              placeholder="https://facebook.com/..."
            />
          </Field>

          <Field
            label="Messenger name"
            hint="The part after m.me/. Adds a Message us button — no Facebook app needed."
          >
            <Input
              name="messengerUsername"
              defaultValue={settings.messengerUsername ?? ""}
              placeholder="e.g. dabzprintshoppe"
            />
          </Field>
        </div>

        <Field
          label="Map link"
          hint="Optional. Paste a Google Maps link and the page adds a Get directions button."
        >
          <Input name="mapUrl" defaultValue={settings.mapUrl ?? ""} />
        </Field>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Dabz Apparel</h2>
          <p className="mt-1 text-sm text-muted">
            How much of a job order you ask for up front. Leaving this empty is
            a real answer: the order screen then asks for whatever the customer
            actually hands over, and never says a payment is short.
          </p>
        </div>

        <Field
          label="Down payment asked for (%)"
          hint="Leave empty for no policy. Enter 50 to ask for half."
          error={errors.apparelDownPaymentPercent}
        >
          <Input
            name="apparelDownPaymentPercent"
            inputMode="decimal"
            placeholder="e.g. 50"
            defaultValue={
              settings.apparelDownPaymentPercent === null
                ? ""
                : String(settings.apparelDownPaymentPercent)
            }
          />
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

      {state.error ? (
        <Notice tone="attention" title={state.error}>
          {state.errorDetail}
        </Notice>
      ) : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
