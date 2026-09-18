"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  adjustStock, paySupplierPayable, receiveStock,
  saveCustomer, saveStockItem, saveSupplier,
} from "@/app/admin/inventory/actions";
import { Alert, Button, Field, fieldClass } from "@/components/ui";
import { emptyActionState } from "@/lib/action-state";
import { MONEY_SOURCES, MONEY_SOURCE_LABEL, TAGS, TAG_LABEL } from "@/lib/domain";

function Submit({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

function Result({ state }: { state: { error: string | null; notice: string | null } }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.notice) return <Alert tone="good">{state.notice}</Alert>;
  return null;
}

export function StockItemForm() {
  const [state, action] = useActionState(saveStockItem, emptyActionState);
  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Name"><input name="name" required className={fieldClass} /></Field>
      <Field label="Unit" hint="e.g. pc, ream, litre"><input name="unit" defaultValue="pc" className={fieldClass} /></Field>
      <Field label="Tag">
        <select name="tag" defaultValue="printshoppe" className={fieldClass}>
          {TAGS.map((t) => <option key={t} value={t}>{TAG_LABEL[t]}</option>)}
        </select>
      </Field>
      <Field label="Unit cost"><input name="unit_cost" inputMode="decimal" defaultValue="0" className={fieldClass} /></Field>
      <Field label="Reorder level"><input name="reorder_level" inputMode="decimal" defaultValue="0" className={fieldClass} /></Field>
      <Field label="Note"><input name="note" className={fieldClass} /></Field>
      <div className="sm:col-span-2 lg:col-span-3"><Result state={state} /></div>
      <div className="sm:col-span-2 lg:col-span-3"><Submit label="Add item" /></div>
    </form>
  );
}

export function ReceiveStockForm({
  items, suppliers,
}: {
  items: { id: string; name: string; unit: string }[];
  suppliers: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(receiveStock, emptyActionState);
  const [payNow, setPayNow] = useState(false);

  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Item">
        <select name="stock_item_id" required className={fieldClass}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
        </select>
      </Field>
      <Field label="Quantity"><input name="quantity" inputMode="decimal" required className={fieldClass} /></Field>
      <Field label="Unit cost"><input name="unit_cost" inputMode="decimal" defaultValue="0" className={fieldClass} /></Field>
      <Field label="Supplier">
        <select name="supplier_id" defaultValue="" className={fieldClass}>
          <option value="">None</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Reason"><input name="reason" className={fieldClass} /></Field>

      <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-fg">
        <input
          type="checkbox" name="pay_now" checked={payNow}
          onChange={(e) => setPayNow(e.target.checked)}
          className="size-4 accent-[var(--color-brand)]"
        />
        Paid now
      </label>

      {payNow ? (
        <Field label="Paid from">
          <select name="source" defaultValue="cash_drawer" className={fieldClass}>
            {MONEY_SOURCES.map((s) => <option key={s} value={s}>{MONEY_SOURCE_LABEL[s]}</option>)}
          </select>
        </Field>
      ) : (
        <Field label="Due on" hint="Leave blank if there is no due date.">
          <input name="due_on" type="date" className={fieldClass} />
        </Field>
      )}

      <div className="sm:col-span-2 lg:col-span-3"><Result state={state} /></div>
      <div className="sm:col-span-2 lg:col-span-3"><Submit label="Receive stock" /></div>
    </form>
  );
}

export function AdjustStockForm({ itemId }: { itemId: string }) {
  const [state, action] = useActionState(adjustStock, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="stock_item_id" value={itemId} />
      <div className="w-28">
        <Field label="Change" hint="Negative to remove">
          <input name="delta" inputMode="decimal" required className={fieldClass} />
        </Field>
      </div>
      <div className="w-32">
        <Field label="Kind">
          <select name="kind" defaultValue="out" className={fieldClass}>
            <option value="out">Used</option>
            <option value="count">Count</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </Field>
      </div>
      <div className="min-w-40 flex-1">
        <Field label="Reason"><input name="reason" className={fieldClass} /></Field>
      </div>
      <Submit label="Record" variant="secondary" />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}

export function SupplierForm() {
  const [state, action] = useActionState(saveSupplier, emptyActionState);
  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Name"><input name="name" required className={fieldClass} /></Field>
      <Field label="Contact number"><input name="contact_number" className={fieldClass} /></Field>
      <Field label="Address"><input name="address" className={fieldClass} /></Field>
      <Field label="Note"><input name="note" className={fieldClass} /></Field>
      <div className="sm:col-span-2 lg:col-span-4"><Result state={state} /></div>
      <div className="sm:col-span-2 lg:col-span-4"><Submit label="Add supplier" /></div>
    </form>
  );
}

export function PayPayableForm({ payableId }: { payableId: string }) {
  const [state, action] = useActionState(paySupplierPayable, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="payable_id" value={payableId} />
      <div className="w-40">
        <Field label="Paid from">
          <select name="source" defaultValue="cash_drawer" className={fieldClass}>
            {MONEY_SOURCES.map((s) => <option key={s} value={s}>{MONEY_SOURCE_LABEL[s]}</option>)}
          </select>
        </Field>
      </div>
      <div className="w-40">
        <Field label="Paid on">
          <input name="paid_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClass} />
        </Field>
      </div>
      <Submit label="Mark paid" variant="secondary" />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}

export function CustomerForm() {
  const [state, action] = useActionState(saveCustomer, emptyActionState);
  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Name"><input name="name" required className={fieldClass} /></Field>
      <Field label="Contact number"><input name="contact_number" className={fieldClass} /></Field>
      <Field label="Facebook name"><input name="facebook_name" className={fieldClass} /></Field>
      <Field label="Email"><input name="email" type="email" className={fieldClass} /></Field>
      <Field label="Address"><input name="address" className={fieldClass} /></Field>
      <Field label="Note"><input name="note" className={fieldClass} /></Field>
      <div className="sm:col-span-2 lg:col-span-3"><Result state={state} /></div>
      <div className="sm:col-span-2 lg:col-span-3"><Submit label="Add customer" /></div>
    </form>
  );
}
