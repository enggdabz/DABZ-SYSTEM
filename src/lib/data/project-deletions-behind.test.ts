/**
 * Reading deletion requests before the right migration reaches the database
 * must name the RIGHT migration: a missing table is 0023, a missing
 * `refund_requested` column on a table that is there is 0025. The owner runs
 * whichever the notice names.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let result: { data: unknown; error: { code: string; message: string } | null };
const query: Record<string, unknown> = {};
for (const method of ["select", "eq", "neq", "order", "limit"]) {
  query[method] = () => query;
}
query.maybeSingle = () => Promise.resolve(result);
query.then = (resolve: (value: unknown) => unknown) => resolve(result);

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => query,
    rpc: async () => ({ data: 0, error: null }),
  }),
}));

import { DatabaseBehindError } from "@/lib/database-behind";

import { getDeletionRequests, getPendingRequestForProject } from "./project-deletions";

async function migrationNamed(run: () => Promise<unknown>): Promise<string | null> {
  const failure = await run().catch((error: unknown) => error);
  return failure instanceof DatabaseBehindError ? failure.migration : null;
}

beforeEach(() => {
  result = { data: [], error: null };
});

describe("reading deletion requests on a database that is behind", () => {
  it("names 0023 when the table is missing", async () => {
    result = {
      data: null,
      error: { code: "42P01", message: 'relation "project_deletion_requests" does not exist' },
    };
    expect(await migrationNamed(() => getDeletionRequests())).toBe(
      "0023_project_deletion_requests",
    );
  });

  it("names 0025 when only refund_requested is missing", async () => {
    result = {
      data: null,
      error: {
        code: "42703",
        message: "column project_deletion_requests.refund_requested does not exist",
      },
    };
    expect(await migrationNamed(() => getPendingRequestForProject("p"))).toBe(
      "0025_project_deletion_refund",
    );
  });

  it("does not call a timeout a missing migration", async () => {
    result = { data: null, error: { code: "57014", message: "statement timeout" } };
    expect(await migrationNamed(() => getDeletionRequests())).toBeNull();
  });
});
