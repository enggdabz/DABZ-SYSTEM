"use client";

/**
 * "Take payment for an order", at the counter (Phase 10, spec 3.2).
 *
 * A customer who walks in to settle a jersey order or collect a laptop should
 * not send whoever is at the counter hunting through two other screens. So the
 * counter can find any open job and take money against it - through the same
 * two database functions the Apparel and DabzTech screens use, never a new one.
 *
 * WHY THE DIALOG IS PORTALLED INTO <body>
 * The top bar has a `backdrop-blur`, and a blur makes an element a containing
 * block. A `fixed inset-0` overlay rendered anywhere inside it measures itself
 * against the BAR rather than the screen - which is how the bill reminder once
 * ended up hanging 260px off the top of a phone. `createPortal` puts this in
 * the body, where `fixed` means what it says.
 */
import { useActionState, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Button, Field, Input, Notice, Select, TAP_AREA } from "@/components/ui";
import {
  DIVISION_DOOR_LABELS,
  defaultPaymentKind,
  searchPayableJobs,
  type PayableJob,
} from "@/lib/collections";
import { MONEY_SOURCES, MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { centavosToDecimalString, formatPesos, parsePesos } from "@/lib/money";

import { takeOrderPaymentAction, type OrderPaymentState } from "./actions";

export function TakeOrderPayment({
  jobs,
  downPaymentPercent,
}: {
  jobs: PayableJob[];
  /** Null while the owner has not set a policy. Nothing is then suggested. */
  downPaymentPercent: number | null;
}) {
  // Starts closed, so the server render never reaches `document.body` below -
  // the dialog can only be opened by a tap, which only happens in a browser.
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<PayableJob | null>(null);

  function close() {
    setOpen(false);
    setChosen(null);
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Take payment for an order
      </Button>

      {open
        ? createPortal(
            <Dialog
              jobs={jobs}
              chosen={chosen}
              onChoose={setChosen}
              onClose={close}
              downPaymentPercent={downPaymentPercent}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function Dialog({
  jobs,
  chosen,
  onChoose,
  onClose,
  downPaymentPercent,
}: {
  jobs: PayableJob[];
  chosen: PayableJob | null;
  onChoose: (job: PayableJob | null) => void;
  onClose: () => void;
  downPaymentPercent: number | null;
}) {
  // Escape closes it, the way every other dialog on a computer does.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Take payment for an order"
    >
      {/*
        Full height on a phone and a centred card from `sm` up. The inner
        scroll is on the body, not the whole sheet, so the heading and the
        Close button stay reachable without scrolling back up.
      */}
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-t-card bg-surface shadow-lg ring-1 ring-line/60 sm:max-h-[90vh] sm:rounded-card">
        <div className="flex items-start justify-between gap-4 border-b border-line/60 p-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Take payment for an order
            </h2>
            <p className="mt-1 text-sm text-muted">
              A Dabz Apparel job order or a DabzTech repair ticket with money
              still owed.
            </p>
          </div>
          <Button type="button" variant="quiet" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {chosen ? (
            <PaymentForm
              job={chosen}
              downPaymentPercent={downPaymentPercent}
              onBack={() => onChoose(null)}
              onDone={onClose}
            />
          ) : (
            <JobSearch jobs={jobs} onChoose={onChoose} />
          )}
        </div>
      </div>
    </div>
  );
}

function JobSearch({
  jobs,
  onChoose,
}: {
  jobs: PayableJob[];
  onChoose: (job: PayableJob) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchPayableJobs(jobs, query), [jobs, query]);

  if (jobs.length === 0) {
    return (
      <Notice tone="info" title="Nothing is waiting to be paid">
        <p>
          Every job order and repair ticket is either settled or cancelled. A
          job appears here as soon as it has a balance.
        </p>
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      <Field
        label="Find the order or ticket"
        hint="A job order number, a ticket number, a customer's name or a phone number."
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. A-260921-001, Reyes, 0917"
          autoFocus
        />
      </Field>

      {results.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing matches &ldquo;{query.trim()}&rdquo;. Try the customer&apos;s
          name, or part of the number.
        </p>
      ) : (
        <ul className="divide-y divide-line/60">
          {results.map((job) => (
            <li key={`${job.kind}:${job.id}`}>
              <button
                type="button"
                onClick={() => onChoose(job)}
                className="w-full rounded-control px-2 py-3 text-left transition-colors hover:bg-ink/5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-medium">
                    {job.customerName}
                    <span className="ml-2 rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-medium text-muted ring-1 ring-line">
                      {DIVISION_DOOR_LABELS[job.division]}
                    </span>
                  </span>
                  <span className="text-lg font-semibold tracking-tight">
                    {formatPesos(job.balanceCentavos)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {job.reference}
                  {job.detail ? ` · ${job.detail}` : ""} ·{" "}
                  {formatPesos(job.paidCentavos)} paid of{" "}
                  {formatPesos(job.totalCentavos)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PaymentForm({
  job,
  downPaymentPercent,
  onBack,
  onDone,
}: {
  job: PayableJob;
  downPaymentPercent: number | null;
  onBack: () => void;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState<OrderPaymentState, FormData>(
    takeOrderPaymentAction,
    {},
  );

  // Prefilled with the balance, because settling in full is the common case -
  // and editable, because a part payment is the other one.
  const [amount, setAmount] = useState(
    centavosToDecimalString(job.balanceCentavos),
  );
  const [source, setSource] = useState("cash_drawer");
  const [tendered, setTendered] = useState("");

  const amountCentavos = useMemo(() => {
    try {
      return parsePesos(amount);
    } catch {
      return null;
    }
  }, [amount]);

  const changeCentavos = useMemo(() => {
    if (source !== "cash_drawer" || tendered.trim() === "") return null;
    if (amountCentavos === null) return null;
    try {
      return parsePesos(tendered) - amountCentavos;
    } catch {
      return null;
    }
  }, [source, tendered, amountCentavos]);

  /*
    What the shop's own policy asks for, when there is one.

    It is a HINT and a warning, never a refusal: the owner may well have told
    the customer a smaller figure, and a counter that turned them away would be
    wrong more often than it was right. While the percentage is unset nothing
    is shown at all - an invented policy is worse than none.
  */
  const expectedDownPayment =
    job.division === "apparel" && downPaymentPercent !== null
      ? Math.ceil((job.totalCentavos * downPaymentPercent) / 100)
      : null;

  const [paymentKind, setPaymentKind] = useState<"down_payment" | "balance">(
    defaultPaymentKind({ nothingPaidYet: job.nothingPaidYet }),
  );

  const shortOfPolicy =
    expectedDownPayment !== null &&
    paymentKind === "down_payment" &&
    amountCentavos !== null &&
    job.paidCentavos + amountCentavos < expectedDownPayment;

  if (state.taken) {
    return (
      <div className="space-y-4">
        <Notice tone="success" title={state.taken.message} />
        <div className="flex flex-wrap gap-3">
          <a
            href={state.taken.receiptHref}
            className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90"
          >
            Print payment receipt
          </a>
          <Button type="button" variant="secondary" onClick={onDone}>
            Back to the counter
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="jobKind" value={job.kind} />
      <input type="hidden" name="jobId" value={job.id} />

      <div className="rounded-card bg-surface-sunken p-4 ring-1 ring-line/60">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">{job.customerName}</span>
          <span className="text-xs text-muted">{job.reference}</span>
        </div>
        <dl className="mt-3 space-y-1 text-sm">
          <Row label="Order total" value={formatPesos(job.totalCentavos)} />
          <Row label="Paid so far" value={formatPesos(job.paidCentavos)} />
          <div className="flex justify-between border-t border-line/60 pt-1 font-semibold">
            <dt>Balance</dt>
            <dd>{formatPesos(job.balanceCentavos)}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onBack}
          className={`mt-3 text-sm underline ${TAP_AREA}`}
        >
          Choose a different order
        </button>
      </div>

      <Field
        label="Amount taken"
        hint={`${formatPesos(job.balanceCentavos)} is owed. Type what the customer actually handed over.`}
        error={state.fieldErrors?.amount}
      >
        <Input
          name="amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
          autoFocus
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="This payment is a" error={state.fieldErrors?.paymentKind}>
          <Select
            name="paymentKind"
            value={paymentKind}
            onChange={(event) =>
              setPaymentKind(event.target.value as "down_payment" | "balance")
            }
          >
            <option value="down_payment">Down payment</option>
            <option value="balance">Balance</option>
          </Select>
        </Field>

        <Field label="Paid with" error={state.fieldErrors?.source}>
          <Select
            name="source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            {MONEY_SOURCES.map((option) => (
              <option key={option} value={option}>
                {option === "cash_drawer" ? "Cash" : MONEY_SOURCE_LABELS[option]}
              </option>
            ))}
          </Select>
        </Field>

        {source === "cash_drawer" ? (
          <Field label="Cash given" hint="Optional - only to work out the change.">
            <Input
              inputMode="decimal"
              value={tendered}
              onChange={(event) => setTendered(event.target.value)}
              placeholder="e.g. 1000"
            />
          </Field>
        ) : (
          <Field label="Reference number" hint="For GCash, Maya or a bank transfer.">
            <Input name="referenceNumber" />
          </Field>
        )}

        <Field label="Note">
          <Input name="note" />
        </Field>
      </div>

      {changeCentavos !== null ? (
        changeCentavos < 0 ? (
          <p className="flex items-start gap-1.5 text-sm text-attention">
            <span aria-hidden="true">{"⚠"}</span>
            <span>
              That is {formatPesos(Math.abs(changeCentavos))} less than the
              payment.
            </span>
          </p>
        ) : (
          <p className="text-sm">
            Change:{" "}
            <span className="font-semibold">{formatPesos(changeCentavos)}</span>
          </p>
        )
      ) : null}

      {expectedDownPayment !== null ? (
        <p className="text-sm text-muted">
          Down payment asked: {formatPesos(expectedDownPayment)} (
          {downPaymentPercent}%).
        </p>
      ) : null}

      {shortOfPolicy ? (
        <Notice
          tone="attention"
          title="This is under the down payment the shop asks for"
        >
          <p>
            The policy asks for {formatPesos(expectedDownPayment ?? 0)} and this
            brings the order to{" "}
            {formatPesos(job.paidCentavos + (amountCentavos ?? 0))}. Take it
            anyway if that is what was agreed &mdash; this is a note, not a
            refusal.
          </p>
        </Notice>
      ) : null}

      {state.error ? <Notice tone="attention" title={state.error} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Record the payment"}
        </Button>
        <Button type="button" variant="quiet" onClick={onBack}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
