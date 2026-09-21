import { describe, expect, it } from "vitest";

import { boardColumns, boardRowNote } from "./board";
import type { OrderStatus, OrderSummary, ProductionStage } from "./types";

const today = { year: 2026, month: 9, day: 21 };

const STAGES: ProductionStage[] = [
  { key: "design", label: "Design", customerLabel: "Design", description: "", position: 1, inDtfPath: true },
  { key: "pattern", label: "Pattern", customerLabel: "Pattern", description: "", position: 2, inDtfPath: false },
  { key: "print", label: "Print", customerLabel: "Print", description: "", position: 3, inDtfPath: true },
  { key: "heat_press", label: "Heat press", customerLabel: "Heat press", description: "", position: 4, inDtfPath: true },
  { key: "tabas", label: "Tabas", customerLabel: "Cutting", description: "", position: 5, inDtfPath: false },
  { key: "sewing", label: "Sewing", customerLabel: "Sewing", description: "", position: 6, inDtfPath: false },
  { key: "quality_check", label: "Quality check", customerLabel: "Quality check", description: "", position: 7, inDtfPath: true },
  { key: "packaging", label: "Packaging", customerLabel: "Packaging", description: "", position: 8, inDtfPath: true },
];

function order(over: Partial<OrderSummary> & { id: string }): OrderSummary {
  return {
    orderNo: `DA-${over.id}`,
    customerName: "A customer",
    mobile: "09171234567",
    status: "in_production" as OrderStatus,
    method: "pickup",
    dateNeeded: today,
    source: "website",
    createdAt: "2026-09-10T03:00:00Z",
    quoteAmountCentavos: null,
    fixedTotalCentavos: 0,
    totalCentavos: 0,
    paidCentavos: 0,
    balanceCentavos: 0,
    pieces: 24,
    hasQuoteItems: false,
    firstItemName: "Jersey",
    extraItemCount: 0,
    doneStageKeys: [],
    productionPath: "full",
    ...over,
  };
}

describe("boardColumns", () => {
  it("has a card before the steps, one per step, and one after", () => {
    const columns = boardColumns([], STAGES, today);
    expect(columns).toHaveLength(10);
    expect(columns[0].key).toBe("waiting");
    expect(columns[1].eyebrow).toBe("Step 1");
    expect(columns[8].eyebrow).toBe("Step 8");
    expect(columns[9].key).toBe("ready");
  });

  it("puts a confirmed order in Waiting to start", () => {
    const columns = boardColumns([order({ id: "1", status: "confirmed" })], STAGES, today);
    expect(columns[0].orders.map((o) => o.id)).toEqual(["1"]);
  });

  it("puts an order in the card for the step it is WAITING for", () => {
    const columns = boardColumns(
      [order({ id: "1", doneStageKeys: ["design", "pattern"] })],
      STAGES,
      today,
    );
    const print = columns.find((column) => column.key === "print");
    expect(print?.orders.map((o) => o.id)).toEqual(["1"]);
    const pattern = columns.find((column) => column.key === "pattern");
    expect(pattern?.orders).toHaveLength(0);
  });

  it("never shows a DTF order under a step it does not have", () => {
    /*
      A DTF print never sees a cutting table. Its current step after Heat press
      is Quality check, and it must not appear under Tabas just because Tabas
      is the next stage with no row against it.
    */
    const columns = boardColumns(
      [
        order({
          id: "1",
          productionPath: "dtf",
          doneStageKeys: ["design", "print", "heat_press"],
        }),
      ],
      STAGES,
      today,
    );
    expect(columns.find((c) => c.key === "tabas")?.orders).toHaveLength(0);
    expect(columns.find((c) => c.key === "quality_check")?.orders.map((o) => o.id)).toEqual([
      "1",
    ]);
  });

  it("puts a packed order in Ready to ship", () => {
    const columns = boardColumns(
      [order({ id: "1", status: "ready_to_ship" })],
      STAGES,
      today,
    );
    expect(columns[9].orders.map((o) => o.id)).toEqual(["1"]);
  });

  it("leaves finished and unconfirmed work off the board entirely", () => {
    const columns = boardColumns(
      [
        order({ id: "1", status: "new" }),
        order({ id: "2", status: "quoted" }),
        order({ id: "3", status: "completed" }),
        order({ id: "4", status: "cancelled" }),
      ],
      STAGES,
      today,
    );
    expect(columns.every((column) => column.orders.length === 0)).toBe(true);
  });

  it("sorts each card by what is due soonest", () => {
    const columns = boardColumns(
      [
        order({ id: "late", status: "confirmed", dateNeeded: { year: 2026, month: 10, day: 1 } }),
        order({ id: "soon", status: "confirmed", dateNeeded: { year: 2026, month: 9, day: 22 } }),
      ],
      STAGES,
      today,
    );
    expect(columns[0].orders.map((o) => o.id)).toEqual(["soon", "late"]);
  });
});

describe("boardRowNote", () => {
  it("says the size of the job and when it is due", () => {
    expect(boardRowNote(order({ id: "1" }), () => "Sep 25")).toBe("24 pcs · due Sep 25");
  });
});
