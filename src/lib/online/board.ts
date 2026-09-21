/**
 * The production board (docs/spec.md 9.3).
 *
 * One card per step, and an order sits in the card for the step it is WAITING
 * FOR - not the one it has just finished. Tap OK and it moves to the next
 * card by itself, which is the whole idea: the board is the queue, and nobody
 * has to remember where anything was.
 *
 * Two cards are not steps. "Waiting to start" holds confirmed orders nobody
 * has begun, and "Ready to ship" holds the ones that are packed. Both are
 * real places an order sits in a shop, so both are on the board.
 */
import { compareCivilDates, type CivilDate } from "@/lib/period";

import { currentStage, stagesForPath } from "./production";
import type { OrderSummary, ProductionStage } from "./types";

export interface BoardColumn {
  key: string;
  /** "Waiting to start", "Step 3", "Ready to ship". */
  eyebrow: string;
  title: string;
  description: string;
  orders: OrderSummary[];
  /** What the button on each row says, or null when there is no action. */
  action: "start" | "ok" | "complete";
  /** The stage the button ticks, for the step cards. */
  stageKey: string | null;
}

export function boardColumns(
  orders: readonly OrderSummary[],
  stages: readonly ProductionStage[],
  today: CivilDate,
): BoardColumn[] {
  const byDate = (a: OrderSummary, b: OrderSummary) =>
    compareCivilDates(a.dateNeeded, b.dateNeeded) || a.orderNo.localeCompare(b.orderNo);

  const ordered = [...stages].sort((a, b) => a.position - b.position);

  const columns: BoardColumn[] = [
    {
      key: "waiting",
      eyebrow: "Waiting to start",
      title: "Confirmed, not begun",
      description:
        "The customer has agreed. Tap Start and the order moves to the first step.",
      orders: orders.filter((order) => order.status === "confirmed").sort(byDate),
      action: "start",
      stageKey: null,
    },
  ];

  for (const [index, stage] of ordered.entries()) {
    columns.push({
      key: stage.key,
      eyebrow: `Step ${index + 1}`,
      title: stage.label,
      description: stage.description,
      orders: orders
        .filter((order) => {
          if (order.status !== "in_production") return false;

          /*
            An order only appears under a step that is ON ITS OWN PATH. A DTF
            order never waits for Tabas, so it must not show up in that card
            just because Tabas is the first stage with no row against it.
          */
          const onPath = stagesForPath(stages, order.productionPath).some(
            (candidate) => candidate.key === stage.key,
          );
          if (!onPath) return false;

          const current = currentStage(
            stages,
            order.productionPath,
            order.doneStageKeys.map((stageKey) => ({
              stageKey,
              doneAt: "",
              doneByName: null,
              skipped: false,
            })),
          );
          return current?.key === stage.key;
        })
        .sort(byDate),
      action: "ok",
      stageKey: stage.key,
    });
  }

  columns.push({
    key: "ready",
    eyebrow: "Ready to ship",
    title: "Packed and waiting",
    description: "Tap Completed once the customer has it.",
    orders: orders.filter((order) => order.status === "ready_to_ship").sort(byDate),
    action: "complete",
    stageKey: null,
  });

  void today;
  return columns;
}

/** "24 pcs · due Sep 25" */
export function boardRowNote(
  order: OrderSummary,
  formatDate: (date: CivilDate) => string,
): string {
  return `${order.pieces} pcs · due ${formatDate(order.dateNeeded)}`;
}
