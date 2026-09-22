"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";

import {
  markStageAction,
  setOrderStatusAction,
  type OrderActionState,
} from "../actions";

/**
 * The one button on a board row.
 *
 * Which action it is depends on which card it is in, and all three end up in
 * the same database functions as the order page - so an order moved from here
 * and an order moved from there cannot end up in different states.
 */
export function BoardButton({
  orderId,
  orderNo,
  action,
  stageKey,
}: {
  orderId: string;
  orderNo: string;
  action: "start" | "ok" | "complete";
  stageKey: string | null;
}) {
  const [state, submit, pending] = useActionState<OrderActionState, FormData>(
    action === "ok" ? markStageAction : setOrderStatusAction,
    {},
  );

  return (
    <form action={submit} className="inline">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNo" value={orderNo} />
      {action === "ok" ? (
        <input type="hidden" name="stageKey" value={stageKey ?? ""} />
      ) : (
        <input
          type="hidden"
          name="status"
          value={action === "start" ? "in_production" : "completed"}
        />
      )}

      <Button type="submit" disabled={pending} className="!px-3 !py-1.5 text-xs">
        {pending ? "…" : action === "start" ? "Start" : action === "ok" ? "OK" : "Completed"}
      </Button>

      {state.error ? (
        <span className="mt-1 block text-xs text-attention">{state.error}</span>
      ) : null}
    </form>
  );
}
