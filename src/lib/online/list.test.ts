import { describe, expect, it } from "vitest";

import {
  applyOrderFilter,
  itemsLabel,
  listTiles,
  ORDERS_PER_PAGE,
  pageOfOrders,
  parseOrderFilter,
  parsePageNumber,
  sortOrders,
} from "./list";
import type { OrderStatus, OrderSummary } from "./types";

const today = { year: 2026, month: 9, day: 21 };

function order(over: Partial<OrderSummary> & { id: string }): OrderSummary {
  return {
    orderNo: `DA-${over.id}`,
    customerName: "A customer",
    mobile: "09171234567",
    status: "new",
    method: "pickup",
    dateNeeded: today,
    source: "website",
    createdAt: "2026-09-10T03:00:00Z",
    quoteAmountCentavos: null,
    fixedTotalCentavos: 100000,
    totalCentavos: 100000,
    paidCentavos: 0,
    balanceCentavos: 100000,
    pieces: 6,
    hasQuoteItems: false,
    firstItemName: "Jersey",
    extraItemCount: 0,
    doneStageKeys: [],
    productionPath: "full",
    ...over,
  };
}

describe("listTiles", () => {
  it("counts only open orders as open", () => {
    const tiles = listTiles(
      [
        order({ id: "1", status: "new" }),
        order({ id: "2", status: "completed" }),
        order({ id: "3", status: "cancelled" }),
      ],
      today,
    );
    expect(tiles.openOrders).toBe(1);
  });

  it("counts what still needs a price", () => {
    const tiles = listTiles(
      [
        order({ id: "1", status: "new", hasQuoteItems: true }),
        order({ id: "2", status: "new" }),
        // Already quoted, so it is not waiting on anybody.
        order({ id: "3", status: "quoted", hasQuoteItems: true, quoteAmountCentavos: 1 }),
      ],
      today,
    );
    expect(tiles.needAQuote).toBe(1);
  });

  it("counts the week ahead, including today, and not the past", () => {
    const tiles = listTiles(
      [
        order({ id: "1", dateNeeded: today }),
        order({ id: "2", dateNeeded: { year: 2026, month: 9, day: 28 } }),
        order({ id: "3", dateNeeded: { year: 2026, month: 9, day: 29 } }),
        order({ id: "4", dateNeeded: { year: 2026, month: 9, day: 20 } }),
      ],
      today,
    );
    expect(tiles.dueInSevenDays).toBe(2);
  });

  it("counts what is late, and never a packed order", () => {
    const late = { year: 2026, month: 9, day: 1 };
    const tiles = listTiles(
      [
        order({ id: "1", dateNeeded: late, status: "in_production" }),
        order({ id: "2", dateNeeded: late, status: "ready_to_ship" }),
        order({ id: "3", dateNeeded: late, status: "completed" }),
      ],
      today,
    );
    expect(tiles.overdue).toBe(1);
  });

  it("adds up only what is owed, never a credit against it", () => {
    /*
      One customer who overpaid by PHP 500 does not mean the shop is owed
      PHP 500 less. That is a credit on their order, and a different
      conversation.
    */
    const tiles = listTiles(
      [
        order({ id: "1", balanceCentavos: 100000 }),
        order({ id: "2", balanceCentavos: -50000 }),
      ],
      today,
    );
    expect(tiles.unpaidBalanceCentavos).toBe(100000);
  });

  it("leaves an unquoted order out of what is owed", () => {
    // Its "balance" is built on a price nobody has given, so adding it would
    // be a claim about money that has not been agreed.
    const tiles = listTiles(
      [order({ id: "1", hasQuoteItems: true, quoteAmountCentavos: null, balanceCentavos: 270000 })],
      today,
    );
    expect(tiles.unpaidBalanceCentavos).toBe(0);
  });
});

describe("applyOrderFilter", () => {
  const orders = [
    order({ id: "1", status: "new" }),
    order({ id: "2", status: "in_production", dateNeeded: { year: 2026, month: 9, day: 1 } }),
    order({ id: "3", status: "completed" }),
    order({ id: "4", status: "cancelled" }),
  ];

  it("shows the live work by default", () => {
    expect(applyOrderFilter(orders, "open", today).map((o) => o.id)).toEqual(["1", "2"]);
  });

  it("shows everything when asked", () => {
    expect(applyOrderFilter(orders, "all", today)).toHaveLength(4);
  });

  it("shows only what is late", () => {
    expect(applyOrderFilter(orders, "overdue", today).map((o) => o.id)).toEqual(["2"]);
  });

  it("shows one status at a time", () => {
    for (const status of ["new", "in_production", "completed", "cancelled"] as OrderStatus[]) {
      const shown = applyOrderFilter(orders, status, today);
      expect(shown.every((o) => o.status === status)).toBe(true);
    }
  });
});

describe("parseOrderFilter", () => {
  it("falls back to the live work rather than trusting the URL", () => {
    expect(parseOrderFilter("nonsense")).toBe("open");
    expect(parseOrderFilter(null)).toBe("open");
    expect(parseOrderFilter("overdue")).toBe("overdue");
  });
});

