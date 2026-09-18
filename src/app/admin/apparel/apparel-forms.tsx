"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addOrderLine, addOrderName, createOrder, setOrderStatus,
  takeApparelPayment, voidApparelPayment,
} from "@/app/admin/apparel/actions";
import { Alert, Button, Field, fieldClass } from "@/components/ui";
import { emptyActionState } from "@/lib/action-state";
import {
  APPAREL_SIZES, APPAREL_STATUSES, MONEY_SOURCES, MONEY_SOURCE_LABEL, humanise,
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

export function NewOrderForm({ customers }: { customers: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createOrder, emptyActionState);
  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Team or order name"><input name="team_name" required className={fieldClass} /></Field>
      <Field label="Customer">
        <select name="customer_id" defaultValue="" className={fieldClass}>
          <option value="">Not linked</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Ordered on">
        <input name="ordered_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClass} />
      </Field>
      <Field label="Promised on"><input name="promised_on" type="date" className={fieldClass} /></Field>
      <div className="sm:col-span-2">
        <Field label="Layout note"><input name="layout_note" className={fieldClass} /></Field>
      </div>
      <div className="sm:col-span-2 lg:col-span-3"><Result state={state} /></div>
      <div className="sm:col-span-2 lg:col-span-3"><Submit label="Create order" /></div>
    </form>
  );
}

export function OrderStatusForm({ orderId, status }: { orderId: string; status: string }) {
  const [state, action] = useActionState(setOrderStatus, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="order_id" value={orderId} />
      <div className="w-48">
        <Field label="Status">
          <select name="status" defaultValue={status} className={fieldClass}>
            {APPAREL_STATUSES.map((s) => <option key={s} value={s}>{humanise(s)}</option>)}
          </select>
        </Field>
      </div>
      <div className="min-w-40 flex-1">
        <Field label="Cancel reason" hint="Only used when cancelling."><input name="cancel_reason" className={fieldClass} /></Field>
      </div>
      <Submit label="Update" variant="secondary" />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}

export function AddOrderLineForm({
  orderId, products, fabrics, collars,
}: {
  orderId: string;
  products: { id: string; name: string }[];
  fabrics: string[];
  collars: string[];
}) {
  const [state, action] = useActionState(addOrderLine, emptyActionState);
  return (
    <form action={action} className="grid gap-3 p-5 sm:grid-cols-3 lg:grid-cols-6">
      <input type="hidden" name="order_id" value={orderId} />
      <Field label="Product">
        <select name="apparel_product_id" defaultValue="" className={fieldClass}>
          <option value="">Custom line</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Name"><input name="name" className={fieldClass} /></Field>
      <Field label="Fabric">
        <select name="fabric" defaultValue="" className={fieldClass}>
          <option value="">—</option>
          {fabrics.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Field>
      <Field label="Collar">
        <select name="collar" defaultValue="" className={fieldClass}>
          <option value="">—</option>
          {collars.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Unit price"><input name="unit_price" inputMode="decimal" defaultValue="0" className={fieldClass} /></Field>
      <Field label="Quantity"><input name="quantity" type="number" min={1} defaultValue={1} className={fieldClass} /></Field>
      <div className="sm:col-span-3 lg:col-span-6"><Result state={state} /></div>
      <div className="sm:col-span-3 lg:col-span-6"><Submit label="Add line" variant="secondary" /></div>
    </form>
  );
}

export function AddNameForm({ orderId, lineId }: { orderId: string; lineId: string }) {
  const [state, action] = useActionState(addOrderName, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 px-5 py-3">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="line_id" value={lineId} />
      <div className="min-w-32 flex-1">
        <Field label="Player name"><input name="player_name" className={fieldClass} /></Field>
      </div>
      <div className="w-24">
        <Field label="Number"><input name="player_number" className={fieldClass} /></Field>
      </div>
      <div className="w-24">
        <Field label="Size">
          <select name="size" defaultValue="M" className={fieldClass}>
            {APPAREL_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <Submit label="Add" variant="secondary" />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}

export function ApparelPaymentForm({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(takeApparelPayment, emptyActionState);
  return (
    <form action={action} className="grid gap-3 p-5 sm:grid-cols-5">
      <input type="hidden" name="order_id" value={orderId} />
      <Field label="Amount"><input name="amount" inputMode="decimal" required className={fieldClass} /></Field>
      <Field label="Kind">
        <select name="kind" defaultValue="down_payment" className={fieldClass}>
          <option value="down_payment">Down payment</option>
          <option value="balance">Balance</option>
        </select>
      </Field>
      <Field label="Paid from">
        <select name="source" defaultValue="cash_drawer" className={fieldClass}>
          {MONEY_SOURCES.map((s) => <option key={s} value={s}>{MONEY_SOURCE_LABEL[s]}</option>)}
        </select>
      </Field>
      <Field label="Paid on">
        <input name="paid_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClass} />
      </Field>
      <Field label="Reference"><input name="reference_number" className={fieldClass} /></Field>
      <div className="sm:col-span-5"><Result state={state} /></div>
      <div className="sm:col-span-5"><Submit label="Take payment" /></div>
    </form>
  );
}

export function VoidApparelPaymentForm({ paymentId, orderId }: { paymentId: string; orderId: string }) {
  const [state, action] = useActionState(voidApparelPayment, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="order_id" value={orderId} />
      <input name="reason" required placeholder="Reason" className={`${fieldClass} min-w-40 flex-1`} />
      <Submit label="Void" variant="danger" />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}
