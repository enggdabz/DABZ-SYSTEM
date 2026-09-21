"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, Field, Input, Notice, Select, TAP_AREA } from "@/components/ui";
import { MONEY_SOURCES, MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { centavosToDecimalString } from "@/lib/money";
import {
  TICKET_FLOW,
  TICKET_STATUS_LABELS,
  UNIT_KINDS,
  UNIT_KIND_LABELS,
  UNLOCK_METHODS,
  UNLOCK_METHOD_LABELS,
  type TicketStatus,
  type UnitKind,
  type UnlockMethod,
} from "@/lib/repairs";

import {
  addLineAction,
  createTicketAction,
  fitPartAction,
  recordPaymentAction,
  removeLineAction,
  setTicketStatusAction,
  updateTicketAction,
  voidPaymentAction,
  type RepairState,
} from "./actions";

export interface CustomerChoice {
  id: string;
  name: string;
}

export interface ServiceChoice {
  id: string;
  name: string;
  unitKind: UnitKind | "any";
  priceCentavos: number | null;
}

export interface StockChoice {
  id: string;
  name: string;
  unit: string;
  unitCostCentavos: number | null;
}

/**
 * The note that appears wherever a password might be expected.
 *
 * Said out loud rather than left as an absence, because a technician who does
 * not find the box will otherwise write it in the note field instead.
 */
function NoPasswordNote() {
  return (
    <Notice tone="info" title="We never write down a password">
      There is no box for one anywhere in this system, on purpose. If the unit
      needs unlocking, the customer does it when they leave it or when we call.
    </Notice>
  );
}

export function NewTicketForm({
  customers,
  today,
}: {
  customers: CustomerChoice[];
  today: string;
}) {
  const [state, submit, pending] = useActionState<RepairState, FormData>(
    createTicketAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (state.ticketId) {
    return (
      <Notice tone="success" title={state.success ?? "Ticket opened."}>
        <Link href={`/repairs/${state.ticketId}`} className={`underline ${TAP_AREA}`}>
          Open it and print the claim stub
        </Link>
      </Notice>
    );
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Take a unit in
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Who is leaving it" error={state.fieldErrors?.customerName}>
          <Input name="customerName" placeholder="e.g. Marcelo Uy" required autoFocus />
        </Field>

        <Field label="Contact number">
          <Input name="contactNumber" inputMode="tel" placeholder="0917 555 0000" />
        </Field>

        <Field label="Customer record" hint="Optional. Links their details.">
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
          label="What kind of machine"
          hint="DabzTech takes Epson printers, laptops and desktops."
          error={state.fieldErrors?.unitKind}
        >
          <Select name="unitKind" defaultValue="laptop">
            {UNIT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {UNIT_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Brand">
          <Input name="brand" placeholder="e.g. Acer" />
        </Field>

        <Field label="Model">
          <Input name="model" placeholder="e.g. Aspire 5" />
        </Field>

        <Field label="Serial number">
          <Input name="serialNumber" />
        </Field>

        <Field
          label="Promised date"
          hint="Leave empty if you have not promised one."
        >
          <Input name="promisedOn" type="date" min={today} />
        </Field>
      </div>

      <Field
        label="What is wrong with it"
        hint="The customer's own words, not a diagnosis."
        error={state.fieldErrors?.problem}
      >
        <Input name="problem" placeholder="e.g. will not turn on" required />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="What came with it"
          hint="Charger, bag, cable. Worth writing down now."
        >
          <Input name="accessories" placeholder="e.g. charger only" />
        </Field>

        <Field
          label="Condition on arrival"
          hint="Scratches, missing screws. Protects you both."
        >
          <Input name="conditionNote" placeholder="e.g. scratch on the lid" />
        </Field>
      </div>

      <Field
        label="How do we get into it?"
        error={state.fieldErrors?.unlockMethod}
      >
        <Select name="unlockMethod" defaultValue="not_needed">
          {UNLOCK_METHODS.map((method) => (
            <option key={method} value={method}>
              {UNLOCK_METHOD_LABELS[method]}
            </option>
          ))}
        </Select>
      </Field>

      <NoPasswordNote />

      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Opening..." : "Open the ticket"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function TicketDetailsForm({
  ticket,
  customers,
}: {
  ticket: {
    id: string;
    customerName: string;
    customerId: string | null;
    contactNumber: string | null;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    accessories: string | null;
    conditionNote: string | null;
    diagnosis: string | null;
    unlockMethod: UnlockMethod;
    promisedOn: string | null;
    note: string | null;
  };
  customers: CustomerChoice[];
}) {
  const [state, submit, pending] = useActionState<RepairState, FormData>(
    updateTicketAction,
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
    <form action={submit} className="space-y-4">
      <input type="hidden" name="ticketId" value={ticket.id} />

      <Field
        label="What we found"
        hint="The diagnosis, in your words. This is what the quote is based on."
      >
        <Input name="diagnosis" defaultValue={ticket.diagnosis ?? ""} autoFocus />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Who is leaving it">
          <Input name="customerName" defaultValue={ticket.customerName} required />
        </Field>
        <Field label="Contact number">
          <Input name="contactNumber" defaultValue={ticket.contactNumber ?? ""} />
        </Field>
        <Field label="Customer record">
          <Select name="customerId" defaultValue={ticket.customerId ?? ""}>
            <option value="">Not linked</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Promised date" hint="Leave empty if none was promised.">
          <Input name="promisedOn" type="date" defaultValue={ticket.promisedOn ?? ""} />
        </Field>
        <Field label="Brand">
          <Input name="brand" defaultValue={ticket.brand ?? ""} />
        </Field>
        <Field label="Model">
          <Input name="model" defaultValue={ticket.model ?? ""} />
        </Field>
        <Field label="Serial number">
          <Input name="serialNumber" defaultValue={ticket.serialNumber ?? ""} />
        </Field>
        <Field label="What came with it">
          <Input name="accessories" defaultValue={ticket.accessories ?? ""} />
        </Field>
      </div>

      <Field label="Condition on arrival">
        <Input name="conditionNote" defaultValue={ticket.conditionNote ?? ""} />
      </Field>

      <Field label="How do we get into it?" error={state.fieldErrors?.unlockMethod}>
        <Select name="unlockMethod" defaultValue={ticket.unlockMethod}>
          {UNLOCK_METHODS.map((method) => (
            <option key={method} value={method}>
              {UNLOCK_METHOD_LABELS[method]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Note">
        <Input name="note" defaultValue={ticket.note ?? ""} />
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

export function TicketStatusForm({
  ticketId,
  status,
  warrantyDays,
}: {
  ticketId: string;
  status: TicketStatus;
  warrantyDays: number;
}) {
  const [state, submit, pending] = useActionState<RepairState, FormData>(
    setTicketStatusAction,
    {},
  );
  const [refusing, setRefusing] = useState<null | "declined" | "unrepairable">(null);

  const index = TICKET_FLOW.indexOf(status);
  const next =
    index >= 0 && index < TICKET_FLOW.length - 1 ? TICKET_FLOW[index + 1] : null;

  if (refusing) {
    return (
      <form action={submit} className="space-y-3">
        <input type="hidden" name="ticketId" value={ticketId} />
        <input type="hidden" name="status" value={refusing} />

        <Field
          label={
            refusing === "declined"
              ? "What did the customer decide?"
              : "Why can it not be repaired?"
          }
          hint="Kept on the ticket. The unit is still here until somebody collects it."
          error={state.fieldErrors?.declineReason}
        >
          <Input
            name="declineReason"
            placeholder={
              refusing === "declined"
                ? "e.g. too expensive, will buy new"
                : "e.g. board is corroded beyond repair"
            }
            required
            autoFocus
          />
        </Field>

        {state.error ? <Notice tone="attention" title={state.error} /> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
          <Button type="button" variant="quiet" onClick={() => setRefusing(null)}>
            Never mind
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <form action={submit} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="ticketId" value={ticketId} />

        {next ? (
          <Button type="submit" name="status" value={next} disabled={pending}>
            {pending
              ? "Saving..."
              : next === "released"
                ? `Release with a ${warrantyDays}-day warranty`
                : `Move to "${TICKET_STATUS_LABELS[next]}"`}
          </Button>
        ) : null}

        {/* Going back a step happens: a "fixed" unit comes back off the bench. */}
        {index > 0 ? (
          <Button
            type="submit"
            name="status"
            value={TICKET_FLOW[index - 1]}
            variant="secondary"
            disabled={pending}
          >
            Back to &ldquo;{TICKET_STATUS_LABELS[TICKET_FLOW[index - 1]]}&rdquo;
          </Button>
        ) : null}
      </form>

      {status !== "released" ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="quiet" onClick={() => setRefusing("declined")}>
            Customer said no
          </Button>
          <Button
            type="button"
            variant="quiet"
            onClick={() => setRefusing("unrepairable")}
          >
            Cannot be repaired
          </Button>
        </div>
      ) : null}

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}
    </div>
  );
}

export function AddLineForm({
  ticketId,
  services,
}: {
  ticketId: string;
  services: ServiceChoice[];
}) {
  const [state, submit, pending] = useActionState<RepairState, FormData>(
    addLineAction,
    {},
  );
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<ServiceChoice | null>(null);

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          Add a charge
        </Button>
        {state.success ? <Notice tone="success" title={state.success} /> : null}
      </div>
    );
  }

  return (
    <form
      action={submit}
      className="space-y-3 rounded-card bg-surface-sunken p-4 ring-1 ring-line/60"
    >
      <input type="hidden" name="ticketId" value={ticketId} />

      <Field label="What for" error={state.fieldErrors?.name}>
        <Select
          name="serviceId"
          defaultValue=""
          onChange={(event) =>
            setPicked(
              services.find((service) => service.id === event.target.value) ?? null,
            )
          }
        >
          <option value="">Choose...</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
              {service.unitKind !== "any"
                ? ` (${UNIT_KIND_LABELS[service.unitKind]})`
                : ""}
              {service.priceCentavos === null
                ? " — no price set"
                : ` — ₱${centavosToDecimalString(service.priceCentavos)}`}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Price"
          hint="Leave empty if it is not priced yet - the ticket still works."
          error={state.fieldErrors?.unitPrice}
        >
          <Input
            name="unitPrice"
            inputMode="decimal"
            key={`price-${picked?.id ?? "none"}`}
            defaultValue={
              picked?.priceCentavos != null
                ? centavosToDecimalString(picked.priceCentavos)
                : ""
            }
            placeholder="e.g. 500"
          />
        </Field>

        <Field label="How many" error={state.fieldErrors?.quantity}>
          <Input name="quantity" inputMode="numeric" defaultValue="1" />
        </Field>
      </div>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding..." : "Add the charge"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function FitPartForm({
  ticketId,
  stockItems,
}: {
  ticketId: string;
  stockItems: StockChoice[];
}) {
  const [state, submit, pending] = useActionState<RepairState, FormData>(
    fitPartAction,
    {},
  );
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<StockChoice | null>(null);

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          Fit a part
        </Button>
        {state.success ? <Notice tone="success" title={state.success} /> : null}
      </div>
    );
  }

  return (
    <form
      action={submit}
      className="space-y-3 rounded-card bg-surface-sunken p-4 ring-1 ring-line/60"
    >
      <input type="hidden" name="ticketId" value={ticketId} />

      <Field
        label="From stock"
        hint="Choosing one takes it off the shelf at the same moment it is charged."
      >
        <Select
          name="stockItemId"
          defaultValue=""
          onChange={(event) =>
            setPicked(
              stockItems.find((item) => item.id === event.target.value) ?? null,
            )
          }
        >
          <option value="">Not from stock</option>
          {stockItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.unitCostCentavos === null
                ? ""
                : ` — ₱${centavosToDecimalString(item.unitCostCentavos)} / ${item.unit}`}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Part name"
        hint="Needed only when it did not come off your own shelf."
        error={state.fieldErrors?.name}
      >
        <Input
          name="name"
          key={`name-${picked?.id ?? "none"}`}
          defaultValue={picked?.name ?? ""}
          placeholder="e.g. laptop battery"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="How many" error={state.fieldErrors?.quantity}>
          <Input name="quantity" inputMode="numeric" defaultValue="1" />
        </Field>

        <Field
          label="Price to the customer"
          hint="What you are charging, not what it cost you."
          error={state.fieldErrors?.unitPrice}
        >
          <Input name="unitPrice" inputMode="decimal" placeholder="e.g. 240" />
        </Field>
      </div>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Fit and charge it"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function RemoveLineForm({
  ticketId,
  lineId,
}: {
  ticketId: string;
  lineId: string;
}) {
  const [state, submit, pending] = useActionState<RepairState, FormData>(
    removeLineAction,
    {},
  );

  if (state.success) {
    return <span className="text-xs text-muted">{state.success}</span>;
  }

  return (
    <form action={submit} className="inline">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="lineId" value={lineId} />
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
  ticketId,
  balanceLabel,
  today,
  isFirstPayment,
}: {
  ticketId: string;
  balanceLabel: string;
  today: string;
  /** Decides which way the down payment / balance choice starts. */
  isFirstPayment: boolean;
}) {
  const [state, submit, pending] = useActionState<RepairState, FormData>(
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
      <input type="hidden" name="ticketId" value={ticketId} />

      <Field
        label="Amount taken"
        hint={`${balanceLabel} is owed. Type what the customer actually handed over.`}
        error={state.fieldErrors?.amount}
      >
        <Input name="amount" inputMode="decimal" placeholder="e.g. 650" required autoFocus />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        {/*
          A DabzTech payment says whether it is a down payment or a balance
          since Phase 10, the same as an apparel one. Payments taken before
          that read as plain "Payment" - nobody can now say which they were,
          so nothing guesses on their behalf.
        */}
        <Field label="This payment is a" error={state.fieldErrors?.paymentKind}>
          <Select
            name="paymentKind"
            defaultValue={isFirstPayment ? "down_payment" : "balance"}
          >
            <option value="down_payment">Down payment</option>
            <option value="balance">Balance</option>
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
  ticketId,
  paymentId,
}: {
  ticketId: string;
  paymentId: string;
}) {
  const [state, submit, pending] = useActionState<RepairState, FormData>(
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
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="paymentId" value={paymentId} />

      <Field label="Why is it being taken back?" error={state.fieldErrors?.reason}>
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
