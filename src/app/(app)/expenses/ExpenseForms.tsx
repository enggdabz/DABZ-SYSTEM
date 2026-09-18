"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { DIVISION_IDS, divisionName } from "@/lib/divisions";
import {
  QUICK_EXPENSE_CATEGORIES,
  expenseCategoryLabel,
  type ExpensePreset,
  type Supplier,
} from "@/lib/expenses";
import { centavosToDecimalString } from "@/lib/money";

import {
  decideExpenseAction,
  savePresetAction,
  saveSupplierAction,
  type ExpenseState,
} from "./actions";

const TAGS = [...DIVISION_IDS, "whole_shop"] as const;

/** Approve or refuse one waiting expense (spec 4.3). */
export function DecideExpenseForm({
  expenseId,
  amountLabel,
}: {
  expenseId: string;
  amountLabel: string;
}) {
  const [state, submit, pending] = useActionState<ExpenseState, FormData>(
    decideExpenseAction,
    {},
  );

  if (state.success) return <Notice tone="success" title={state.success} />;

  return (
    <form className="space-y-3">
      <input type="hidden" name="expenseId" value={expenseId} />
      <Field label="Note" hint="Optional. Why you decided this way.">
        <Input name="decisionNote" placeholder="e.g. agreed with supplier" />
      </Field>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          formAction={submit}
          name="decision"
          value="approve"
          disabled={pending}
        >
          {pending ? "Saving..." : `Approve ${amountLabel}`}
        </Button>
        <Button
          type="submit"
          formAction={submit}
          name="decision"
          value="reject"
          variant="danger"
          disabled={pending}
        >
          Refuse
        </Button>
      </div>
    </form>
  );
}

/** The owner's own list of quick-pick buttons (open decision 17.14). */
export function PresetForm({ preset }: { preset?: ExpensePreset }) {
  const [state, submit, pending] = useActionState<ExpenseState, FormData>(
    savePresetAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {preset ? "Edit" : "Add a quick pick"}
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      {preset ? <input type="hidden" name="presetId" value={preset.id} /> : null}

      <Field label="Button name" error={state.fieldErrors?.label}>
        <Input name="label" defaultValue={preset?.label ?? ""} required />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What for" error={state.fieldErrors?.category}>
          <Select
            name="category"
            defaultValue={preset?.category ?? "materials_supplies"}
          >
            {QUICK_EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {expenseCategoryLabel(category)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Which part of the shop" error={state.fieldErrors?.tag}>
          <Select name="tag" defaultValue={preset?.tag ?? "whole_shop"}>
            {TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {divisionName(tag)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Usual amount"
        hint="Leave empty to be asked every time. Only fill this in if it really is always the same."
        error={state.fieldErrors?.defaultAmount}
      >
        <Input
          name="defaultAmount"
          inputMode="decimal"
          placeholder="e.g. 480"
          defaultValue={
            preset?.defaultAmountCentavos != null
              ? centavosToDecimalString(preset.defaultAmountCentavos)
              : ""
          }
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={preset?.active ?? true}
          className="size-4 rounded border-line"
        />
        <span>Show this button</span>
      </label>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const [state, submit, pending] = useActionState<ExpenseState, FormData>(
    saveSupplierAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {supplier ? "Edit" : "Add a supplier"}
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      {supplier ? (
        <input type="hidden" name="supplierId" value={supplier.id} />
      ) : null}

      <Field label="Name" error={state.fieldErrors?.name}>
        <Input name="name" defaultValue={supplier?.name ?? ""} required />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contact number">
          <Input
            name="contactNumber"
            inputMode="tel"
            defaultValue={supplier?.contactNumber ?? ""}
          />
        </Field>
        <Field label="Address">
          <Input name="address" defaultValue={supplier?.address ?? ""} />
        </Field>
      </div>

      <Field label="Note">
        <Input name="note" defaultValue={supplier?.note ?? ""} />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={supplier?.active ?? true}
          className="size-4 rounded border-line"
        />
        <span>Still buying from them</span>
      </label>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
