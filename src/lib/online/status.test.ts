import { describe, expect, it } from "vitest";

import {
  availableMoves,
  awaitingQuote,
  canMoveTo,
  customerProgress,
  isOpen,
  isOverdue,
  needsQuote,
} from "./status";
import type { OrderStatus } from "./types";

const order = (
  status: OrderStatus,
  extra: { hasQuoteItems?: boolean; quoteAmountCentavos?: number | null } = {},
) => ({
  status,
  hasQuoteItems: extra.hasQuoteItems ?? false,
  quoteAmountCentavos: extra.quoteAmountCentavos ?? null,
});

describe("isOpen", () => {
  it("counts everything that is not finished or called off", () => {
    expect(isOpen("new")).toBe(true);
    expect(isOpen("ready_to_ship")).toBe(true);
    expect(isOpen("completed")).toBe(false);
    expect(isOpen("cancelled")).toBe(false);
  });
});

describe("isOverdue", () => {
  const today = { year: 2026, month: 9, day: 21 };

  it("is late when the date has passed", () => {
    expect(
      isOverdue({ status: "in_production", dateNeeded: { year: 2026, month: 9, day: 20 } }, today),
    ).toBe(true);
  });

  it("is not late on the day itself", () => {
    expect(
      isOverdue({ status: "in_production", dateNeeded: today }, today),
    ).toBe(false);
  });

  it("is never late once it is packed", () => {
    /*
      The shop has done its part. Red beside a packed order points at the wrong
      person - it is the customer who has not come for it.
    */
    expect(
      isOverdue(
        { status: "ready_to_ship", dateNeeded: { year: 2026, month: 1, day: 1 } },
        today,
      ),
    ).toBe(false);
  });

  it("is never late once it is finished or called off", () => {
    const old = { year: 2026, month: 1, day: 1 };
    expect(isOverdue({ status: "completed", dateNeeded: old }, today)).toBe(false);
    expect(isOverdue({ status: "cancelled", dateNeeded: old }, today)).toBe(false);
  });

  it("uses the Manila calendar date it is handed, not a UTC one", () => {
    /*
      A UTC comparison makes an order look overdue a day early. This module
      only ever takes a CivilDate, which is how that mistake is made
      impossible rather than merely avoided - the caller reads "today" through
      manilaToday().
    */
    const manilaFirst = { year: 2026, month: 10, day: 1 };
    expect(
      isOverdue(
        { status: "confirmed", dateNeeded: { year: 2026, month: 9, day: 30 } },
        manilaFirst,
      ),
    ).toBe(true);
    expect(
      isOverdue({ status: "confirmed", dateNeeded: manilaFirst }, manilaFirst),
    ).toBe(false);
  });
});

describe("needsQuote", () => {
  it("is a new order with something still to be priced", () => {
    expect(needsQuote(order("new", { hasQuoteItems: true }))).toBe(true);
  });

  it("is not a new order that was priced on the page", () => {
    expect(needsQuote(order("new"))).toBe(false);
  });

  it("is not an order somebody has already quoted", () => {
    expect(
      needsQuote(order("quoted", { hasQuoteItems: true, quoteAmountCentavos: 100 })),
    ).toBe(false);
  });
});

describe("awaitingQuote", () => {
  it("is true while a quote item has no figure against it", () => {
    expect(awaitingQuote({ hasQuoteItems: true, quoteAmountCentavos: null })).toBe(true);
    expect(awaitingQuote({ hasQuoteItems: true, quoteAmountCentavos: 0 })).toBe(false);
    expect(awaitingQuote({ hasQuoteItems: false, quoteAmountCentavos: null })).toBe(false);
  });
});

