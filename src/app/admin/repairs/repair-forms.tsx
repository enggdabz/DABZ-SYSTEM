"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addRepairLine, createTicket, fitPart, setTicketStatus, takeRepairPayment, voidRepairPayment,
} from "@/app/admin/repairs/actions";
import { Alert, Button, Field, fieldClass } from "@/components/ui";
import { emptyActionState } from "@/lib/action-state";
import {
  MONEY_SOURCES, MONEY_SOURCE_LABEL, REPAIR_STATUSES,
  REPAIR_UNIT_KINDS, REPAIR_UNIT_KIND_LABEL, humanise,
} from "@/lib/domain";

function Submit({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} disabled={pending}>{pending ? "Working…" : label}</Button>;
}
function Result({ state }: { state: { error: string | null; notice: string | null } }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.notice) return <Alert tone="good">{state.notice}</Alert>;
  return null;
}

export function NewTicketForm({ customers }: { customers: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createTicket, emptyActionState);
  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Customer name"><input name="customer_name" required className={fieldClass} /></Field>
      <Field label="Contact number"><input name="contact_number" className={fieldClass} /></Field>
      <Field label="Known customer">
        <select name="customer_id" defaultValue="" className={fieldClass}>
          <option value="">Not linked</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Unit kind">
        <select name="unit_kind" required defaultValue="laptop" className={fieldClass}>
          {REPAIR_UNIT_KINDS.map((k) => <option key={k} value={k}>{REPAIR_UNIT_KIND_LABEL[k]}</option>)}
        </select>
      </Field>
      <Field label="Brand"><input name="brand" className={fieldClass} /></Field>
      <Field label="Model"><input name="model" className={fieldClass} /></Field>
      <Field label="Serial number"><input name="serial_number" className={fieldClass} /></Field>
      <Field label="Unlock method">
        <select name="unlock_method" defaultValue="not_needed" className={fieldClass}>
          <option value="not_needed">Not needed</option>
          <option value="customer_unlocks">Customer unlocks</option>
          <option value="left_unlocked">Left unlocked</option>
        </select>
      </Field>
      <Field label="Received on">
        <input name="received_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClass} />
      </Field>
      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="Problem"><input name="problem" required className={fieldClass} /></Field>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="Accessories and condition"><input name="condition_note" className={fieldClass} /></Field>
      </div>
      <div className="sm:col-span-2 lg:col-span-3"><Result state={state} /></div>
      <div className="sm:col-span-2 lg:col-span-3"><Submit label="Book in" /></div>
    </form>
  );
}

export function StatusForm({ ticketId, status }: { ticketId: string; status: string }) {
  const [state, action] = useActionState(setTicketStatus, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <div className="w-44">
        <Field label="Status">
          <select name="status" defaultValue={status} className={fieldClass}>
            {REPAIR_STATUSES.map((s) => <option key={s} value={s}>{humanise(s)}</option>)}
          </select>
        </Field>
      </div>
      <div className="min-w-40 flex-1">
        <Field label="Decline reason" hint="Only used when declining."><input name="decline_reason" className={fieldClass} /></Field>
      </div>
      <Submit label="Update" variant="secondary" />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}

export function AddLineForm({
  ticketId, services,
}: {
  ticketId: string;
  services: { id: string; name: string; unit_kind: string }[];
}) {
  const [state, action] = useActionState(addRepairLine, emptyActionState);
  return (
    <form action={action} className="grid gap-3 p-5 sm:grid-cols-4">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <Field label="Service">
        <select name="repair_service_id" defaultValue="" className={fieldClass}>
          <option value="">Custom line</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({humanise(s.unit_kind)})</option>
          ))}
        </select>
      </Field>
      <Field label="Name" hint="Needed for a custom line."><input name="name" className={fieldClass} /></Field>
      <Field label="Price"><input name="unit_price" inputMode="decimal" defaultValue="0" className={fieldClass} /></Field>
      <Field label="Quantity"><input name="quantity" type="number" min={1} defaultValue={1} className={fieldClass} /></Field>
      <div className="sm:col-span-4"><Result state={state} /></div>
      <div className="sm:col-span-4"><Submit label="Add line" variant="secondary" /></div>
    </form>
  );
}

export function FitPartForm({
  ticketId, items,
}: {
  ticketId: string;
  items: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(fitPart, emptyActionState);
  return (
    <form action={action} className="grid gap-3 p-5 sm:grid-cols-4">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <Field label="From stock" hint="Deducts stock when chosen.">
        <select name="stock_item_id" defaultValue="" className={fieldClass}>
          <option value="">Not from stock</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </Field>
      <Field label="Part name"><input name="name" className={fieldClass} /></Field>
      <Field label="Price"><input name="unit_price" inputMode="decimal" defaultValue="0" className={fieldClass} /></Field>
      <Field label="Quantity"><input name="quantity" type="number" min={1} defaultValue={1} className={fieldClass} /></Field>
      <div className="sm:col-span-4"><Result state={state} /></div>
      <div className="sm:col-span-4"><Submit label="Fit part" variant="secondary" /></div>
    </form>
  );
}

export function RepairPaymentForm({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState(takeRepairPayment, emptyActionState);
  return (
    <form action={action} className="grid gap-3 p-5 sm:grid-cols-4">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <Field label="Amount"><input name="amount" inputMode="decimal" required className={fieldClass} /></Field>
      <Field label="Paid from">
        <select name="source" defaultValue="cash_drawer" className={fieldClass}>
          {MONEY_SOURCES.map((s) => <option key={s} value={s}>{MONEY_SOURCE_LABEL[s]}</option>)}
        </select>
      </Field>
      <Field label="Paid on">
        <input name="paid_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClass} />
      </Field>
      <Field label="Reference"><input name="reference_number" className={fieldClass} /></Field>
      <div className="sm:col-span-4"><Result state={state} /></div>
      <div className="sm:col-span-4"><Submit label="Take payment" /></div>
    </form>
  );
}

export function VoidPaymentForm({ paymentId, ticketId }: { paymentId: string; ticketId: string }) {
  const [state, action] = useActionState(voidRepairPayment, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="ticket_id" value={ticketId} />
      <input name="reason" required placeholder="Reason" className={`${fieldClass} min-w-40 flex-1`} />
      <Submit label="Void" variant="danger" />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}
