"use client";

import { useActionState } from "react";

import { Button, Notice, TAP_AREA } from "@/components/ui";
import { formatManilaDate } from "@/lib/datetime";
import { canUndo, progress, stepViews } from "@/lib/online/production";
import type { OrderDetail, ProductionStage } from "@/lib/online/types";

import { markStageAction, undoStageAction, type OrderActionState } from "../actions";

/**
 * The step list on the order page (docs/spec.md 9.2).
 *
 * Only the CURRENT step has a button, and that is the whole rule made
 * visible: steps are done in order, so there is never a choice about which
 * one to press. A done step carries who did it and when; a future one carries
 * its description, so somebody new to the shop can read what it means.
 *
 * Gold is for the steps that are finished, red is the ring round the one
 * waiting - the only red on this box, because red here means "this is the one
 * that needs attention", not "something is wrong".
 */
export function ProductionBox({
  order,
  stages,
}: {
  order: OrderDetail;
  stages: ProductionStage[];
}) {
  const [markState, mark, marking] = useActionState<OrderActionState, FormData>(
    markStageAction,
    {},
  );
  const [undoState, undo, undoing] = useActionState<OrderActionState, FormData>(
    undoStageAction,
    {},
  );

  const steps = stepViews(stages, order.productionPath, order.production);
  const counted = progress(stages, order.productionPath, order.production);
  const undoable = canUndo(order, stages, order.productionPath, order.production);
  const current = steps.find((step) => step.state === "current");

  const beforeProduction = order.status === "new" || order.status === "quoted";

  return (
    <div className="space-y-5">
      {beforeProduction ? (
        <p className="text-sm text-muted">Production starts once the order is confirmed.</p>
      ) : null}

      <div>
        <p className="text-sm font-medium">
          {counted.done} of {counted.total} steps OK
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-seg">
          <div
            className="h-full rounded-full bg-gold"
            style={{ width: `${counted.percent}%` }}
          />
        </div>
      </div>

      <ol className="space-y-4">
        {steps.map((step) => (
          <li key={step.stage.key} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${
                step.state === "done"
                  ? step.row?.skipped
                    ? "bg-ink/10 text-muted"
                    : "bg-gold text-on-gold"
                  : step.state === "current"
                    ? "ring-2 ring-accent"
                    : "ring-1 ring-line"
              }`}
            >
              {step.state === "done" ? (step.row?.skipped ? "–" : "✓") : ""}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium ${
                  step.state === "future" ? "text-muted" : ""
                }`}
              >
                {step.stage.label}
              </p>

              {step.state === "done" ? (
                <p className="text-xs text-muted">
                  {step.row?.skipped ? "Not needed" : "OK"}
                  {step.row?.doneAt ? ` · ${formatManilaDate(step.row.doneAt)}` : ""}
                  {step.row?.doneByName ? ` · ${step.row.doneByName}` : ""}
                </p>
              ) : (
                <p className="text-xs text-muted">{step.stage.description}</p>
              )}

              {step.state === "current" && !beforeProduction ? (
                <form action={mark} className="mt-2 inline">
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="orderNo" value={order.orderNo} />
                  <input type="hidden" name="stageKey" value={step.stage.key} />
                  <Button type="submit" disabled={marking}>
                    {marking ? "Saving…" : "Mark OK"}
                  </Button>
                </form>
              ) : null}
            </div>
          </li>
        ))}

        <li className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${
              order.status === "ready_to_ship" || order.status === "completed"
                ? "bg-gold text-on-gold"
                : "ring-1 ring-line"
            }`}
          >
            {order.status === "ready_to_ship" || order.status === "completed" ? "✓" : ""}
          </span>
          <p className="text-sm font-medium">Ready to ship</p>
        </li>
      </ol>

      <div className="flex flex-wrap items-center gap-4">
        {current && !beforeProduction ? (
          <form action={mark} className="inline">
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="orderNo" value={order.orderNo} />
            <input type="hidden" name="stageKey" value={current.stage.key} />
            <input type="hidden" name="skipped" value="true" />
            <button
              type="submit"
              disabled={marking}
              className={`text-sm underline ${TAP_AREA}`}
            >
              {current.stage.label} is not needed for this order
            </button>
          </form>
        ) : null}

        {undoable.allowed && undoable.stage ? (
          <form action={undo} className="inline">
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="orderNo" value={order.orderNo} />
            <button
              type="submit"
              disabled={undoing}
              className={`text-sm underline ${TAP_AREA}`}
            >
              Undo {undoable.stage.label}
            </button>
          </form>
        ) : null}
      </div>

      {markState.error ? <Notice tone="attention" title={markState.error} /> : null}
      {undoState.error ? <Notice tone="attention" title={undoState.error} /> : null}
    </div>
  );
}
