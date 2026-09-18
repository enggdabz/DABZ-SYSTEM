"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { DIVISION_LIST } from "@/lib/divisions";
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  MONEY_SOURCES,
  MONEY_SOURCE_LABELS,
  NON_INCOME_CATEGORIES,
} from "@/lib/ledger";

import {
  addLedgerEntryAction,
  voidLedgerEntryAction,
  type LedgerActionState,
} from "./actions";

export function AddEntryForm({
  today,
  canRecordOwnerWithdrawal,
}: {
  today: string;
  canRecordOwnerWithdrawal: boolean;
}) {
  const [state, submit, pending] = useActionState<LedgerActionState, FormData>(
    addLedgerEntryAction,
    {},
  );
  // The category list depends on the direction, so it has to be reactive.
  const [direction, setDirection] = useState<"in" | "out">("in");
  const errors = state.fieldErrors ?? {};

  const categories = (direction === "in" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).filter(
    (category) => canRecordOwnerWithdrawal || category !== "owner_withdrawal",
  );

  return (
    <form action={submit} className="space-y-5">
      <Field label="Did money come in or go out?">
        <Select
          name="direction"
          value={direction}
          onChange={(event) => setDirection(event.target.value === "out" ? "out" : "in")}
        >
          <option value="in">Money in</option>
          <option value="out">Money out</option>
        </Select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Amount" error={errors.amount}>
          <Input name="amount" inputMode="decimal" required placeholder="e.g. 500" />
        </Field>

        <Field label="Date" error={errors.occurredOn}>
          <Input name="occurredOn" type="date" defaultValue={today} required />
        </Field>

        <Field
          label="What kind"
          hint={
            direction === "in"
              ? "Borrowed money and your own capital are listed here, but they are never counted as sales."
              : "An owner withdrawal is kept apart from the shop's costs."
          }
          error={errors.category}
        >
          <Select name="category" required>
            {categories.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
                {NON_INCOME_CATEGORIES.includes(category as never) ? " - not income" : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Which division" error={errors.tag}>
          <Select name="tag" defaultValue="whole_shop" required>
            {DIVISION_LIST.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
            <option value="whole_shop">Whole shop</option>
          </Select>
        </Field>

        <Field
          label={direction === "in" ? "Money went to" : "Paid from"}
          error={errors.source}
        >
          <Select name="source" defaultValue="cash_drawer" required>
            {MONEY_SOURCES.map((source) => (
              <option key={source} value={source}>
                {MONEY_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Note" hint="Optional.">
          <Input name="note" placeholder="e.g. capital for the new printer" />
        </Field>
      </div>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add entry"}
      </Button>
    </form>
  );
}

export function VoidEntryForm({ entryId }: { entryId: string }) {
  const [state, submit, pending] = useActionState<LedgerActionState, FormData>(
    voidLedgerEntryAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="quiet" onClick={() => setOpen(true)}>
          Void
        </Button>
        {state.error ? <Notice tone="attention" title={state.error} /> : null}
        {state.success ? <Notice tone="success" title={state.success} /> : null}
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="entryId" value={entryId} />
      <Field
        label="Why is this being voided?"
        hint="Kept with the entry, so the trail makes sense a year from now."
        error={state.fieldErrors?.reason}
      >
        <Input name="reason" required autoFocus placeholder="e.g. entered twice by mistake" />
      </Field>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Voiding…" : "Void this entry"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
