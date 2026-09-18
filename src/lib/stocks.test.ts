import { describe, expect, it } from "vitest";

import {
  buildStockLines,
  countAdjustment,
  itemsNeedingAttention,
  movementHistory,
  quantityOnHand,
  stockStatus,
  totalStockValue,
  type StockItem,
  type StockMovement,
} from "./stocks";
import { parsePesos } from "./money";
import { parseQuantity } from "./quantity";

function item(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: "item-1",
    name: "Bond paper A4",
    unit: "ream",
    tag: "printshoppe",
    reorderLevel: parseQuantity("5"),
    unitCostCentavos: parsePesos("240"),
    photoPath: null,
    supplierId: null,
    note: null,
    active: true,
    ...overrides,
  };
}

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: "m1",
    stockItemId: "item-1",
    kind: "in",
    delta: parseQuantity("10"),
    unitCostCentavos: null,
    reason: null,
    occurredAt: "2026-09-18T01:00:00Z",
    createdBy: null,
    ...overrides,
  };
}

describe("quantityOnHand", () => {
  it("adds deliveries and subtracts withdrawals", () => {
    const onHand = quantityOnHand([
      movement({ id: "a", delta: parseQuantity("20") }),
      movement({ id: "b", kind: "out", delta: parseQuantity("-2.5") }),
      movement({ id: "c", kind: "out", delta: parseQuantity("-0.5") }),
    ]);
    expect(onHand).toBe(parseQuantity("17"));
  });

  it("is zero for an item nothing has happened to", () => {
    expect(quantityOnHand([])).toBe(0);
  });

  it("does not drift over many small movements", () => {
    // A tenth of a ream, a hundred times, in and out again.
    const movements = [
      ...Array.from({ length: 100 }, (_, i) =>
        movement({ id: `in-${i}`, delta: parseQuantity("0.1") }),
      ),
      ...Array.from({ length: 100 }, (_, i) =>
        movement({ id: `out-${i}`, kind: "out", delta: parseQuantity("-0.1") }),
      ),
    ];
    expect(quantityOnHand(movements)).toBe(0);
  });
});

describe("stockStatus", () => {
  it("warns at the reorder level, not below it", () => {
    // "Order more when you are down to 5" - at 5 you are already there.
    expect(stockStatus(item(), parseQuantity("5")).level).toBe("low");
    expect(stockStatus(item(), parseQuantity("5.001")).level).toBe("ok");
    expect(stockStatus(item(), parseQuantity("4")).level).toBe("low");
  });

  it("calls nothing on the shelf out of stock, whatever the reorder level", () => {
    expect(stockStatus(item(), 0).level).toBe("out");
    expect(stockStatus(item({ reorderLevel: null }), 0).level).toBe("out");
  });

  it("says so when the owner has not set a reorder level", () => {
    const status = stockStatus(item({ reorderLevel: null }), parseQuantity("3"));
    expect(status.level).toBe("no_reorder_level");
    expect(status.missingFigure).toBe(true);
    expect(status.needsAttention).toBe(true);
  });

  it("is quiet when there is plenty", () => {
    const status = stockStatus(item(), parseQuantity("40"));
    expect(status.level).toBe("ok");
    expect(status.needsAttention).toBe(false);
  });

  it("treats a negative quantity as out, not as plenty", () => {
    // A mis-recorded withdrawal can push a level below zero. It is still empty.
    expect(stockStatus(item(), parseQuantity("-2")).level).toBe("out");
  });
});

describe("buildStockLines", () => {
  const items = [item(), item({ id: "item-2", name: "Ink, black", unit: "litre" })];
  const movements = [
    movement({ id: "a", stockItemId: "item-1", delta: parseQuantity("20") }),
    movement({
      id: "b",
      stockItemId: "item-1",
      kind: "out",
      delta: parseQuantity("-3"),
      occurredAt: "2026-09-18T05:00:00Z",
    }),
    movement({ id: "c", stockItemId: "item-2", delta: parseQuantity("2.5") }),
  ];

  it("gives each item only its own movements", () => {
    const lines = buildStockLines(items, movements);
    expect(lines[0].onHand).toBe(parseQuantity("17"));
    expect(lines[1].onHand).toBe(parseQuantity("2.5"));
  });

  it("values the shelf at the unit cost", () => {
    const lines = buildStockLines(items, movements);
    // 17 reams at ₱240.00
    expect(lines[0].valueCentavos).toBe(parsePesos("4080"));
  });

  it("leaves the value unknown rather than calling it zero", () => {
    const lines = buildStockLines([item({ unitCostCentavos: null })], movements);
    expect(lines[0].valueCentavos).toBeNull();
  });

  it("finds the latest movement without assuming the order they arrive in", () => {
    const lines = buildStockLines(items, [...movements].reverse());
    expect(lines[0].lastMovementAt).toBe("2026-09-18T05:00:00Z");
    expect(lines[0].movementCount).toBe(2);
  });

  it("reports an item nothing has happened to as empty, not missing", () => {
    const lines = buildStockLines([item({ id: "item-9" })], movements);
    expect(lines[0].onHand).toBe(0);
    expect(lines[0].lastMovementAt).toBeNull();
    expect(lines[0].status.level).toBe("out");
  });
});

