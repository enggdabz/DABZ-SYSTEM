/**
 * The server side of deleting an apparel project that has had money taken.
 * What the database itself refuses is proven against a real PostgreSQL in
 * supabase/tests/22_apparel_delete_refund.test.sql; this proves what the
 * ACTION does when called directly, with the database faked at its edge.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const from = vi.fn(() => {
  throw new Error("The action must not touch a table directly.");
});
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ rpc, from }),
}));

const requireOwnerOrAdmin = vi.fn();
vi.mock("@/lib/auth/dal", () => ({
  requireOwnerOrAdmin: () => requireOwnerOrAdmin(),
  requirePermission: vi.fn(),
  getSettings: vi.fn(),
}));

const recordAudit = vi.fn((entry: { action: string }) => Promise.resolve(entry));
vi.mock("@/lib/audit", () => ({
  recordAudit: (entry: { action: string }) => recordAudit(entry),
}));

const getApparelOrder = vi.fn();
vi.mock("@/lib/data/apparel", () => ({
  getApparelOrder: (id: string) => getApparelOrder(id),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

import { deleteApparelProjectWithMoneyAction } from "./actions";

const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const owner = { id: "owner-1", username: "eddie", role: "owner" };
const admin = { id: "admin-1", username: "maria", role: "admin" };

function detail(payments: { amountCentavos: number }[]) {
  return {
    order: { id: ORDER_ID, orderNumber: "A-261001-001", teamName: "Wildcats", status: "confirmed" },
    totals: { totalCentavos: 260000 },
    payments: payments.map((payment, index) => ({
      id: `pay-${index}`,
      paidOn: "2026-10-01",
      ...payment,
    })),
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOwnerOrAdmin.mockResolvedValue(owner);
  getApparelOrder.mockResolvedValue(detail([{ amountCentavos: 100000 }]));
  rpc.mockResolvedValue({ data: [{ refunded_centavos: 0 }], error: null });
});

describe("deleteApparelProjectWithMoneyAction", () => {
  it("turns an admin away before the database is asked", async () => {
    requireOwnerOrAdmin.mockResolvedValue(admin);

    const result = await deleteApparelProjectWithMoneyAction(
      {},
      form({ orderId: ORDER_ID, reason: "Wrong team", refund: "refund" }),
    );

    expect(result.error).toMatch(/Only the owner/);
    expect(rpc).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("requires a reason", async () => {
    const result = await deleteApparelProjectWithMoneyAction(
      {},
      form({ orderId: ORDER_ID, reason: "  ", refund: "keep" }),
    );
    expect(result.error).toMatch(/why/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires the refund choice when a payment is live - there is no default", async () => {
    const result = await deleteApparelProjectWithMoneyAction(
      {},
      form({ orderId: ORDER_ID, reason: "Duplicate" }),
    );
    expect(result.error).toMatch(/refund it or keep the money/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not ask for a choice when nothing live is paid, and never sends a refund", async () => {
    getApparelOrder.mockResolvedValue(detail([]));

    await expect(
      deleteApparelProjectWithMoneyAction(
        {},
        form({ orderId: ORDER_ID, reason: "Duplicate", refund: "refund" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(rpc).toHaveBeenCalledWith("delete_apparel_project", {
      p_order_id: ORDER_ID,
      p_reason: "Duplicate",
      p_refund: false,
    });
  });

  it("refunds when the owner says so: sends the choice, logs the void, says how much", async () => {
    rpc.mockResolvedValue({ data: [{ refunded_centavos: 100000 }], error: null });

    await expect(
      deleteApparelProjectWithMoneyAction(
        {},
        form({ orderId: ORDER_ID, reason: "Customer cancelled", refund: "refund" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/apparel?deleted=A-261001-001&refunded=100000");

    expect(rpc).toHaveBeenCalledWith("delete_apparel_project", {
      p_order_id: ORDER_ID,
      p_reason: "Customer cancelled",
      p_refund: true,
    });
    expect(recordAudit.mock.calls.map((call) => call[0].action)).toEqual(["delete", "void"]);
  });

  it("keeps the money without a void entry", async () => {
    await expect(
      deleteApparelProjectWithMoneyAction(
        {},
        form({ orderId: ORDER_ID, reason: "Entered twice", refund: "keep" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/apparel?deleted=A-261001-001");

    expect(rpc).toHaveBeenCalledWith("delete_apparel_project", {
      p_order_id: ORDER_ID,
      p_reason: "Entered twice",
      p_refund: false,
    });
    expect(recordAudit.mock.calls.map((call) => call[0].action)).toEqual(["delete"]);
  });

  it("shows the database's refusal and logs nothing", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "ERROR: A bench has been marked on that project, so it is cancelled with a reason instead of deleted." },
    });

    const result = await deleteApparelProjectWithMoneyAction(
      {},
      form({ orderId: ORDER_ID, reason: "x", refund: "keep" }),
    );

    expect(result.error).toMatch(/^A bench has been marked/);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("names the missing migration instead of a function name", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.delete_apparel_project in the schema cache" },
    });

    const result = await deleteApparelProjectWithMoneyAction(
      {},
      form({ orderId: ORDER_ID, reason: "x", refund: "keep" }),
    );

    expect(result.error).toMatch(/0026_apparel_project_delete_refund/);
  });

  it("says a project that is gone is gone", async () => {
    getApparelOrder.mockResolvedValue(null);
    const result = await deleteApparelProjectWithMoneyAction(
      {},
      form({ orderId: ORDER_ID, reason: "x", refund: "keep" }),
    );
    expect(result.error).toMatch(/no longer exists/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
