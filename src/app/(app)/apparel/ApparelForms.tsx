"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button, Field, Input, Notice, Select, TAP_AREA } from "@/components/ui";
import {
  ORDER_FLOW,
  ORDER_STATUS_LABELS,
  type ApparelSize,
  type OrderStatus,
} from "@/lib/apparel";
import { MONEY_SOURCES, MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { centavosToDecimalString } from "@/lib/money";

import {
  addLineAction,
  addRosterAction,
  createOrderAction,
  recordPaymentAction,
  removeLineAction,
  removeRosterEntryAction,
  setOrderStatusAction,
  updateOrderAction,
  voidPaymentAction,
  type ApparelState,
} from "./actions";

export interface CustomerChoice {
  id: string;
  name: string;
}

export interface ProductChoice {
  id: string;
  name: string;
  basePriceCentavos: number | null;
}

export function NewOrderForm({
  customers,
  today,
}: {
  customers: CustomerChoice[];
  today: string;
}) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    createOrderAction,
    {},
  );
  const [open, setOpen] = useState(false);

  // A link rather than an automatic jump: the next thing anyone does is add
  // what is being made, but sending them there without asking would lose a
  // second order they were about to write.
  if (state.orderId) {
    return (
      <Notice tone="success" title={state.success ?? "Order opened."}>
        <Link href={`/apparel/${state.orderId}`} className={`underline ${TAP_AREA}`}>
          Open it and add the items
        </Link>
      </Notice>
    );
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        New job order
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      <Field
        label="Team or customer name"
        hint="What the order is known by - often a team, not the person paying."
        error={state.fieldErrors?.teamName}
      >
        <Input name="teamName" placeholder="e.g. San Carlos Runners Club" required autoFocus />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer record" hint="Optional. Links their contact details.">
          <Select name="customerId" defaultValue="">
            <option value="">Not linked</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Promised date"
          hint="Leave empty if you have not promised one - nothing is assumed."
        >
          <Input name="promisedOn" type="date" min={today} />
        </Field>
      </div>

      <Field label="Note">
        <Input name="note" placeholder="e.g. same design as last year" />
      </Field>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Opening..." : "Open the order"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function OrderDetailsForm({
  orderId,
  teamName,
  customerId,
  promisedOn,
  layoutNote,
  note,
  customers,
}: {
  orderId: string;
  teamName: string | null;
  customerId: string | null;
  promisedOn: string | null;
  layoutNote: string | null;
  note: string | null;
  customers: CustomerChoice[];
}) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    updateOrderAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Edit the details
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />

      <Field label="Team or customer name" error={state.fieldErrors?.teamName}>
        <Input name="teamName" defaultValue={teamName ?? ""} required />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer record">
          <Select name="customerId" defaultValue={customerId ?? ""}>
            <option value="">Not linked</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Promised date" hint="Leave empty if none was promised.">
          <Input name="promisedOn" type="date" defaultValue={promisedOn ?? ""} />
        </Field>
      </div>

      <Field label="Layout note" hint="What the design is, or what is waiting on the customer.">
        <Input name="layoutNote" defaultValue={layoutNote ?? ""} />
      </Field>

      <Field label="Note">
        <Input name="note" defaultValue={note ?? ""} />
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

