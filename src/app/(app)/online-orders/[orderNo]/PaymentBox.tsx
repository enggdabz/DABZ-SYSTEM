"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice, Select, TAP_AREA } from "@/components/ui";
import { formatPesos } from "@/lib/money";
import {
  PAYMENT_METHOD_LABELS,
  RECORDABLE_PAYMENT_METHODS,
  type OrderDetail,
} from "@/lib/online/types";
import { isOpen } from "@/lib/online/status";
import { orderTotals, balanceLabel, totalLabel } from "@/lib/online/totals";
import { civilDateToISO, manilaToday } from "@/lib/period";

import { recordPaymentAction, voidPaymentAction, type OrderActionState } from "../actions";

/**
 * What has been paid, and taking the next one (docs/spec.md 9.2).
 *
 * The totals are added up from the order's own rows, and while any part of it
 * is still to be quoted there is NO BALANCE SHOWN AT ALL - a balance built on
 * a price nobody has given is a bill for the wrong amount.
 *
 * A voided payment stays on the list, struck through, and out of every sum.
 * Staff take a payment; only the owner or an admin takes one back, and the
 * database is what enforces that - the form is only hidden.
 */
export function PaymentBox({
  order,
  canVoid,
}: {
  order: OrderDetail;
  canVoid: boolean;
}) {
  const [state, submit, pending] = useActionState<OrderActionState, FormData>(
    recordPaymentAction,
    {},
  );

  const totals = orderTotals(order.items, order.quoteAmountCentavos, order.payments);
  const balance = balanceLabel(totals);

  return (
    <div className="space-y-5">
      <dl className="space-y-1 text-sm">
        <Row label="Total" value={totalLabel(totals)} strong />
        {totals.awaitingQuote ? null : (
          <>
            <Row label="Paid" value={formatPesos(totals.paidCentavos)} />
            <Row
              label="Balance"
              value={balance ?? "—"}
              attention={totals.balanceCentavos > 0}
              strong
            />
          </>
        )}
      </dl>

      {totals.awaitingQuote ? (
        <p className="text-sm text-muted">
          No balance yet &mdash; part of this order still has no price.
        </p>
      ) : null}

      {order.payments.length > 0 ? (
        <ul className="space-y-2 border-t border-line/60 pt-4 text-sm">
          {order.payments.map((payment) => (
            <li key={payment.id} className="space-y-1">
              <div
                className={`flex flex-wrap items-center justify-between gap-2 ${
                  payment.voidedAt ? "text-muted line-through" : ""
                }`}
              >
                <span>
                  {payment.paidOn} &middot; {PAYMENT_METHOD_LABELS[payment.method]}
                </span>
                <span className="font-medium">
                  {formatPesos(payment.amountCentavos)}
                </span>
              </div>
              {payment.voidedAt ? (
                <p className="text-xs text-attention">
                  <span aria-hidden="true">{"⚠"}</span> Voided
                  {payment.voidReason ? `: ${payment.voidReason}` : ""}
                </p>
              ) : canVoid ? (
                <VoidPayment paymentId={payment.id} orderNo={order.orderNo} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {isOpen(order.status) ? (
        <form action={submit} className="space-y-4 border-t border-line/60 pt-4">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="orderNo" value={order.orderNo} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" error={state.fieldErrors?.amount}>
              <Input name="amount" inputMode="decimal" placeholder="e.g. 2250" required />
            </Field>

            <Field label="How">
              <Select name="method" defaultValue="cash">
                {RECORDABLE_PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Date" hint="Today unless you change it.">
              <Input
                name="paidOn"
                type="date"
                defaultValue={civilDateToISO(manilaToday())}
              />
            </Field>

            <Field label="Note" hint="Optional.">
              <Input name="note" maxLength={200} />
            </Field>
          </div>

          {state.error ? <Notice tone="attention" title={state.error} /> : null}
          {state.success ? <Notice tone="success" title={state.success} /> : null}

          <Button type="submit" disabled={pending}>
            {pending ? "Recording…" : "Record payment"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
  attention = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  attention?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd
        className={`${strong ? "font-semibold" : ""} ${attention ? "text-accent" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function VoidPayment({ paymentId, orderNo }: { paymentId: string; orderNo: string }) {
  const [asking, setAsking] = useState(false);
  const [state, submit, pending] = useActionState<OrderActionState, FormData>(
    voidPaymentAction,
    {},
  );

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={`text-xs text-attention underline ${TAP_AREA}`}
      >
        Void this payment
      </button>
    );
  }

  return (
    <form action={submit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="orderNo" value={orderNo} />
      <div className="min-w-40 flex-1">
        <Input
          name="reason"
          placeholder="Why? e.g. recorded twice"
          aria-label="Why is it being voided?"
          required
        />
      </div>
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Voiding…" : "Void"}
      </Button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className={`text-xs underline ${TAP_AREA}`}
      >
        Keep
      </button>
      {state.error ? (
        <span className="text-xs text-attention">{state.error}</span>
      ) : null}
      {state.fieldErrors?.reason ? (
        <span className="text-xs text-attention">{state.fieldErrors.reason}</span>
      ) : null}
    </form>
  );
}
