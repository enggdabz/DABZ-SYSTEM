"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { MONEY_SOURCES, MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { centavosToDecimalString } from "@/lib/money";

import {
  markBillPaidAction,
  saveBillAction,
  setBillActiveAction,
  setDueDayAction,
  undoBillPaymentAction,
  type BillActionState,
} from "./actions";

export function MarkPaidForm({
  billId,
  billName,
  period,
  amountCentavos,
}: {
  billId: string;
  billName: string;
  period: string;
  amountCentavos: number;
}) {
  const [state, submit, pending] = useActionState<BillActionState, FormData>(
    markBillPaidAction,
    {},
  );
  // Most bills are paid for exactly their usual amount, so the form starts
  // filled in and only needs changing when the amount differs.
  const [open, setOpen] = useState(false);

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
      <input type="hidden" name="billId" value={billId} />
      <input type="hidden" name="period" value={period} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount paid" error={state.fieldErrors?.amount}>
          <Input
            name="amount"
            inputMode="decimal"
            defaultValue={centavosToDecimalString(amountCentavos)}
            required
          />
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

      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : `Confirm ${billName} paid`}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function UndoPaymentForm({
  billId,
  period,
}: {
  billId: string;
  period: string;
}) {
  const [state, submit, pending] = useActionState<BillActionState, FormData>(
    undoBillPaymentAction,
    {},
  );

  return (
    <div className="space-y-2">
      <form action={submit}>
        <input type="hidden" name="billId" value={billId} />
        <input type="hidden" name="period" value={period} />
        <Button type="submit" variant="quiet" disabled={pending}>
          {pending ? "Undoing…" : "Undo"}
        </Button>
      </form>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
    </div>
  );
}

export function DueDayForm({
  billId,
  dueDay,
}: {
  billId: string;
  dueDay: number | null;
}) {
  const [state, submit, pending] = useActionState<BillActionState, FormData>(
    setDueDayAction,
    {},
  );

  return (
    <form action={submit} className="space-y-2">
      <input type="hidden" name="billId" value={billId} />
      <div className="flex items-end gap-2">
        <div className="w-28">
          <Field label="Due day" error={state.fieldErrors?.dueDay}>
            <Input
              name="dueDay"
              type="number"
              min={1}
              max={31}
              defaultValue={dueDay ?? ""}
              placeholder="1-31"
            />
          </Field>
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}
    </form>
  );
}

export function BillEditForm({
  bill,
}: {
  bill?: {
    id: string;
    name: string;
    amountCentavos: number;
    dueDay: number | null;
    type: "operating" | "loan_installment";
  };
}) {
  const [state, submit, pending] = useActionState<BillActionState, FormData>(
    saveBillAction,
    {},
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={submit} className="space-y-5">
      {bill ? <input type="hidden" name="billId" value={bill.id} /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" error={errors.name}>
          <Input name="name" defaultValue={bill?.name ?? ""} required placeholder="e.g. Internet" />
        </Field>

        <Field label="Amount a month" error={errors.amount}>
          <Input
            name="amount"
            inputMode="decimal"
            defaultValue={bill ? centavosToDecimalString(bill.amountCentavos) : ""}
            required
            placeholder="e.g. 2100"
          />
        </Field>

        <Field
          label="Due day of the month"
          hint="Leave blank if you are not sure yet."
          error={errors.dueDay}
        >
          <Input
            name="dueDay"
            type="number"
            min={1}
            max={31}
            defaultValue={bill?.dueDay ?? ""}
            placeholder="1-31"
          />
        </Field>

        <Field
          label="Kind of bill"
          hint="A loan installment can be linked to a loan, so paying it also pays down the balance."
          error={errors.type}
        >
          <Select name="type" defaultValue={bill?.type ?? "operating"}>
            <option value="operating">Operating cost</option>
            <option value="loan_installment">Loan installment</option>
          </Select>
        </Field>
      </div>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : bill ? "Save changes" : "Add bill"}
      </Button>
    </form>
  );
}

export function BillActiveForm({
  billId,
  billName,
  active,
}: {
  billId: string;
  billName: string;
  active: boolean;
}) {
  const [state, submit, pending] = useActionState<BillActionState, FormData>(
    setBillActiveAction,
    {},
  );

  return (
    <div className="space-y-2">
      <form action={submit}>
        <input type="hidden" name="billId" value={billId} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <Button type="submit" variant={active ? "danger" : "secondary"} disabled={pending}>
          {pending
            ? "Saving…"
            : active
              ? `Stop counting ${billName}`
              : `Count ${billName} again`}
        </Button>
      </form>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}
    </div>
  );
}