describe("canMoveTo", () => {
  it("confirms a new order that was priced on the page", () => {
    expect(canMoveTo(order("new"), "confirmed").allowed).toBe(true);
  });

  it("refuses to confirm an order nobody has quoted", () => {
    const check = canMoveTo(order("new", { hasQuoteItems: true }), "confirmed");
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Send the quote first");
  });

  it("confirms it once the quote is in", () => {
    expect(
      canMoveTo(
        order("quoted", { hasQuoteItems: true, quoteAmountCentavos: 800000 }),
        "confirmed",
      ).allowed,
    ).toBe(true);
  });

  it("starts production only from a confirmed order", () => {
    expect(canMoveTo(order("confirmed"), "in_production").allowed).toBe(true);
    expect(canMoveTo(order("new"), "in_production").allowed).toBe(false);
    expect(canMoveTo(order("quoted"), "in_production").allowed).toBe(false);
  });

  it("completes only an order that is packed", () => {
    expect(canMoveTo(order("ready_to_ship"), "completed").allowed).toBe(true);
    expect(canMoveTo(order("in_production"), "completed").allowed).toBe(false);
  });

  it("cancels only before the work has started", () => {
    expect(canMoveTo(order("new"), "cancelled").allowed).toBe(true);
    expect(canMoveTo(order("quoted"), "cancelled").allowed).toBe(true);
    expect(canMoveTo(order("confirmed"), "cancelled").allowed).toBe(true);
    expect(canMoveTo(order("in_production"), "cancelled").allowed).toBe(false);
    expect(canMoveTo(order("completed"), "cancelled").allowed).toBe(false);
  });

  it("lets a quote be revised while the order is still quoted", () => {
    expect(canMoveTo(order("quoted"), "quoted").allowed).toBe(true);
    expect(canMoveTo(order("confirmed"), "quoted").allowed).toBe(false);
  });

  it("treats a finished order as finished", () => {
    for (const target of ["confirmed", "in_production", "completed", "cancelled"] as const) {
      expect(canMoveTo(order("completed"), target).allowed).toBe(false);
      expect(canMoveTo(order("cancelled"), target).allowed).toBe(false);
    }
  });
});

describe("availableMoves", () => {
  it("offers confirm and cancel on a new order, and nothing else", () => {
    expect(availableMoves(order("new"))).toEqual(["confirmed", "cancelled"]);
  });

  it("offers start and cancel on a confirmed one", () => {
    expect(availableMoves(order("confirmed"))).toEqual(["in_production", "cancelled"]);
  });

  it("offers nothing at all while the work is being done", () => {
    // Ready to ship is reached by finishing the steps, never by a button.
    expect(availableMoves(order("in_production"))).toEqual([]);
  });

  it("offers only complete once it is packed", () => {
    expect(availableMoves(order("ready_to_ship"))).toEqual(["completed"]);
  });

  it("offers nothing on a finished order", () => {
    expect(availableMoves(order("completed"))).toEqual([]);
    expect(availableMoves(order("cancelled"))).toEqual([]);
  });
});

describe("customerProgress", () => {
  it("leaves Quoted out of an order that never had one", () => {
    // A step that was skipped on purpose reads as a step that went wrong.
    const line = customerProgress({ status: "confirmed", hasQuoteItems: false });
    expect(line.map((step) => step.status)).toEqual([
      "new",
      "confirmed",
      "in_production",
      "ready_to_ship",
      "completed",
    ]);
  });

  it("includes it when the order had something to price", () => {
    const line = customerProgress({ status: "quoted", hasQuoteItems: true });
    expect(line.map((step) => step.status)).toContain("quoted");
    expect(line.filter((step) => step.reached).map((step) => step.status)).toEqual([
      "new",
      "quoted",
    ]);
  });

  it("marks everything up to where the order has got to", () => {
    const line = customerProgress({ status: "in_production", hasQuoteItems: false });
    expect(line.filter((step) => step.reached).map((step) => step.status)).toEqual([
      "new",
      "confirmed",
      "in_production",
    ]);
  });

  it("marks nothing as reached on a cancelled order", () => {
    const line = customerProgress({ status: "cancelled", hasQuoteItems: false });
    expect(line.some((step) => step.reached)).toBe(false);
  });
});
