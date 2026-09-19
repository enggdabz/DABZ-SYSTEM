"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { centavosToDecimalString } from "@/lib/money";
import { UNIT_KINDS, UNIT_KIND_LABELS, type UnitKind } from "@/lib/repairs";

import { saveServiceAction, type RepairState } from "../actions";

export function ServiceForm({
  service,
}: {
  service?: {
    id: string;
    name: string;
    unitKind: UnitKind | "any";
    priceCentavos: number | null;
    incomeCategory: string;
    isCheckingFee: boolean;
    active: boolean;
    note: string | null;
  };
}) {
  const [state, submit, pending] = useActionState<RepairState, FormData>(
    saveServiceAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {service ? "Edit" : "Add a service"}
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}

      <Field label="Name" error={state.fieldErrors?.name}>
        <Input name="name" defaultValue={service?.name ?? ""} required />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Applies to"
          hint="Pick one machine to price it differently, or Any to charge the same."
          error={state.fieldErrors?.unitKind}
        >
          <Select name="unitKind" defaultValue={service?.unitKind ?? "any"}>
            <option value="any">Any machine</option>
            {UNIT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {UNIT_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Price"
          hint="Leave empty until you decide. Tickets still work — the price is asked for."
          error={state.fieldErrors?.price}
        >
          <Input
            name="price"
            inputMode="decimal"
            placeholder="e.g. 500"
            defaultValue={
              service?.priceCentavos != null
                ? centavosToDecimalString(service.priceCentavos)
                : ""
            }
          />
        </Field>
      </div>

      <Field
        label="Counts as"
        hint="Only used when it applies to any machine — otherwise the machine decides."
      >
        <Select
          name="incomeCategory"
          defaultValue={service?.incomeCategory ?? "laptop_repair"}
        >
          <option value="checking_fee">Checking / diagnostic fee</option>
          <option value="epson_printer_repair">Epson printer repair</option>
          <option value="laptop_repair">Laptop repair</option>
          <option value="desktop_repair">Desktop repair</option>
          <option value="parts_sold">Parts sold</option>
        </Select>
      </Field>

      <Field label="Note">
        <Input name="note" defaultValue={service?.note ?? ""} />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={service?.active ?? true}
          className="size-4 rounded border-line"
        />
        <span>Offer this</span>
      </label>

      {/*
        Only one service can carry this. It is what makes the charge appear on
        a ticket even when the customer decides not to go ahead, and what keeps
        it in its own line of the totals.
      */}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="isCheckingFee"
          defaultChecked={service?.isCheckingFee ?? false}
          className="mt-0.5 size-4 rounded border-line"
        />
        <span>
          This is the checking fee
          <span className="block text-xs text-muted">
            Charged even when the customer says no to the repair. Only one
            service can be it.
          </span>
        </span>
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