/** Moving an order along, and cancelling it. */
export function StatusForm({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    setOrderStatusAction,
    {},
  );
  const [cancelling, setCancelling] = useState(false);

  const index = ORDER_FLOW.indexOf(status);
  const next = index >= 0 && index < ORDER_FLOW.length - 1 ? ORDER_FLOW[index + 1] : null;

  if (cancelling) {
    return (
      <form action={submit} className="space-y-3">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="status" value="cancelled" />

        <Field
          label="Why is it cancelled?"
          hint="Kept on the order, because work may already have been done."
          error={state.fieldErrors?.cancelReason}
        >
          <Input name="cancelReason" placeholder="e.g. team pulled out" required autoFocus />
        </Field>

        {state.error ? <Notice tone="attention" title={state.error} /> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? "Saving..." : "Cancel this order"}
          </Button>
          <Button type="button" variant="quiet" onClick={() => setCancelling(false)}>
            Keep it open
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <form action={submit} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="orderId" value={orderId} />

        {next ? (
          <Button type="submit" name="status" value={next} disabled={pending}>
            {pending ? "Saving..." : `Move to "${ORDER_STATUS_LABELS[next]}"`}
          </Button>
        ) : null}

        {/* Going back a step happens: a layout gets rejected after approval. */}
        {index > 0 ? (
          <Button
            type="submit"
            name="status"
            value={ORDER_FLOW[index - 1]}
            variant="secondary"
            disabled={pending}
          >
            Back to &ldquo;{ORDER_STATUS_LABELS[ORDER_FLOW[index - 1]]}&rdquo;
          </Button>
        ) : null}
      </form>

      {status !== "cancelled" && status !== "released" ? (
        <Button type="button" variant="quiet" onClick={() => setCancelling(true)}>
          Cancel the order
        </Button>
      ) : null}

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}
    </div>
  );
}

export function AddLineForm({
  orderId,
  products,
  fabrics,
  collars,
}: {
  orderId: string;
  products: ProductChoice[];
  fabrics: string[];
  collars: string[];
}) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    addLineAction,
    {},
  );
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<ProductChoice | null>(null);

  if (!open) {
    return (
      <div className="space-y-2">
        {/*
          Secondary, not red. Red marks the ONE main action on a screen, and on
          an order that is moving the job along - or taking the money. Adding a
          line is ordinary work inside a list.
        */}
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          Add an item
        </Button>
        {state.success ? <Notice tone="success" title={state.success} /> : null}
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-3 rounded-card bg-surface-sunken p-4 ring-1 ring-line/60">
      <input type="hidden" name="orderId" value={orderId} />

      <Field label="What is being made" error={state.fieldErrors?.name}>
        <Select
          name="productId"
          defaultValue=""
          onChange={(event) =>
            setPicked(
              products.find((product) => product.id === event.target.value) ?? null,
            )
          }
        >
          <option value="">Choose...</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
              {product.basePriceCentavos === null
                ? " (no price set)"
                : ` - ₱${centavosToDecimalString(product.basePriceCentavos)}`}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Price each"
          hint="Leave empty if it is not priced yet - the order still works."
          error={state.fieldErrors?.unitPrice}
        >
          <Input
            name="unitPrice"
            inputMode="decimal"
            key={`price-${picked?.id ?? "none"}`}
            defaultValue={
              picked?.basePriceCentavos != null
                ? centavosToDecimalString(picked.basePriceCentavos)
                : ""
            }
            placeholder="e.g. 650"
          />
        </Field>

        <Field
          label="How many"
          hint="Ignored once you add a name list - the names become the count."
          error={state.fieldErrors?.quantity}
        >
          <Input name="quantity" inputMode="numeric" defaultValue="1" />
        </Field>

        <Field label="Fabric" hint="Type anything; the list is only a shortcut.">
          <Input name="fabric" list="apparel-fabrics" placeholder="e.g. Dri-fit" />
          <datalist id="apparel-fabrics">
            {fabrics.map((fabric) => (
              <option key={fabric} value={fabric} />
            ))}
          </datalist>
        </Field>

        <Field label="Collar">
          <Input name="collar" list="apparel-collars" placeholder="e.g. Round neck" />
          <datalist id="apparel-collars">
            {collars.map((collar) => (
              <option key={collar} value={collar} />
            ))}
          </datalist>
        </Field>
      </div>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding..." : "Add to the order"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function RemoveLineForm({
  orderId,
  lineId,
}: {
  orderId: string;
  lineId: string;
}) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    removeLineAction,
    {},
  );

  return (
    <form action={submit}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="lineId" value={lineId} />
      <Button type="submit" variant="quiet" disabled={pending}>
        {pending ? "Removing..." : "Remove item"}
      </Button>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
    </form>
  );
}