describe("totalStockValue", () => {
  it("adds up what is priced and counts what is not", () => {
    const lines = buildStockLines(
      [
        item(),
        item({ id: "item-2", unitCostCentavos: null }),
        item({ id: "item-3", unitCostCentavos: parsePesos("50") }),
      ],
      [
        movement({ id: "a", stockItemId: "item-1", delta: parseQuantity("10") }),
        movement({ id: "b", stockItemId: "item-2", delta: parseQuantity("4") }),
        movement({ id: "c", stockItemId: "item-3", delta: parseQuantity("3") }),
      ],
    );

    const total = totalStockValue(lines);
    // 10 × ₱240 + 3 × ₱50. The unpriced item is left out and counted instead.
    expect(total.valueCentavos).toBe(parsePesos("2550"));
    expect(total.unpricedCount).toBe(1);
  });

  it("is zero, not broken, with nothing in stock", () => {
    expect(totalStockValue([])).toEqual({ valueCentavos: 0, unpricedCount: 0 });
  });
});

describe("itemsNeedingAttention", () => {
  it("puts empty first, then low, then the ones with no level set", () => {
    const lines = buildStockLines(
      [
        item({ id: "low", name: "Low" }),
        item({ id: "empty", name: "Empty" }),
        item({ id: "unknown", name: "Unknown", reorderLevel: null }),
        item({ id: "fine", name: "Fine" }),
      ],
      [
        movement({ id: "a", stockItemId: "low", delta: parseQuantity("2") }),
        movement({ id: "c", stockItemId: "unknown", delta: parseQuantity("9") }),
        movement({ id: "d", stockItemId: "fine", delta: parseQuantity("50") }),
      ],
    );

    expect(itemsNeedingAttention(lines).map((line) => line.item.id)).toEqual([
      "empty",
      "low",
      "unknown",
    ]);
  });

  it("ignores items the owner has stopped counting", () => {
    const lines = buildStockLines([item({ active: false })], []);
    expect(itemsNeedingAttention(lines)).toHaveLength(0);
  });
});

describe("countAdjustment", () => {
  it("works out the difference so the person only types what they see", () => {
    expect(
      countAdjustment({ onHand: parseQuantity("17"), counted: parseQuantity("14") }),
    ).toEqual({ delta: parseQuantity("-3"), changed: true });

    expect(
      countAdjustment({ onHand: parseQuantity("14"), counted: parseQuantity("17") }),
    ).toEqual({ delta: parseQuantity("3"), changed: true });
  });

  it("says nothing changed when the count matches", () => {
    expect(
      countAdjustment({ onHand: parseQuantity("14"), counted: parseQuantity("14") }),
    ).toEqual({ delta: 0, changed: false });
  });
});

describe("movementHistory", () => {
  it("shows the running total so a wrong figure can be traced", () => {
    const history = movementHistory([
      movement({ id: "b", kind: "out", delta: parseQuantity("-3"), occurredAt: "2026-09-18T05:00:00Z" }),
      movement({ id: "a", delta: parseQuantity("20"), occurredAt: "2026-09-18T01:00:00Z" }),
      movement({ id: "c", delta: parseQuantity("6"), occurredAt: "2026-09-19T01:00:00Z" }),
    ]);

    expect(history.map((row) => [row.movement.id, row.runningTotal])).toEqual([
      ["a", parseQuantity("20")],
      ["b", parseQuantity("17")],
      ["c", parseQuantity("23")],
    ]);
  });

  it("ends on the same figure the stock list shows", () => {
    const movements = [
      movement({ id: "a", delta: parseQuantity("20") }),
      movement({ id: "b", kind: "out", delta: parseQuantity("-2.5") }),
    ];
    const history = movementHistory(movements);
    expect(history[history.length - 1].runningTotal).toBe(quantityOnHand(movements));
  });
});
