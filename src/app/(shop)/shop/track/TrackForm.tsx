"use client";

import { useActionState } from "react";

import { formatPesos } from "@/lib/money";
import { formatCivilDate, parseISODate } from "@/lib/period";
import { customerProgress } from "@/lib/online/status";
import { progress, stagesForPath, stepViews } from "@/lib/online/production";
import type { OrderStatus, ProductionStage } from "@/lib/online/types";

import { trackOrderAction, type TrackState } from "../../actions";

/**
 * Track my order (docs/spec.md 8.5).
 *
 * Two boxes and one refusal. The order number AND the mobile it was placed
 * with have to match, and when they do not the message is the same sentence
 * whatever went wrong - anything that told "no such order" apart from "wrong
 * number" would be a way to find out which order numbers exist.
 *
 * What comes back is the customer's own order and nothing else: no staff
 * name, no internal note, no file link, no history.
 */
export function TrackForm({ stages }: { stages: ProductionStage[] }) {
  const [state, submit, pending] = useActionState<TrackState, FormData>(
    trackOrderAction,
    {},
  );

  return (
    <div className="space-y-8">
      <form action={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Order number</span>
          <input
            name="orderNo"
            required
            placeholder="DA-0042"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">
            The mobile number you used when ordering
          </span>
          <input
            name="mobile"
            required
            inputMode="tel"
            placeholder="09171234567"
            className={inputClass}
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-medium text-surface disabled:opacity-50"
        >
          {pending ? "Looking…" : "Find my order"}
        </button>
      </form>

      {state.error ? (
        <p className="flex items-start gap-1.5 rounded-card bg-surface px-4 py-3 text-sm text-accent ring-1 ring-accent/30">
          <span aria-hidden="true">{"⚠"}</span>
          <span>{state.error}</span>
        </p>
      ) : null}

      {state.result ? <Result result={state.result} stages={stages} /> : null}
    </div>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-control bg-surface-sunken px-3 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/50";

function Result({
  result,
  stages,
}: {
  result: NonNullable<TrackState["result"]>;
  stages: ProductionStage[];
}) {
  const status = result.status as OrderStatus;
  const dateNeeded = parseISODate(result.dateNeeded);

  const line = customerProgress({
    status,
    hasQuoteItems: result.hasQuoteItems,
  });

  const rows = result.doneStages.map((step) => ({
    stageKey: step.stageKey,
    doneAt: step.doneAt,
    doneByName: null,
    skipped: step.skipped,
  }));

  const steps = stepViews(stages, result.productionPath, rows);
  const counted = progress(stages, result.productionPath, rows);
  const pathLength = stagesForPath(stages, result.productionPath).length;

  const showSteps =
    result.showSteps &&
    (status === "in_production" || status === "ready_to_ship" || status === "completed");

  const awaitingQuote = result.hasQuoteItems && result.quoteAmountCentavos === null;

  return (
    <section className="space-y-6">
      <div className="rounded-card bg-surface p-5 ring-1 ring-line/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">{result.orderNo}</h2>
          <StatusBadge status={status} />
        </div>

        <ol className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {line.map((step) => (
            <li
              key={step.status}
              className={step.reached ? "font-medium" : "text-muted"}
            >
              <span aria-hidden="true">{step.reached ? "●" : "○"}</span>{" "}
              {step.label}
            </li>
          ))}
        </ol>

        <p className="mt-4 text-sm text-muted">
          Needed by{" "}
          {dateNeeded ? formatCivilDate(dateNeeded) : result.dateNeeded} &middot;{" "}
          {result.pieces} piece{result.pieces === 1 ? "" : "s"} &middot;{" "}
          {result.method === "delivery" ? "Delivery" : "Pick up"}
        </p>
      </div>

      {showSteps ? (
        <div className="rounded-card bg-surface p-5 ring-1 ring-line/60">
          <h3 className="font-semibold tracking-tight">Production progress</h3>
          <p className="mt-1 text-sm text-muted">
            {counted.done} of {pathLength} steps done
          </p>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-seg">
            <div
              className="h-full rounded-full bg-gold"
              style={{ width: `${counted.percent}%` }}
            />
          </div>

          <ul className="mt-5 space-y-3 text-sm">
            {steps.map((step) => (
              <li key={step.stage.key} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs ${
                    step.state === "done"
                      ? "bg-gold text-on-gold"
                      : step.state === "current"
                        ? "ring-2 ring-accent"
                        : "ring-1 ring-line"
                  }`}
                >
                  {step.state === "done" ? (step.row?.skipped ? "–" : "✓") : ""}
                </span>
                <span className={step.state === "future" ? "text-muted" : undefined}>
                  <span className="font-medium">{step.stage.customerLabel}</span>
                  {step.state === "done" ? (
                    <span className="block text-xs text-muted">
                      {step.row?.skipped ? "Not needed" : "OK"}
                      {step.row?.doneAt
                        ? ` · ${new Date(step.row.doneAt).toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                            timeZone: "Asia/Manila",
                          })}`
                        : ""}
                    </span>
                  ) : step.state === "current" ? (
                    <span className="block text-xs text-muted">In progress now</span>
                  ) : null}
                </span>
              </li>
            ))}
            <li className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs ${
                  status === "ready_to_ship" || status === "completed"
                    ? "bg-gold text-on-gold"
                    : "ring-1 ring-line"
                }`}
              >
                {status === "ready_to_ship" || status === "completed" ? "✓" : ""}
              </span>
              <span>
                <span className="font-medium">Ready to ship</span>
                <span className="block text-xs text-muted">
                  We message you as soon as your order is packed
                </span>
              </span>
            </li>
          </ul>
        </div>
      ) : null}

      <div className="rounded-card bg-surface p-5 ring-1 ring-line/60">
        <h3 className="font-semibold tracking-tight">Your items</h3>
        <ul className="mt-3 space-y-1 text-sm">
          {result.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-4">
              <span>
                {item.qty} &times; {item.productName}
              </span>
              <span className="text-muted">
                {item.pricingMode === "quote" ? "Quoted with your order" : ""}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1 border-t border-line/60 pt-4 text-sm">
          <div className="flex justify-between">
            <dt>Total</dt>
            <dd className="font-semibold">
              {awaitingQuote
                ? result.fixedTotalCentavos === 0
                  ? "To be quoted"
                  : `${formatPesos(result.fixedTotalCentavos)} + quote`
                : formatPesos(result.totalCentavos)}
            </dd>
          </div>
          {awaitingQuote ? null : (
            <>
              <div className="flex justify-between">
                <dt>Paid</dt>
                <dd>{formatPesos(result.paidCentavos)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Balance</dt>
                <dd
                  className={
                    result.balanceCentavos > 0 ? "font-semibold text-accent" : undefined
                  }
                >
                  {formatPesos(result.balanceCentavos)}
                </dd>
              </div>
            </>
          )}
        </dl>
      </div>
    </section>
  );
}

/**
 * The status pill (docs/spec.md 5.3).
 *
 * Never colour alone: every one of them carries a word, and the dot shape
 * changes too - an outline for the early states, solid ink for work under
 * way, solid gold for packed.
 */
function StatusBadge({ status }: { status: OrderStatus }) {
  const style: Record<OrderStatus, string> = {
    new: "bg-ink/5 text-muted ring-line",
    quoted: "bg-gold/15 text-ink ring-gold",
    confirmed: "bg-ink/5 text-ink ring-ink",
    in_production: "bg-ink/10 text-ink ring-line",
    ready_to_ship: "bg-gold text-on-gold ring-gold",
    completed: "bg-ink/5 text-muted ring-line",
    cancelled: "bg-ink/5 text-muted ring-line line-through",
  };

  const label: Record<OrderStatus, string> = {
    new: "New",
    quoted: "Quoted",
    confirmed: "Confirmed",
    in_production: "In production",
    ready_to_ship: "Ready to ship",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 ${style[status]}`}
    >
      <span aria-hidden="true">{status === "ready_to_ship" ? "●" : "○"}</span>
      {label[status]}
    </span>
  );
}