/**
 * The roster, pasted in one go.
 *
 * A team captain sends a list. Typing fifteen names into fifteen little forms
 * is how a shop ends up keeping the list on paper instead of in here.
 */
export function RosterForm({
  orderId,
  lineId,
  sizesWithoutPrice,
}: {
  orderId: string;
  lineId: string;
  sizesWithoutPrice: ApparelSize[];
}) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    addRosterAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          Add names and sizes
        </Button>
        {state.success ? <Notice tone="success" title={state.success} /> : null}
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-3 rounded-card bg-surface-sunken p-4 ring-1 ring-line/60">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="lineId" value={lineId} />

      <Field
        label="Paste the list"
        hint="One player per line: name, number, size. Or just name, size. Or just the size."
        error={state.fieldErrors?.roster}
      >
        <textarea
          name="roster"
          rows={8}
          required
          autoFocus
          placeholder={"Dela Cruz, 7, M\nReyes, 10, L\nSantos, 23, 2XL"}
          className="w-full rounded-control bg-surface px-3 py-2 font-mono text-sm text-ink ring-1 ring-line placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/50"
        />
      </Field>

      {sizesWithoutPrice.length > 0 ? (
        <Notice
          tone="attention"
          title={`${sizesWithoutPrice.length} size${
            sizesWithoutPrice.length === 1 ? " has" : "s have"
          } no surcharge set`}
        >
          {sizesWithoutPrice.join(", ")} will be added at no extra cost, because
          nobody has said what they cost. Set them on the price list and the
          next order picks it up.
        </Notice>
      ) : null}

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding..." : "Add them"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    </form>
  );
}

export function RemoveRosterEntryForm({
  orderId,
  entryId,
}: {
  orderId: string;
  entryId: string;
}) {
  const [, submit, pending] = useActionState<ApparelState, FormData>(
    removeRosterEntryAction,
    {},
  );

  return (
    <form action={submit} className="inline">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="entryId" value={entryId} />
      <button
        type="submit"
        disabled={pending}
        className={`text-xs text-muted underline hover:text-ink ${TAP_AREA}`}
      >
        {pending ? "..." : "Remove"}
      </button>
    </form>
  );
}

export function PaymentForm({
  orderId,
  balanceLabel,
  today,
  isFirstPayment,
}: {
  orderId: string;
  balanceLabel: string;
  today: string;
  isFirstPayment: boolean;
}) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    recordPaymentAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" onClick={() => setOpen(true)}>
          {isFirstPayment ? "Take a down payment" : "Take a payment"}
        </Button>
        {state.success ? <Notice tone="success" title={state.success} /> : null}
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />

      <Field
        label="Amount taken"
        hint={`${balanceLabel} is owed. Type what the customer actually handed over.`}
        error={state.fieldErrors?.amount}
      >
        <Input name="amount" inputMode="decimal" placeholder="e.g. 1000" required autoFocus />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Paid with" error={state.fieldErrors?.source}>
          <Select name="source" defaultValue="cash_drawer">
            {MONEY_SOURCES.map((source) => (
              <option key={source} value={source}>
                {MONEY_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Paid on">
          <Input name="paidOn" type="date" defaultValue={today} />
        </Field>

        <Field label="Reference number" hint="For GCash, Maya or a bank transfer.">
          <Input name="referenceNumber" />
        </Field>

        <Field label="Note">
          <Input name="note" />
        </Field>
      </div>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Record the payment"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function VoidPaymentForm({
  orderId,
  paymentId,
}: {
  orderId: string;
  paymentId: string;
}) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    voidPaymentAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (state.success) return <Notice tone="success" title={state.success} />;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-xs text-muted underline hover:text-ink ${TAP_AREA}`}
      >
        Void
      </button>
    );
  }

  return (
    <form action={submit} className="mt-2 space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="paymentId" value={paymentId} />

      <Field
        label="Why is it being taken back?"
        error={state.fieldErrors?.reason}
      >
        <Input name="reason" placeholder="e.g. cheque bounced" required autoFocus />
      </Field>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Saving..." : "Void the payment"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </form>
  );
}
