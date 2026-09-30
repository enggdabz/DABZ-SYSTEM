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
      form({ projectId: PROJECT_ID, reason: "Wrong customer" }),
    );

    expect(result.outcome).toBe("requested");
    expect(result.done).toMatch(/owner/);
    // The one call it makes is delete_project - which the database turns into a
    // request for an admin. Nothing here deletes anything itself.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("delete_project", {
      p_project_id: PROJECT_ID,
      p_reason: "Wrong customer",
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
        form({ projectId: PROJECT_ID, reason: "Test entry" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/projects?deleted=J-261001-001");

    expect(rpc).toHaveBeenCalledWith("delete_project", {
      p_project_id: PROJECT_ID,
      p_reason: "Test entry",
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
      form({ projectId: PROJECT_ID, reason: "Again" }),
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
      form({ projectId: PROJECT_ID, reason: "Duplicate" }),
    );

    expect(result.error).toMatch(/Nothing was changed/);
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
