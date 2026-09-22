import type { OrderStatus } from "@/lib/online/types";

/**
 * The status pill (docs/spec.md 5.3).
 *
 * Status is never colour alone. Every pill carries its own word, the dot
 * changes shape between the early states and the ones under way, and the only
 * red on it is the separate "Overdue" label beside it - red is reserved for
 * things that need attention, so a healthy order never wears it.
 */
const STYLE: Record<OrderStatus, string> = {
  new: "bg-ink/5 text-muted ring-line",
  quoted: "bg-gold/15 text-ink ring-gold",
  confirmed: "bg-ink/5 text-ink ring-ink",
  in_production: "bg-ink/10 text-ink ring-line",
  ready_to_ship: "bg-gold text-on-gold ring-gold",
  completed: "bg-ink/5 text-muted ring-line opacity-70",
  cancelled: "bg-ink/5 text-muted ring-line line-through opacity-70",
};

const LABEL: Record<OrderStatus, string> = {
  new: "New",
  quoted: "Quoted",
  confirmed: "Confirmed",
  in_production: "In production",
  ready_to_ship: "Ready to ship",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** A solid dot for work in hand, a ring for the states before it. */
const DOT: Record<OrderStatus, string> = {
  new: "○",
  quoted: "○",
  confirmed: "○",
  in_production: "●",
  ready_to_ship: "●",
  completed: "●",
  cancelled: "●",
};

export function StatusBadge({
  status,
  overdue = false,
}: {
  status: OrderStatus;
  overdue?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STYLE[status]}`}
      >
        <span aria-hidden="true">{DOT[status]}</span>
        {LABEL[status]}
      </span>
      {overdue ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
          <span aria-hidden="true">{"⚠"}</span> Overdue
        </span>
      ) : null}
    </span>
  );
}
