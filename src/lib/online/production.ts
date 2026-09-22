/**
 * The steps an order goes through (docs/spec.md 7.4).
 *
 * Two ideas hold the whole thing up.
 *
 * THE PATH IS DECIDED BY THE ORDER, NOT BY THE SCREEN. A DTF print is pressed
 * onto a finished shirt, so it never sees a pattern, a cutting table or a
 * sewing machine. An order of nothing but DTF goes the short way; ONE
 * sublimated jersey in it and the whole order goes the long way, because that
 * jersey still has to be cut and sewn. "Every item" is the test, and "any
 * item" would be the wrong one.
 *
 * ONLY THE CURRENT STEP CAN BE ACTED ON. The current step is the first one on
 * this order's path with no row against it - not "the one after the last row
 * written", which would let a mistake earlier in the list be ticked twice.
 *
 * Everything here is worked out from the rows. Nothing stores "which step is
 * it on", so there is nothing to fall out of step with the ticks themselves.
 */
import type { ProductionPath, ProductionRow, ProductionStage } from "./types";

/** The path this order takes: the short one only if EVERY item is DTF. */
export function orderPath(
  items: readonly { productionPath: ProductionPath }[],
): ProductionPath {
  if (items.length === 0) return "full";
  return items.every((item) => item.productionPath === "dtf") ? "dtf" : "full";
}

/** The stages on a path, in order. */
export function stagesForPath(
  stages: readonly ProductionStage[],
  path: ProductionPath,
): ProductionStage[] {
  return [...stages]
    .filter((stage) => path === "full" || stage.inDtfPath)
    .sort((a, b) => a.position - b.position);
}

export interface StepView {
  stage: ProductionStage;
  /** "done" includes a step marked not needed - both are finished. */
  state: "done" | "current" | "future";
  row: ProductionRow | null;
}

export function stepViews(
  stages: readonly ProductionStage[],
  path: ProductionPath,
  rows: readonly ProductionRow[],
): StepView[] {
  const byKey = new Map(rows.map((row) => [row.stageKey, row]));
  const path_stages = stagesForPath(stages, path);

  let currentFound = false;

  return path_stages.map((stage) => {
    const row = byKey.get(stage.key) ?? null;
    if (row) return { stage, state: "done" as const, row };

    if (!currentFound) {
      currentFound = true;
      return { stage, state: "current" as const, row: null };
    }
    return { stage, state: "future" as const, row: null };
  });
}

/** The step waiting to be done, or null when the order is finished. */
export function currentStage(
  stages: readonly ProductionStage[],
  path: ProductionPath,
  rows: readonly ProductionRow[],
): ProductionStage | null {
  return stepViews(stages, path, rows).find((step) => step.state === "current")?.stage
    ?? null;
}

/** The last step that was finished, which is the one undo takes back. */
export function lastDoneStage(
  stages: readonly ProductionStage[],
  path: ProductionPath,
  rows: readonly ProductionRow[],
): ProductionStage | null {
  const done = stepViews(stages, path, rows).filter((step) => step.state === "done");
  return done.length === 0 ? null : done[done.length - 1].stage;
}

export interface ProgressCount {
  done: number;
  total: number;
  /** 0 to 100, for the bar. */
  percent: number;
}

export function progress(
  stages: readonly ProductionStage[],
  path: ProductionPath,
  rows: readonly ProductionRow[],
): ProgressCount {
  const steps = stepViews(stages, path, rows);
  const done = steps.filter((step) => step.state === "done").length;
  const total = steps.length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/**
 * "Sewing · 5 of 8" - the one line that says where an order is, shown on the
 * orders table, the calendar and the board.
 *
 * Null for an order that is not in production: a stage note beside a New order
 * would be a claim that work had started.
 */
export function stageNote(
  stages: readonly ProductionStage[],
  path: ProductionPath,
  rows: readonly ProductionRow[],
): string | null {
  const current = currentStage(stages, path, rows);
  const counted = progress(stages, path, rows);
  if (current === null) return null;
  return `${current.label} · ${counted.done} of ${counted.total}`;
}

/** Can this step be ticked, and if not, why not. */
export function canMarkStage(
  order: { status: string },
  stages: readonly ProductionStage[],
  path: ProductionPath,
  rows: readonly ProductionRow[],
  stageKey: string,
): { allowed: boolean; reason: string | null } {
  if (order.status !== "confirmed" && order.status !== "in_production") {
    return {
      allowed: false,
      reason: "Production steps are ticked on a confirmed order that is not finished.",
    };
  }

  const current = currentStage(stages, path, rows);
  if (current === null) {
    return { allowed: false, reason: "Every step on this order is already done." };
  }
  if (current.key !== stageKey) {
    return { allowed: false, reason: `Steps are done in order. The next one is ${current.label}.` };
  }
  return { allowed: true, reason: null };
}

export function canUndo(
  order: { status: string },
  stages: readonly ProductionStage[],
  path: ProductionPath,
  rows: readonly ProductionRow[],
): { allowed: boolean; stage: ProductionStage | null } {
  if (order.status !== "in_production" && order.status !== "ready_to_ship") {
    return { allowed: false, stage: null };
  }
  const stage = lastDoneStage(stages, path, rows);
  return { allowed: stage !== null, stage };
}

/**
 * Where an order lands after a step is ticked.
 *
 * Pure, so the screen can say what will happen and the test can prove it
 * without a database. The database does the same arithmetic inside
 * `online_mark_stage`, and it is the one that counts.
 */
export function statusAfterMarking(
  stages: readonly ProductionStage[],
  path: ProductionPath,
  rowsAfter: readonly ProductionRow[],
): "in_production" | "ready_to_ship" {
  return currentStage(stages, path, rowsAfter) === null
    ? "ready_to_ship"
    : "in_production";
}
