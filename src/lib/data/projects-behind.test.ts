/**
 * A project read against a database that has not had 0023 applied must say so,
 * not throw a bare "could not read". Other failures must still be thrown as
 * themselves.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let result: { data: unknown; error: { code: string; message: string } | null };
const query: Record<string, unknown> = {};
for (const method of ["select", "is", "eq", "order"]) {
  query[method] = () => query;
}
query.maybeSingle = () => Promise.resolve(result);
// `getProjects` awaits the builder itself after `.order(...)`.
query.then = (resolve: (value: unknown) => unknown) => resolve(result);

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => query,
    rpc: async () => ({ data: false, error: null }),
  }),
}));

import { isDatabaseBehind } from "@/lib/database-behind";

import { getProject, getProjects } from "./projects";

beforeEach(() => {
  result = { data: [], error: null };
});

describe("reading projects before 0023 reaches the database", () => {
  it("says the database is behind when deleted_at is missing (list)", async () => {
    result = {
      data: null,
      error: { code: "42703", message: "column projects.deleted_at does not exist" },
    };
    const failure = await getProjects().catch((error: unknown) => error);
    expect(isDatabaseBehind(failure)).toBe(true);
  });

  it("says the same for one project", async () => {
    result = {
      data: null,
      error: { code: "42703", message: "column projects.deleted_at does not exist" },
    };
    const failure = await getProject("p").catch((error: unknown) => error);
    expect(isDatabaseBehind(failure)).toBe(true);
  });

  it("still throws any other failure as itself", async () => {
    result = { data: null, error: { code: "57014", message: "statement timeout" } };
    const failure = await getProjects().catch((error: unknown) => error);
    expect(isDatabaseBehind(failure)).toBe(false);
    expect((failure as Error).message).toMatch(/statement timeout/);
  });
});
