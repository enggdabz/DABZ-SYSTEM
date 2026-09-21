"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice, TAP_AREA } from "@/components/ui";
import { centavosToDecimalString } from "@/lib/money";
import { availableMoves, type MovableStatus } from "@/lib/online/status";
import type { OrderDetail } from "@/lib/online/types";
import { civilDateToISO } from "@/lib/period";

import {
  sendQuoteAction,
  setDateNeededAction,
  setOrderStatusAction,
  type OrderActionState,
} from "../actions";

const MOVE_LABELS: Record<MovableStatus, string> = {
  quoted: "Send quote",
  confirmed: "Mark as Confirmed",
  in_production: "Start production",
  completed: "Mark as Completed",
  cancelled: "Cancel order",
};

/**
 * Move this order (docs/spec.md 9.2).
 *
 * It offers only the moves that are actually allowed from where the order is,
 * which is worked out by the same function the database checks with. There is
 * no button for "Ready to ship" anywhere, and that is deliberate: an order
 * becomes ready by the work being finished, never by somebody saying so.
 */
export function OrderMoves({ order }: { order: OrderDetail }) {
  const moves = availableMoves(order);
  const needsQuote = order.hasQuoteItems && order.quoteAmountCentavos === null;

  return (
    <div className="space-y-6">
      {order.hasQuoteItems ? <QuoteForm order={order} /> : null}

      {order.status === "in_production" ? (
        <p className="text-sm text-muted">
          In production. Tick the steps in the Production box. The order becomes
          Ready to ship when the last step is OK.
        </p>
      ) : null}

      {moves.length === 0 ? (
        <p className="text-sm text-muted">
          {order.status === "in_production"
            ? "Nothing to press here while the work is being done."
            : "This order is finished."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {moves
            .filter((move) => move !== "cancelled")
            .map((move) => (
              <MoveButton
                key={move}
                order={order}
                move={move}
                disabled={move === "confirmed" && needsQuote}
              />
            ))}
        </div>
      )}

      {moves.includes("cancelled") ? <CancelOrder order={order} /> : null}

      <DateForm order={order} />
    </div>
  );
}

function MoveButton({
  order,
  move,
  disabled,
}: {
  order: OrderDetail;
  move: MovableStatus;
  disabled: boolean;
}) {
  const [state, submit, pending] = useActionState<OrderActionState, FormData>(
    setOrderStatusAction,
    {},
  );

  return (
    <form action={submit} className="inline">
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="orderNo" value={order.orderNo} />
      <input type="hidden" name="status" value={move} />
      <Button type="submit" disabled={pending || disabled}>
        {pending ? "Working…" : MOVE_LABELS[move]}
      </Button>
      {state.error ? (
        <span className="ml-3 text-xs text-attention">{state.error}</span>
      ) : null}
    </form>
  );
}

/**
 * Cancelling, with a reason and a second tap.
 *
 * The reason is not optional. A cancelled order on the calendar with nothing
 * beside it is a question somebody will ask the owner in three weeks.
 */
function CancelOrder({ order }: { order: OrderDetail }) {
  const [asking, setAsking] = useState(false);
  const [state, submit, pending] = useActionState<OrderActionState, FormData>(
    setOrderStatusAction,
    {},
  );

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={`text-sm text-attention underline ${TAP_AREA}`}
      >
        Cancel order
      </button>
    );
  }

  return (
    <form action={submit} className="space-y-3 rounded-card bg-attention-bg p-4">
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="orderNo" value={order.orderNo} />
      <input type="hidden" name="status" value="cancelled" />

      <Field
        label="Why is it being cancelled?"
        hint="Written into the order's history, so it still makes sense later."
        error={state.fieldErrors?.reason}
      >
        <Input name="reason" required maxLength={200} />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Cancelling…" : "Yes, cancel it"}
        </Button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className={`text-sm underline ${TAP_AREA}`}
        >
          Keep the order
        </button>
      </div>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
    </form>
  );
}

function QuoteForm({ order }: { order: OrderDetail }) {
  const [state, submit, pending] = useActionState<OrderActionState, FormData>(
    sendQuoteAction,
    {},
  );

  const locked = order.status !== "new" && order.status !== "quoted";

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="orderNo" value={order.orderNo} />

      <Field
        label="Quote for the whole order"
        hint={
          order.fixedTotalCentavos > 0
            ? "This is added to the priced lines, not instead of them."
            : "What the customer agreed to pay."
        }
        error={state.fieldErrors?.amount}
      >
        <Input
          name="amount"
          inputMode="decimal"
          placeholder="e.g. 8000"
          disabled={locked}
          defaultValue={
            order.quoteAmountCentavos === null
              ? ""
              : centavosToDecimalString(order.quoteAmountCentavos)
          }
        />
      </Field>

      {locked ? (
        <p className="text-xs text-muted">
          The quote is settled once the order is confirmed.
        </p>
      ) : (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : order.quoteAmountCentavos === null ? "Send quote" : "Change the quote"}
        </Button>
      )}

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}
    </form>
  );
}

function DateForm({ order }: { order: OrderDetail }) {
  const [state, submit, pending] = useActionState<OrderActionState, FormData>(
    setDateNeededAction,
    {},
  );

  if (order.status === "completed" || order.status === "cancelled") return null;

  return (
    <form action={submit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="orderNo" value={order.orderNo} />

      <div className="w-48">
        <Field label="Date needed" error={state.fieldErrors?.dateNeeded}>
          <Input
            name="dateNeeded"
            type="date"
            defaultValue={civilDateToISO(order.dateNeeded)}
          />
        </Field>
      </div>

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Moving…" : "Move the date"}
      </Button>

      {state.error ? (
        <span className="text-xs text-attention">{state.error}</span>
      ) : null}
      {state.success ? <span className="text-xs text-success">{state.success}</span> : null}
    </form>
  );
}
