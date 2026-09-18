/**
 * Stock levels and low-stock warnings (spec 14, 17.15).
 *
 * THE RULE THAT MATTERS MOST HERE
 * A stock level is never stored. It is added up from every movement ever
 * recorded, in the same way a payslip adds up its own rows. A stored figure
 * and a list of movements can disagree, and when they do there is no way to
 * tell which one is lying - so there is only ever one of them.
 *
 * The cost of that is one sum per item; the benefit is that the number on the
 * screen can always be explained by the history underneath it.
 */
import type { ExpenseTag } from "./divisions";
import { costOfQuantity, sumQuantities, type Thousandths } from "./quantity";
import { sumCentavos, type Centavos } from "./money";

/** Why a movement happened. */
export const MOVEMENT_KINDS = ["in", "out", "count", "adjustment"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  in: "Received",
  out: "Taken out",
  count: "Counted",
  adjustment: "Correction",
};

export interface StockItem {
  id: string;
  name: string;
  /** How the owner measures it: ream, litre, piece, pack. */
  unit: string;
  tag: ExpenseTag;
  /**
   * Warn at or below this level. Null is a real state, not zero: the owner has
   * not decided the reorder level yet, and guessing one would raise confident
   * warnings at the wrong time.
   */
  reorderLevel: Thousandths | null;
  /** What one unit costs. Null until the owner says - never invented. */
  unitCostCentavos: Centavos | null;
  photoPath: string | null;
  supplierId: string | null;
  note: string | null;
  active: boolean;
}

export interface StockMovement {
  id: string;
  stockItemId: string;
  kind: MovementKind;
  /** Positive received, negative taken out. */
  delta: Thousandths;
  unitCostCentavos: Centavos | null;
  reason: string | null;
  occurredAt: string;
  createdBy: string | null;
}

/** How much of this item is on hand, from its movements alone. */
export function quantityOnHand(
  movements: readonly StockMovement[],
): Thousandths {
  return sumQuantities(movements.map((movement) => movement.delta));
}

export type StockLevel =
  | "out"
  | "low"
  | "ok"
  /** On hand, but the owner has not set a level to compare against. */
  | "no_reorder_level";

export interface StockStatus {
  level: StockLevel;
  label: string;
  /** True for anything the owner should look at: out, low, or unknowable. */
  needsAttention: boolean;
  /** True when the reason is a missing figure rather than a missing material. */
  missingFigure: boolean;
}

/**
 * At or below the reorder level counts as low, not below it.
 *
 * A reorder level of 5 reams means "order more when you are down to 5" - by
 * the time you are below it you are already late.
 */
export function stockStatus(
  item: Pick<StockItem, "reorderLevel">,
  onHand: Thousandths,
): StockStatus {
  if (onHand <= 0) {
    return {
      level: "out",
      label: "Out of stock",
      needsAttention: true,
      missingFigure: false,
    };
  }

  if (item.reorderLevel === null) {
    return {
      level: "no_reorder_level",
      label: "No reorder level set",
      needsAttention: true,
      missingFigure: true,
    };
  }

  if (onHand <= item.reorderLevel) {
    return {
      level: "low",
      label: "Running low",
      needsAttention: true,
      missingFigure: false,
    };
  }

  return { level: "ok", label: "In stock", needsAttention: false, missingFigure: false };
}

export interface StockLine {
  item: StockItem;
  onHand: Thousandths;
  status: StockStatus;
  /** What is on hand is worth this much. Null while the unit cost is unknown. */
  valueCentavos: Centavos | null;
  movementCount: number;
  lastMovementAt: string | null;
}

/** Joins items to their movements, ready for the screen. */
export function buildStockLines(
  items: readonly StockItem[],
  movements: readonly StockMovement[],
): StockLine[] {
  const byItem = new Map<string, StockMovement[]>();
  for (const movement of movements) {
    const list = byItem.get(movement.stockItemId);
    if (list) list.push(movement);
    else byItem.set(movement.stockItemId, [movement]);
  }

  return items.map((item) => {
    const own = byItem.get(item.id) ?? [];
    const onHand = quantityOnHand(own);

    // Movements arrive newest first from the database; the last one in time is
    // whichever has the largest timestamp, so this does not assume an order.
    let lastMovementAt: string | null = null;
    for (const movement of own) {
      if (!lastMovementAt || movement.occurredAt > lastMovementAt) {
        lastMovementAt = movement.occurredAt;
      }
    }

    return {
      item,
      onHand,
      status: stockStatus(item, onHand),
      valueCentavos:
        item.unitCostCentavos === null
          ? null
          : costOfQuantity(onHand, item.unitCostCentavos),
      movementCount: own.length,
      lastMovementAt,
    };
  });
}

/** What everything on the shelves is worth, and what cannot be counted. */
export function totalStockValue(lines: readonly StockLine[]): {
  valueCentavos: Centavos;
  /** Items left out because nobody has said what they cost. */
  unpricedCount: number;
} {
  const priced = lines.filter((line) => line.valueCentavos !== null);

  return {
    valueCentavos: sumCentavos(priced.map((line) => line.valueCentavos as Centavos)),
    unpricedCount: lines.length - priced.length,
  };
}

/** The items worth showing on the Overview, worst first. */
export function itemsNeedingAttention(
  lines: readonly StockLine[],
): StockLine[] {
  const order: Record<StockLevel, number> = {
    out: 0,
    low: 1,
    no_reorder_level: 2,
    ok: 3,
  };

  return lines
    .filter((line) => line.item.active && line.status.needsAttention)
    .sort((a, b) => {
      const byLevel = order[a.status.level] - order[b.status.level];
      return byLevel !== 0 ? byLevel : a.item.name.localeCompare(b.item.name);
    });
}

/**
 * The movement a physical count implies.
 *
 * The owner types what is actually on the shelf; the system works out the
 * difference rather than asking for it, because "we have 14" is something a
 * person can see and "we are 3 short" is arithmetic.
 */
export function countAdjustment(options: {
  onHand: Thousandths;
  counted: Thousandths;
}): { delta: Thousandths; changed: boolean } {
  const delta = options.counted - options.onHand;
  return { delta, changed: delta !== 0 };
}

/**
 * Running quantity after each movement, oldest first, for the history list.
 *
 * Shown so a wrong figure can be traced to the movement that caused it.
 */
export function movementHistory(
  movements: readonly StockMovement[],
): { movement: StockMovement; runningTotal: Thousandths }[] {
  const oldestFirst = [...movements].sort((a, b) =>
    a.occurredAt === b.occurredAt
      ? a.id.localeCompare(b.id)
      : a.occurredAt.localeCompare(b.occurredAt),
  );

  let runningTotal: Thousandths = 0;
  return oldestFirst.map((movement) => {
    runningTotal += movement.delta;
    return { movement, runningTotal };
  });
}