describe("sortOrders", () => {
  it("puts open work first, soonest due at the top", () => {
    const sorted = sortOrders(
      [
        order({ id: "done", status: "completed", dateNeeded: { year: 2026, month: 9, day: 1 } }),
        order({ id: "later", dateNeeded: { year: 2026, month: 10, day: 1 } }),
        order({ id: "sooner", dateNeeded: { year: 2026, month: 9, day: 22 } }),
      ],
      today,
    );
    expect(sorted.map((o) => o.id)).toEqual(["sooner", "later", "done"]);
  });

  it("reads finished work newest first", () => {
    const sorted = sortOrders(
      [
        order({ id: "old", status: "completed", dateNeeded: { year: 2026, month: 1, day: 1 } }),
        order({ id: "recent", status: "completed", dateNeeded: { year: 2026, month: 9, day: 1 } }),
      ],
      today,
    );
    expect(sorted.map((o) => o.id)).toEqual(["recent", "old"]);
  });

  it("leaves the caller's array alone", () => {
    const orders = [order({ id: "b" }), order({ id: "a" })];
    sortOrders(orders, today);
    expect(orders.map((o) => o.id)).toEqual(["b", "a"]);
  });
});

describe("itemsLabel", () => {
  it("names the first item and counts the rest", () => {
    expect(itemsLabel(order({ id: "1" }))).toBe("Jersey");
    expect(itemsLabel(order({ id: "1", extraItemCount: 2 }))).toBe("Jersey +2");
  });

  it("says plainly when an order has nothing in it", () => {
    expect(itemsLabel(order({ id: "1", firstItemName: null }))).toBe("No items");
  });
});

describe("one page of the list", () => {
  const orders = Array.from({ length: 214 }, (_, index) =>
    order({ id: String(index) }),
  );

  it("draws the first fifty, and says so", () => {
    const first = pageOfOrders(orders, 1);

    expect(first.rows).toHaveLength(ORDERS_PER_PAGE);
    expect(first.rows[0].orderNo).toBe("DA-0");
    expect(first.page).toBe(1);
    expect(first.pageCount).toBe(5);
    expect(first.total).toBe(214);
    expect(first.firstShown).toBe(1);
    expect(first.lastShown).toBe(50);
  });

  it("gives the short last page its real numbers", () => {
    const last = pageOfOrders(orders, 5);

    expect(last.rows).toHaveLength(14);
    expect(last.firstShown).toBe(201);
    expect(last.lastShown).toBe(214);
    expect(last.rows[0].orderNo).toBe("DA-200");
  });

  it("shows every order exactly once across the pages", () => {
    const seen = [1, 2, 3, 4, 5].flatMap(
      (page) => pageOfOrders(orders, page).rows,
    );

    expect(seen).toHaveLength(orders.length);
    expect(new Set(seen.map((row) => row.orderNo)).size).toBe(orders.length);
  });

  /*
    A bookmarked page number on a list that has since shrunk. Showing an empty
    list there would read as "nothing matches that filter", which is a
    different statement and an untrue one.
  */
  it("clamps a page past the end to the last one", () => {
    const asked = pageOfOrders(orders, 99);

    expect(asked.page).toBe(5);
    expect(asked.rows).toHaveLength(14);
  });

  it("clamps a page below the first", () => {
    expect(pageOfOrders(orders, 0).page).toBe(1);
    expect(pageOfOrders(orders, -3).page).toBe(1);
    expect(pageOfOrders(orders, Number.NaN).page).toBe(1);
  });

  it("copes with a shop that has no orders yet", () => {
    const empty = pageOfOrders([], 1);

    expect(empty.rows).toEqual([]);
    expect(empty.pageCount).toBe(1);
    expect(empty.total).toBe(0);
    // Not "1-0 of 0": there is no first row to number.
    expect(empty.firstShown).toBe(0);
    expect(empty.lastShown).toBe(0);
  });

  it("keeps a shop this size on one page", () => {
    const small = pageOfOrders(orders.slice(0, 6), 1);

    expect(small.pageCount).toBe(1);
    expect(small.rows).toHaveLength(6);
    expect(small.lastShown).toBe(6);
  });

  it("does not reorder what it was given", () => {
    const page = pageOfOrders(orders, 2);
    expect(page.rows.map((row) => row.orderNo)).toEqual(
      orders.slice(50, 100).map((row) => row.orderNo),
    );
  });
});

describe("the page number in the URL", () => {
  it("reads a number", () => {
    expect(parsePageNumber("3")).toBe(3);
  });

  it("falls back to the first page for anything else", () => {
    expect(parsePageNumber(undefined)).toBe(1);
    expect(parsePageNumber(null)).toBe(1);
    expect(parsePageNumber("")).toBe(1);
    expect(parsePageNumber("nonsense")).toBe(1);
    expect(parsePageNumber("0")).toBe(1);
    expect(parsePageNumber("-2")).toBe(1);
  });
});
