"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { DIVISION_IDS, divisionName } from "@/lib/divisions";
import type { Supplier } from "@/lib/expenses";
import { MONEY_SOURCES, MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { centavosToDecimalString } from "@/lib/money";
import { quantityToDecimalString } from "@/lib/quantity";
import type { StockItem } from "@/lib/stocks";

import {
  countStockAction,
  receiveStockAction,
  saveStockItemAction,
  takeStockOutAction,
  type StockState,
} from "./actions";

const TAGS = [...DIVISION_IDS, "whole_shop"] as const;

type Mode = "in" | "out" | "count";

const MODE_LABELS: Record<Mode, string> = {
  in: "Received",
  out: "Took out",
  count: "Counted the shelf",
};

/**
 * The three things that happen to stock, behind one control.
 *
 * Kept together because a person standing at the shelf is doing one of these
 * three, and having to find three different buttons on three different cards
 * is how stock records stop being kept.
 */
export function StockMovementForms({
  item,
  suppliers,
  canReceive,
}: {
  item: StockItem;
  suppliers: Supplier[];
  canReceive: boolean;
}) {
  const [mode, setMode] = useState<Mode | null>(null);

  const [receiveState, receive, receivePending] = useActionState<StockState, FormData>(
    receiveStockAction,
    {},
  );
  const [outState, takeOut, outPending] = useActionState<StockState, FormData>(
    takeStockOutAction,
    {},
  );
  const [countState, count, countPending] = useActionState<StockState, FormData>(
    countStockAction,
    {},
  );

  const state =
    mode === "in" ? receiveState : mode === "out" ? outState : countState;

  if (mode === null) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {(canReceive ? (["in", "out", "count"] as Mode[]) : (["out", "count"] as Mode[])).map(
            (option) => (
              /*
                All three are `secondary`. Dabz red marks the ONE main action
                on a screen, and this control repeats once per material - four
                red buttons down a page stop meaning "this one".
              */
              <Button
                key={option}
                type="button"
                variant="secondary"
                onClick={() => setMode(option)}
              >
                {MODE_LABELS[option]}
              </Button>
            ),
          )}
        </div>
        {receiveState.success ? (
          <Notice tone="success" title={receiveState.success} />
        ) : null}
        {outState.success ? <Notice tone="success" title={outState.success} /> : null}
        {countState.success ? (
          <Notice tone="success" title={countState.success} />
        ) : null}
      </div>
    );
  }

  return (
    <form
      action={mode === "in" ? receive : mode === "out" ? takeOut : count}
      className="space-y-3 rounded-card bg-surface-sunken p-4 ring-1 ring-line/60"
    >
      <input type="hidden" name="itemId" value={item.id} />

      <p className="text-sm font-medium">{MODE_LABELS[mode]}</p>

      {mode === "count" ? (
        <Field
          label={`What is actually on the shelf (${item.unit})`}
          hint="Type what you see. The system works out the difference itself."
          error={state.fieldErrors?.counted}
        >
          <Input name="counted" inputMode="decimal" placeholder="e.g. 14" required autoFocus />
        </Field>
      ) : (
        <Field
          label={`How many ${item.unit}`}
          error={state.fieldErrors?.quantity}
        >
          <Input name="quantity" inputMode="decimal" placeholder="e.g. 20" required autoFocus />
        </Field>
      )}

      {mode === "in" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={`Price per ${item.unit}`}
              hint="Leave empty if you do not know it yet — the delivery still goes on the shelf."
              error={state.fieldErrors?.unitCost}
            >
              <Input
                name="unitCost"
                inputMode="decimal"
                placeholder={
                  item.unitCostCentavos === null
                    ? "e.g. 240"
                    : centavosToDecimalString(item.unitCostCentavos)
                }
                defaultValue={
                  item.unitCostCentavos === null
                    ? ""
                    : centavosToDecimalString(item.unitCostCentavos)
                }
              />
            </Field>

            <Field label="Supplier" hint="Optional.">
              <Select name="supplierId" defaultValue={item.supplierId ?? ""}>
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

            <Field label="Paid?">
              <Select name="payment" defaultValue="now">
                <option value="now">Paid now</option>
                <option value="later">On account — pay later</option>
              </Select>
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

            <Field
              label="Due date, if on account"
              hint="Leave empty if the supplier did not give one."
            >
              <Input name="dueOn" type="date" />
            </Field>
          </div>
        </>
      ) : null}

      <Field label={mode === "count" ? "Note" : "What for"} hint="Optional.">
        <Input
          name={mode === "count" ? "note" : "reason"}
          placeholder={
            mode === "out" ? "e.g. tarpaulin job for St. Vincent" : "e.g. monthly count"
          }
        />
      </Field>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={receivePending || outPending || countPending}
        >
          {receivePending || outPending || countPending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setMode(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function StockItemForm({
  item,
  suppliers,
}: {
  item?: StockItem;
  suppliers: Supplier[];
}) {
  const [state, submit, pending] = useActionState<StockState, FormData>(
    saveStockItemAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {item ? "Edit" : "Add a material"}
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      {item ? <input type="hidden" name="itemId" value={item.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" error={state.fieldErrors?.name}>
          <Input name="name" defaultValue={item?.name ?? ""} required />
        </Field>

        <Field
          label="Counted in"
          hint="ream, litre, piece, pack — your words."
          error={state.fieldErrors?.unit}
        >
          <Input name="unit" defaultValue={item?.unit ?? ""} placeholder="ream" required />
        </Field>

        <Field label="Which part of the shop" error={state.fieldErrors?.tag}>
          <Select name="tag" defaultValue={item?.tag ?? "whole_shop"}>
            {TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {divisionName(tag)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Supplier" hint="Optional.">
          <Select name="supplierId" defaultValue={item?.supplierId ?? ""}>
            <option value="">Not recorded</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Warn me at"
          hint="Leave empty until you know. Nothing is guessed — an invented level warns on the wrong day."
          error={state.fieldErrors?.reorderLevel}
        >
          <Input
            name="reorderLevel"
            inputMode="decimal"
            placeholder="e.g. 5"
            defaultValue={
              item?.reorderLevel != null ? quantityToDecimalString(item.reorderLevel) : ""
            }
          />
        </Field>

        <Field
          label="Price per unit"
          hint="Leave empty until you know. Used to value what is on the shelf."
          error={state.fieldErrors?.unitCost}
        >
          <Input
            name="unitCost"
            inputMode="decimal"
            placeholder="e.g. 240"
            defaultValue={
              item?.unitCostCentavos != null
                ? centavosToDecimalString(item.unitCostCentavos)
                : ""
            }
          />
        </Field>
      </div>

      <Field label="Note">
        <Input name="note" defaultValue={item?.note ?? ""} />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={item?.active ?? true}
          className="size-4 rounded border-line"
        />
        <span>Still counting this</span>
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
