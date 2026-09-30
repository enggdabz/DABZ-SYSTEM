/**
 * The server side of "delete a project with the owner's approval".
 *
 * These prove what the ACTIONS do when called directly - a hand-made form, no
 * button in the way - with the database faked at its edge. What the database
 * itself refuses is proven against a real PostgreSQL in
 * supabase/tests/20_project_deletion_rls.test.sql.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const from = vi.fn(() => {
  throw new Error("An action must not touch a table directly.");
});
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ rpc, from }),
}));

const requireUser = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ requireUser: () => requireUser() }));

const recordAudit = vi.fn((entry: { action: string }) => Promise.resolve(entry));
vi.mock("@/lib/audit", () => ({
  recordAudit: (entry: { action: string }) => recordAudit(entry),
}));

const getProject = vi.fn();
vi.mock("@/lib/data/projects", () => ({
  getProject: (id: string) => getProject(id),
}));

const getDeletionRequest = vi.fn();
vi.mock("@/lib/data/project-deletions", () => ({
  getDeletionRequest: (id: string) => getDeletionRequest(id),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirect = vi.fn((url: string) => {
  // The real one throws to stop the action; so does this.
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

import {
  cancelDeletionRequestAction,
  decideDeletionAction,
  deleteProjectAction,
} from "./deletion-actions";

const PROJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REQUEST_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const owner = { id: "owner-1", username: "eddie", role: "owner", status: "active" };
const admin = { id: "admin-1", username: "maria", role: "admin", status: "active" };
const otherAdmin = { id: "admin-2", username: "pedro", role: "admin", status: "active" };
const staff = { id: "staff-1", username: "juan", role: "staff", status: "active" };

const project = {
  id: PROJECT_ID,
  number: "J-261001-001",
  customerName: "Coach Ramon",
  division: "apparel",
  description: "Team jerseys",
  totalCentavos: 500000,
  status: "open",
  // ₱2,000 taken as a down payment, one live and one already voided.
  payments: [
    {
      saleId: "sale-1",
      saleNumber: "S-261001-001",
      saleDate: "2026-10-01",
      kind: "down",
      amountCentavos: 200000,
      method: "cash",
      voided: false,
    },
    {
      saleId: "sale-2",
      saleNumber: "S-261001-002",
      saleDate: "2026-10-01",
      kind: "balance",
      amountCentavos: 50000,
      method: "cash",
      voided: true,
    },
  ],
};

const pendingRequest = {
  id: REQUEST_ID,
  projectId: PROJECT_ID,
  projectNumber: "J-261001-001",
  customerName: "Coach Ramon",
  requestedBy: "admin-1",
  requestedByName: "Maria",
  reason: "Duplicate",
  status: "pending",
  refundRequested: false,
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  getProject.mockResolvedValue(project);
  getDeletionRequest.mockResolvedValue(pendingRequest);
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("delete project", () => {
  it("an admin calling it directly only creates a request", async () => {
    requireUser.mockResolvedValue(admin);
    rpc.mockResolvedValue({
      data: [{ outcome: "requested", request_id: REQUEST_ID }],
      error: null,
    });

    const result = await deleteProjectAction(
      {},
      form({ projectId: PROJECT_ID, reason: "Wrong customer", refund: "keep" }),
    );

    expect(result.outcome).toBe("requested");
    expect(result.done).toMatch(/owner/);
    // The one call it makes is delete_project - which the database turns into a
    // request for an admin. Nothing here deletes anything itself.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("delete_project", {
      p_project_id: PROJECT_ID,
      p_reason: "Wrong customer",
      p_refund: false,
    });
    expect(from).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "request",
        entity: "project_deletion_requests",
        entityId: REQUEST_ID,
      }),
    );
  });

  it("the owner deletes at once, and it is logged as a delete", async () => {
    requireUser.mockResolvedValue(owner);
    rpc.mockResolvedValue({
      data: [{ outcome: "deleted", request_id: null }],
      error: null,
    });

    await expect(
      deleteProjectAction(
        {},
        form({ projectId: PROJECT_ID, reason: "Test entry", refund: "keep" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/projects?deleted=J-261001-001");

    expect(rpc).toHaveBeenCalledWith("delete_project", {
      p_project_id: PROJECT_ID,
      p_reason: "Test entry",
      p_refund: false,
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete",
        entity: "projects",
        entityId: PROJECT_ID,
        before: expect.objectContaining({ number: "J-261001-001" }),
      }),
    );
  });

  it("staff are turned away before the database is asked", async () => {
    requireUser.mockResolvedValue(staff);

    const result = await deleteProjectAction(
      {},
      form({ projectId: PROJECT_ID, reason: "Please" }),
    );

    expect(result.error).toMatch(/owner or an admin/);
    expect(rpc).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("needs a reason", async () => {
    requireUser.mockResolvedValue(admin);

    const result = await deleteProjectAction(
      {},
      form({ projectId: PROJECT_ID, reason: "   " }),
    );

    expect(result.error).toMatch(/why/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("shows the database's refusal and logs nothing", async () => {
    requireUser.mockResolvedValue(admin);
    rpc.mockResolvedValue({
      data: null,
      error: {
        message:
          "ERROR: A deletion request for this project is already waiting for the owner.",
      },
    });

    const result = await deleteProjectAction(
      {},
      form({ projectId: PROJECT_ID, reason: "Again", refund: "keep" }),
    );

    expect(result.error).toBe(
      "A deletion request for this project is already waiting for the owner.",
    );
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("does not call a result it does not recognise a success", async () => {
    requireUser.mockResolvedValue(admin);
    rpc.mockResolvedValue({ data: [{ outcome: "something_else" }], error: null });

    const result = await deleteProjectAction(
      {},
      form({ projectId: PROJECT_ID, reason: "Duplicate", refund: "keep" }),
    );

    expect(result.error).toMatch(/Nothing was changed/);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("the refund choice", () => {
  it("must be made when the project has a live payment", async () => {
    requireUser.mockResolvedValue(owner);

    const result = await deleteProjectAction(
      {},
      form({ projectId: PROJECT_ID, reason: "Mistake" }),
    );

    expect(result.error).toMatch(/refund it or keep the money/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is not needed when nothing live has been paid", async () => {
    requireUser.mockResolvedValue(admin);
    getProject.mockResolvedValue({
      ...project,
      payments: project.payments.map((payment) => ({ ...payment, voided: true })),
    });
    rpc.mockResolvedValue({
      data: [{ outcome: "requested", request_id: REQUEST_ID, refunded_centavos: 0 }],
      error: null,
    });

    const result = await deleteProjectAction(
      {},
      form({ projectId: PROJECT_ID, reason: "Mistake" }),
    );

    expect(result.outcome).toBe("requested");
    expect(rpc).toHaveBeenCalledWith("delete_project", {
      p_project_id: PROJECT_ID,
      p_reason: "Mistake",
      p_refund: false,
    });
  });

  it("ignores a refund tick when there is nothing to refund", async () => {
    requireUser.mockResolvedValue(owner);
    getProject.mockResolvedValue({
      ...project,
      payments: [],
    });
    rpc.mockResolvedValue({
      data: [{ outcome: "deleted", refunded_centavos: 0 }],
      error: null,
    });

    await expect(
      deleteProjectAction(
        {},
        form({ projectId: PROJECT_ID, reason: "Test", refund: "refund" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(rpc).toHaveBeenCalledWith("delete_project", {
      p_project_id: PROJECT_ID,
      p_reason: "Test",
      p_refund: false,
    });
  });

  it("the owner refunding sends the choice, logs the void, and says how much", async () => {
    requireUser.mockResolvedValue(owner);
    rpc.mockResolvedValue({
      data: [{ outcome: "deleted", request_id: null, refunded_centavos: 200000 }],
      error: null,
    });

    await expect(
      deleteProjectAction(
        {},
        form({ projectId: PROJECT_ID, reason: "Changed their mind", refund: "refund" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/projects?deleted=J-261001-001&refunded=200000");

    expect(rpc).toHaveBeenCalledWith("delete_project", {
      p_project_id: PROJECT_ID,
      p_reason: "Changed their mind",
      p_refund: true,
    });
    const actions = recordAudit.mock.calls.map((call) => call[0].action);
    expect(actions).toEqual(["delete", "void"]);
    // Only the LIVE payment is named as refunded - the voided one was already
    // handed back.
    expect(recordAudit.mock.calls[1][0]).toMatchObject({
      before: { payments: [{ sale_number: "S-261001-001", amount_centavos: 200000 }] },
    });
  });

  it("an admin asking for a refund only asks - and says so in the log", async () => {
    requireUser.mockResolvedValue(admin);
    rpc.mockResolvedValue({
      data: [{ outcome: "requested", request_id: REQUEST_ID, refunded_centavos: 0 }],
      error: null,
    });

    const result = await deleteProjectAction(
      {},
      form({ projectId: PROJECT_ID, reason: "Wrong customer", refund: "refund" }),
    );

    expect(result.outcome).toBe("requested");
    expect(result.done).toMatch(/refund/);
    expect(rpc).toHaveBeenCalledWith("delete_project", {
      p_project_id: PROJECT_ID,
      p_reason: "Wrong customer",
      p_refund: true,
    });
    // A request moves no money, so no "void" entry - only the request itself.
    const actions = recordAudit.mock.calls.map((call) => call[0].action);
    expect(actions).toEqual(["request"]);
    expect(recordAudit.mock.calls[0][0]).toMatchObject({
      after: { refund_requested: true },
    });
  });

  it("says which migration is missing instead of a function name", async () => {
    requireUser.mockResolvedValue(owner);
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.delete_project(p_project_id, p_reason, p_refund) in the schema cache" },
    });

    const result = await deleteProjectAction(
      {},
      form({ projectId: PROJECT_ID, reason: "Mistake", refund: "keep" }),
    );

    expect(result.error).toMatch(/0025_project_deletion_refund/);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("approve and reject", () => {
  it("an admin cannot approve - not even their own request", async () => {
    requireUser.mockResolvedValue(admin);

    const result = await decideDeletionAction(
      {},
      form({ requestId: REQUEST_ID, decision: "approve" }),
    );

    expect(result.error).toMatch(/Only the owner/);
    expect(rpc).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("an admin cannot reject either", async () => {
    requireUser.mockResolvedValue(otherAdmin);

    const result = await decideDeletionAction(
      {},
      form({ requestId: REQUEST_ID, decision: "reject" }),
    );

    expect(result.error).toMatch(/Only the owner/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("staff cannot approve", async () => {
    requireUser.mockResolvedValue(staff);

    const result = await decideDeletionAction(
      {},
      form({ requestId: REQUEST_ID, decision: "approve" }),
    );

    expect(result.error).toMatch(/Only the owner/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("the owner approving deletes, and both steps are logged", async () => {
    requireUser.mockResolvedValue(owner);

    const result = await decideDeletionAction(
      {},
      form({ requestId: REQUEST_ID, decision: "approve", note: "Fine" }),
    );

    expect(result.outcome).toBe("approved");
    expect(rpc).toHaveBeenCalledWith("decide_project_deletion", {
      p_request_id: REQUEST_ID,
      p_approve: true,
      p_note: "Fine",
    });
    const actions = recordAudit.mock.calls.map((call) => call[0].action);
    expect(actions).toEqual(["approve", "delete"]);
  });

  it("approving a request that asked for a refund logs the void too", async () => {
    requireUser.mockResolvedValue(owner);
    getDeletionRequest.mockResolvedValue({ ...pendingRequest, refundRequested: true });

    const result = await decideDeletionAction(
      {},
      form({ requestId: REQUEST_ID, decision: "approve" }),
    );

    expect(result.done).toMatch(/₱2,000\.00 was refunded/);
    const actions = recordAudit.mock.calls.map((call) => call[0].action);
    expect(actions).toEqual(["approve", "delete", "void"]);
  });

  it("a rejection refunds nothing, even when a refund was asked for", async () => {
    requireUser.mockResolvedValue(owner);
    getDeletionRequest.mockResolvedValue({ ...pendingRequest, refundRequested: true });

    await decideDeletionAction(
      {},
      form({ requestId: REQUEST_ID, decision: "reject", note: "Keep the job" }),
    );

    const actions = recordAudit.mock.calls.map((call) => call[0].action);
    expect(actions).toEqual(["reject"]);
  });

  it("a rejection is logged and deletes nothing", async () => {
    requireUser.mockResolvedValue(owner);

    const result = await decideDeletionAction(
      {},
      form({ requestId: REQUEST_ID, decision: "reject", note: "Keep it" }),
    );

    expect(result.outcome).toBe("rejected");
    expect(rpc).toHaveBeenCalledWith("decide_project_deletion", {
      p_request_id: REQUEST_ID,
      p_approve: false,
      p_note: "Keep it",
    });
    const actions = recordAudit.mock.calls.map((call) => call[0].action);
    // No "delete" entry: the project was left exactly as it was.
    expect(actions).toEqual(["reject"]);
  });

  it("the note is optional", async () => {
    requireUser.mockResolvedValue(owner);

    await decideDeletionAction(
      {},
      form({ requestId: REQUEST_ID, decision: "reject", note: "  " }),
    );

    expect(rpc).toHaveBeenCalledWith("decide_project_deletion", {
      p_request_id: REQUEST_ID,
      p_approve: false,
      p_note: null,
    });
  });

  it("refuses a request that was already answered", async () => {
    requireUser.mockResolvedValue(owner);
    getDeletionRequest.mockResolvedValue({ ...pendingRequest, status: "approved" });

    const result = await decideDeletionAction(
      {},
      form({ requestId: REQUEST_ID, decision: "approve" }),
    );

    expect(result.error).toMatch(/already been dealt with/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a decision that is neither approve nor reject", async () => {
    requireUser.mockResolvedValue(owner);

    const result = await decideDeletionAction(
      {},
      form({ requestId: REQUEST_ID, decision: "maybe" }),
    );

    expect(result.error).toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("cancel request", () => {
  it("lets the admin who asked take it back", async () => {
    requireUser.mockResolvedValue(admin);

    const result = await cancelDeletionRequestAction(
      {},
      form({ requestId: REQUEST_ID }),
    );

    expect(result.outcome).toBe("cancelled");
    expect(rpc).toHaveBeenCalledWith("cancel_project_deletion", {
      p_request_id: REQUEST_ID,
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cancel" }),
    );
  });

  it("does not let another admin cancel it", async () => {
    requireUser.mockResolvedValue(otherAdmin);

    const result = await cancelDeletionRequestAction(
      {},
      form({ requestId: REQUEST_ID }),
    );

    expect(result.error).toMatch(/person who asked/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not let staff cancel anything", async () => {
    requireUser.mockResolvedValue(staff);

    const result = await cancelDeletionRequestAction(
      {},
      form({ requestId: REQUEST_ID }),
    );

    expect(result.error).toMatch(/permission/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
