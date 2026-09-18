"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import type { Payable, Supplier } from "@/lib/expenses";
import { MONEY_SOURCES, MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { centavosToDecimalString } from "@/lib/money";

import { payPayableAction, savePayableAction, type PayableState } from "./actions";

export function PayForm({
  payableId,
  amountLabel,
  today,
}: {
  payableId: string;
  amountLabel: string;
  today: string;
}) {
  const [state, submit, pending] = useActionState<PayableState, FormData>(
    payPayableAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (state.success) return <Notice tone="success" title={state.success} />;

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" onClick={() => setOpen(true)}>
          Mark paid
        </Button>
        {state.error ? <Notice tone="attention" title={state.error} /> : null}
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="payableId" value={payableId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Paid on">
          <Input name="paidOn" type="date" defaultValue={today} />
        </Field>
        <Field label="Paid with" error={state.fieldErrors?.source}>
          <Select name="source" defaultValue="cash_drawer">
            {MONEY_SOURCES.map((source) => (
              <option key={source} value={source}>
                {MONEY_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : `Pay ${amountLabel}`}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function PayableForm({
  payable,
  suppliers,
  today,
}: {
  payable?: Payable;
  suppliers: Supplier[];
  today: string;
}) {
  const [state, submit, pending] = useActionState<PayableState, FormData>(
    savePayableAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {payable ? "Edit" : "Add something owed"}
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      {payable ? <input type="hidden" name="payableId" value={payable.id} /> : null}

      <Field label="What was received" error={state.fieldErrors?.description}>
        <Input
          name="description"
          defaultValue={payable?.description ?? ""}
          placeholder="e.g. 20 reams bond paper"
          required
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount owed" error={state.fieldErrors?.amount}>
          <Input
            name="amount"
            inputMode="decimal"
            defaultValue={
              payable ? centavosToDecimalString(payable.amountCentavos) : ""
            }
            required
          />
        </Field>

        <Field label="Supplier" hint="Optional.">
          <Select name="supplierId" defaultValue={payable?.supplierId ?? ""}>
            <option value="">Not recorded</option>
            {suppliers
              .filter((supplier) => supplier.active)
              .map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
          </Select>
        </Field>

        <Field label="Received on">
          <Input
            name="receivedOn"
            type="date"
            defaultValue={payable?.receivedOn ?? today}
          />
        </Field>

        <Field
          label="Due on"
          hint="Leave empty if the supplier did not give a date — nothing is assumed."
        >
          <Input name="dueOn" type="date" defaultValue={payable?.dueOn ?? ""} />
        </Field>
      </div>

      <Field label="Note">
        <Input name="note" defaultValue={payable?.note ?? ""} />
      </Field>

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
