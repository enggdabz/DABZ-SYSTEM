"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button, Field, Input, Notice, Select, TAP_AREA } from "@/components/ui";
import { useFormPanel } from "@/components/use-form-panel";
import {
  ORDER_FLOW,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@/lib/apparel";
import { MONEY_SOURCES, MONEY_SOURCE_LABELS } from "@/lib/ledger";

import {
  createOrderAction,
  recordPaymentAction,
  removeLineAction,
  setOrderStatusAction,
  updateLineAction,
  updateOrderAction,
  voidPaymentAction,
  type ApparelState,
} from "./actions";

export interface CustomerChoice {
  id: string;
  name: string;
}

/**
 * Opening a project: the basic information the owner asked for, in the order
 * they asked for it (Phase 13).
 *
 *   "Team name, Address, Contact person, Contact number, Facebook account
 *    link, Due date, and the Payment record (Down payment, Balance)."
 *
 * ONLY THE TEAM NAME IS REQUIRED. Everything else left empty stays empty and
 * never blocks the project - a counter that cannot write an order down until
 * somebody remembers a Facebook link is a counter that keeps the order on a
 * scrap of paper.
 *
 * The BALANCE is not on this form and never will be: it is the total less the
 * payments, worked out every time. What is here is the down payment, which
 * usually arrives with the project, and it goes through the same function
 * every other apparel payment goes through.
 */
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
  const { open, answer, openPanel, closePanel } = useFormPanel(state);

  // A link rather than an automatic jump: the next thing anyone does is add
  // what is being made, but sending them there without asking would lose a
  // second order they were about to write. Which is also why there is a way
  // straight into the next one - two teams at the counter is an ordinary
  // afternoon, and until this button existed the second one needed the page
  // reloading before the order could even be started.
  if (answer.orderId) {
    return (
      <Notice tone="success" title={answer.success ?? "Order opened."}>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/apparel/${answer.orderId}`} className={`underline ${TAP_AREA}`}>
            Open it and add the items
          </Link>
          <Button type="button" variant="secondary" onClick={openPanel}>
            Write another order
          </Button>
        </div>
      </Notice>
    );
  }

  if (!open) {
    return (
      <Button type="button" onClick={openPanel}>
        New job order
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      <Field
        label="Team or customer name"
        hint="What the order is known by - often a team, not the person paying."
        error={answer.fieldErrors?.teamName}
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

      <ContactFields />

      <Field label="Note">
        <Input name="note" placeholder="e.g. same design as last year" />
      </Field>

      <div className="rounded-card bg-surface-sunken p-4 ring-1 ring-line/60">
        <p className="text-sm font-medium">Down payment</p>
        <p className="mt-0.5 text-xs text-muted">
          Optional. Leave it empty and take the payment later on the project.
          The balance is never typed: it is the total less what has been paid.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Amount taken" error={answer.fieldErrors?.downPayment}>
            <Input name="downPayment" inputMode="decimal" placeholder="e.g. 3000" />
          </Field>

          <Field label="Paid with" error={answer.fieldErrors?.downPaymentSource}>
            <Select name="downPaymentSource" defaultValue="cash_drawer">
              {MONEY_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {MONEY_SOURCE_LABELS[source]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Reference number" hint="For GCash, Maya or a bank transfer.">
            <Input name="downPaymentReference" />
          </Field>
        </div>

        {/*
          Said before it is taken, not discovered in a report next month.
          Nothing is encoded on a project this new, so there are no items to
          split the money across and it lands in the apparel fallback book.
        */}
        <p className="mt-3 text-xs text-attention">
          <span aria-hidden="true">{"⚠"} </span>
          Nothing is encoded yet, so this is booked to Sublimation jerseys. If
          it should be split across books, encode the people first and take the
          payment on the project.
        </p>
      </div>

      {answer.error ? <Notice tone="attention" title={answer.error} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Opening..." : "Open the order"}
        </Button>
        <Button type="button" variant="quiet" onClick={closePanel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export interface ProjectContact {
  contactPerson: string | null;
  contactNumber: string | null;
  address: string | null;
  facebookLink: string | null;
}

export function OrderDetailsForm({
  orderId,
  teamName,
  customerId,
  promisedOn,
  layoutNote,
  note,
  contact,
  customers,
}: {
  orderId: string;
  teamName: string | null;
  customerId: string | null;
  promisedOn: string | null;
  layoutNote: string | null;
  note: string | null;
  contact: ProjectContact;
  customers: CustomerChoice[];
}) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    updateOrderAction,
    {},
  );
  const { open, answer, openPanel, closePanel } = useFormPanel(state);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={openPanel}>
        Edit the details
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />

      <Field label="Team or customer name" error={answer.fieldErrors?.teamName}>
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

      <ContactFields contact={contact} />

      <Field label="Layout note" hint="What the design is, or what is waiting on the customer.">
        <Input name="layoutNote" defaultValue={layoutNote ?? ""} />
      </Field>

      <Field label="Note">
        <Input name="note" defaultValue={note ?? ""} />
      </Field>

      {answer.error ? <Notice tone="attention" title={answer.error} /> : null}
      {answer.success ? <Notice tone="success" title={answer.success} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="quiet" onClick={closePanel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The project's own contact details.
 *
 * ON THE PROJECT, not on the customer record. A team's contact person is a
 * fact about this project - next season it is a different manager - and the
 * job order sheet has to say who was actually spoken to when the work came in.
 * Nothing here is copied to or from the customer record; where a project
 * leaves one empty, the project screen shows the linked customer's value and
 * says where it came from.
 *
 * Every one of them is optional, which is why none carries a warning: a
 * missing Facebook link is not a figure only the owner can know, it is simply
 * something the team did not give.
 */
function ContactFields({ contact }: { contact?: ProjectContact }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contact person" hint="Who the shop deals with for this project.">
          <Input
            name="contactPerson"
            defaultValue={contact?.contactPerson ?? ""}
            placeholder="e.g. Coach Ramos"
          />
        </Field>

        <Field label="Contact number">
          <Input
            name="contactNumber"
            type="tel"
            inputMode="tel"
            defaultValue={contact?.contactNumber ?? ""}
            placeholder="e.g. 0917 000 0000"
          />
        </Field>
      </div>

      <Field label="Address">
        <Input name="address" defaultValue={contact?.address ?? ""} />
      </Field>

      <Field label="Facebook account link" hint="The page or profile the order came through.">
        <Input
          name="facebookLink"
          type="url"
          defaultValue={contact?.facebookLink ?? ""}
          placeholder="https://facebook.com/..."
        />
      </Field>
    </>
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
  const { open: cancelling, answer, openPanel, closePanel } = useFormPanel(state);

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
          error={answer.fieldErrors?.cancelReason}
        >
          <Input name="cancelReason" placeholder="e.g. team pulled out" required autoFocus />
        </Field>

        {answer.error ? <Notice tone="attention" title={answer.error} /> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? "Saving..." : "Cancel this order"}
          </Button>
          <Button type="button" variant="quiet" onClick={closePanel}>
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
        <Button type="button" variant="quiet" onClick={openPanel}>
          Cancel the order
        </Button>
      ) : null}

      {answer.error ? <Notice tone="attention" title={answer.error} /> : null}
      {answer.success ? <Notice tone="success" title={answer.success} /> : null}
    </div>
  );
}

/**
 * What an item is made of.
 *
 * Items themselves are no longer added by hand - they follow from the encoding
 * table, one per uniform type. What is still chosen here is the fabric and the
 * collar, because those are properties of the batch rather than of a person:
 * one design is cut from one cloth.
 */
export function ItemFabricForm({
  orderId,
  lineId,
  itemName,
  fabric,
  collar,
  fabrics,
  collars,
}: {
  orderId: string;
  lineId: string;
  itemName: string;
  fabric: string | null;
  collar: string | null;
  fabrics: string[];
  collars: string[];
}) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    updateLineAction,
    {},
  );
  const { open, answer, openPanel, closePanel } = useFormPanel(state);

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="secondary" onClick={openPanel}>
          Fabric and collar
        </Button>
        {answer.success ? <Notice tone="success" title={answer.success} /> : null}
      </div>
    );
  }

  return (
    <form
      action={submit}
      className="space-y-3 rounded-card bg-surface-sunken p-4 ring-1 ring-line/60"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="lineId" value={lineId} />

      <p className="text-sm font-medium">{itemName}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fabric" hint="Type anything; the list is only a shortcut.">
          <Input
            name="fabric"
            list="apparel-fabrics"
            defaultValue={fabric ?? ""}
            placeholder="e.g. Dri-fit"
          />
          <datalist id="apparel-fabrics">
            {fabrics.map((entry) => (
              <option key={entry} value={entry} />
            ))}
          </datalist>
        </Field>

        <Field label="Collar">
          <Input
            name="collar"
            list="apparel-collars"
            defaultValue={collar ?? ""}
            placeholder="e.g. Round neck"
          />
          <datalist id="apparel-collars">
            {collars.map((entry) => (
              <option key={entry} value={entry} />
            ))}
          </datalist>
        </Field>
      </div>

      {answer.error ? <Notice tone="attention" title={answer.error} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="quiet" onClick={closePanel}>
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
      {state.error ? (
        <div className="mt-2">
          <Notice tone="attention" title={state.error} />
        </div>
      ) : null}
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
  const { open, answer, openPanel, closePanel } = useFormPanel(state);

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" onClick={openPanel}>
          {isFirstPayment ? "Take a down payment" : "Take a payment"}
        </Button>
        {answer.success ? <Notice tone="success" title={answer.success} /> : null}
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />

      <Field
        label="Amount taken"
        hint={`${balanceLabel} is owed. Type what the customer actually handed over.`}
        error={answer.fieldErrors?.amount}
      >
        <Input name="amount" inputMode="decimal" placeholder="e.g. 1000" required autoFocus />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        {/*
          Starts on whichever this payment usually is - the first money on an
          order is a down payment - but it is a choice, not a deduction: a
          customer can hand over a second down payment on a job that has not
          started yet.
        */}
        <Field
          label="This payment is a"
          error={answer.fieldErrors?.paymentKind}
        >
          <Select
            name="paymentKind"
            defaultValue={isFirstPayment ? "down_payment" : "balance"}
          >
            <option value="down_payment">Down payment</option>
            <option value="balance">Balance</option>
          </Select>
        </Field>

        <Field label="Paid with" error={answer.fieldErrors?.source}>
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

      {answer.error ? <Notice tone="attention" title={answer.error} /> : null}
      {answer.success ? <Notice tone="success" title={answer.success} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Record the payment"}
        </Button>
        <Button type="button" variant="quiet" onClick={closePanel}>
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
  const { open, answer, openPanel, closePanel } = useFormPanel(state);

  if (answer.success) return <Notice tone="success" title={answer.success} />;

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPanel}
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
        error={answer.fieldErrors?.reason}
      >
        <Input name="reason" placeholder="e.g. cheque bounced" required autoFocus />
      </Field>

      {answer.error ? <Notice tone="attention" title={answer.error} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Saving..." : "Void the payment"}
        </Button>
        <Button type="button" variant="quiet" onClick={closePanel}>
          Keep it
        </Button>
      </div>
    </form>
  );
}
