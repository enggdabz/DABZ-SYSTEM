/**
 * Reading apparel projects across migration 0026: a deleted project is left
 * out, and a database that has not had 0026 yet must give EVERY project rather
 * than an empty list - an empty list reads as "no projects", which is the one
 * wrong answer worth never giving.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const order = {
  id: "order-1",
  order_number: "A-261001-001",
  ordered_on: "2026-10-01",
  customer_id: null,
  team_name: "Wildcats",
  status: "confirmed",
  promised_on: null,
  layout_note: null,
  note: null,
  cancel_reason: null,
  created_by: null,
};

let columnExists = true;
const filtered: boolean[] = [];

function builder(table: string) {
  let usedFilter = false;
  const self: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit"]) self[method] = () => self;
  self.is = () => {
    usedFilter = true;
    return self;
  };
  self.then = (resolve: (value: unknown) => unknown) => {
    if (table !== "apparel_orders") return resolve({ data: [], error: null });
    if (usedFilter) {
      filtered.push(true);
      return resolve(
        columnExists
          ? { data: [order], error: null }
          : {
              data: null,
              error: { code: "42703", message: "column apparel_orders.deleted_at does not exist" },
            },
      );
    }
    return resolve({ data: [order], error: null });
  };
  return self;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: (table: string) => builder(table) }),
}));

import { getApparelOrders } from "./apparel";

beforeEach(() => {
  columnExists = true;
  filtered.length = 0;
});

describe("reading apparel projects across 0026", () => {
  it("leaves deleted projects out by filtering on deleted_at", async () => {
    const orders = await getApparelOrders();
    expect(orders).toHaveLength(1);
    expect(filtered).toHaveLength(1);
  });

  it("gives every project - not an empty list - when 0026 has not been applied", async () => {
    columnExists = false;
    const orders = await getApparelOrders({ limit: 5 });
    expect(orders.map((entry) => entry.order.orderNumber)).toEqual(["A-261001-001"]);
  });

  it("does not filter at all when a receipt asks for deleted projects too", async () => {
    const orders = await getApparelOrders({ includeDeleted: true });
    expect(orders).toHaveLength(1);
    expect(filtered).toHaveLength(0);
  });
});
