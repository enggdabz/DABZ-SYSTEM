"use client";

import { useActionState } from "react";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { useFormPanel } from "@/components/use-form-panel";
import { DIVISION_LIST } from "@/lib/divisions";
import { MONEY_SOURCES, MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { centavosToDecimalString } from "@/lib/money";

import {
  giveCashAdvanceAction,
  linkAccountAction,
  saveStaffAction,
  setStaffStatusAction,
  type StaffFormState,
} from "./actions";

export interface StaffFormValues {
  id: string;
  fullName: string;
  position: string | null;
  contactNumber: string | null;
  address: string | null
  emergencyContactName: string | null;
  emergencyContactNumber: string | null;
  startDate: string | null;
  dailyRateCentavos: number | null;
  divisions: string[];
  note: string | null;
}

export function StaffForm({ member }: { member?: StaffFormValues }) {
  const [state, submit, pending] = useActionState<StaffFormState, FormData>(
    saveStaffAction,
    {},
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={submit} className="space-y-5">
      {member ? <input type="hidden" name="staffId" value={member.id} /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" error={errors.fullName}>
          <Input name="fullName" defaultValue={member?.fullName ?? ""} required />
        </Field>

        <Field label="Position" hint="Optional.">
          <Input
            name="position"
            defaultValue={member?.position ?? ""}
            placeholder="e.g. Printer operator"
          />
        </Field>

        <Field
          label="Daily rate"
          hint="What they are paid for a full day. A half day pays half of this."
          error={errors.dailyRate}
        >
          <Input
            name="dailyRate"
            inputMode="decimal"
            defaultValue={
              member?.dailyRateCentavos
                ? centavosToDecimalString(member.dailyRateCentavos)
                : ""
            }
            placeholder="e.g. 500"
          />
        </Field>

        <Field label="Started on" error={errors.startDate}>
          <Input name="startDate" type="date" defaultValue={member?.startDate ?? ""} />
        </Field>

        <Field label="Contact number" hint="Optional.">
          <Input name="contactNumber" defaultValue={member?.contactNumber ?? ""} />
        </Field>

        <Field label="Address" hint="Optional. Only you and admins can see this.">
          <Input name="address" defaultValue={member?.address ?? ""} />
        </Field>

        <Field label="Emergency contact name" hint="Optional.">
          <Input
            name="emergencyContactName"
            defaultValue={member?.emergencyContactName ?? ""}
          />
        </Field>

        <Field label="Emergency contact number" hint="Optional.">
          <Input
            name="emergencyContactNumber"
            defaultValue={member?.emergencyContactNumber ?? ""}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Works in</legend>
        <div className="mt-2 space-y-2">
          {DIVISION_LIST.map((division) => (
            <label key={division.id} className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name="divisions"
                value={division.id}
                defaultChecked={member?.divisions.includes(division.id)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {division.name}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Note" hint="Optional.">
        <Input name="note" defaultValue={member?.note ?? ""} />
      </Field>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : member ? "Save changes" : "Add staff member"}
      </Button>
    </form>
  );
}

export function StaffStatusForm({
  staffId,
  fullName,
  active,
}: {
  staffId: string;
  fullName: string;
  active: boolean;
}) {
  const [state, submit, pending] = useActionState<StaffFormState, FormData>(
    setStaffStatusAction,
    {},
  );

  return (
    <div className="space-y-2">
      <form action={submit}>
        <input type="hidden" name="staffId" value={staffId} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <Button type="submit" variant={active ? "danger" : "secondary"} disabled={pending}>
          {pending ? "Saving…" : active ? `Deactivate ${fullName}` : `Reactivate ${fullName}`}
        </Button>
      </form>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}
      <p className="text-xs text-muted">
        Deactivating keeps every record. They simply stop appearing on the time
        clock and in payroll.
      </p>
    </div>
  );
}

export function LinkAccountForm({
  staffId,
  currentProfileId,
  accounts,
}: {
  staffId: string;
  currentProfileId: string | null;
  accounts: { id: string; label: string }[];
}) {
  const [state, submit, pending] = useActionState<StaffFormState, FormData>(
    linkAccountAction,
    {},
  );

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="staffId" value={staffId} />
      <Field
        label="Login account"
        hint="Needed for the time clock, because each person clocks only themselves in. It also lets them see their own attendance and payslips. Without one, you record their days for them."
      >
        <Select name="profileId" defaultValue={currentProfileId ?? ""}>
          <option value="">No login</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label}
            </option>
          ))}
        </Select>
      </Field>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save login link"}
      </Button>
    </form>
  );
}

export function CashAdvanceForm({
  staffId,
  fullName,
  today,
}: {
  staffId: string;
  fullName: string;
  today: string;
}) {
  const [state, submit, pending] = useActionState<StaffFormState, FormData>(
    giveCashAdvanceAction,
    {},
  );
  const { open, answer, openPanel, closePanel } = useFormPanel(state);
  const errors = answer.fieldErrors ?? {};

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="secondary" onClick={openPanel}>
          Give a cash advance
        </Button>
        {answer.success ? <Notice tone="success" title={answer.success} /> : null}
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="staffId" value={staffId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" error={errors.amount}>
          <Input name="amount" inputMode="decimal" required autoFocus placeholder="e.g. 500" />
        </Field>

        <Field label="Date given" error={errors.advancedOn}>
          <Input name="advancedOn" type="date" defaultValue={today} required />
        </Field>

        <Field label="Paid from" error={errors.source}>
          <Select name="source" defaultValue="cash_drawer">
            {MONEY_SOURCES.map((source) => (
              <option key={source} value={source}>
                {MONEY_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="How it will be paid back"
          hint="You still choose the exact amount on payday."
          error={errors.deductionPlan}
        >
          <Select name="deductionPlan" defaultValue="decide_on_payday">
            <option value="decide_on_payday">Decide on payday</option>
            <option value="next_payday">Deduct on the next payday</option>
            <option value="in_parts">Deduct in parts</option>
          </Select>
        </Field>
      </div>

      <Field label="Reason" hint="Optional.">
        <Input name="reason" placeholder="e.g. medicine" />
      </Field>

      {answer.error ? <Notice tone="attention" title={answer.error} /> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Recording…" : `Record advance to ${fullName}`}
        </Button>
        <Button type="button" variant="quiet" onClick={closePanel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
