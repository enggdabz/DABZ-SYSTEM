import { describe, expect, it } from "vitest";

import {
  DatabaseBehindError,
  isDatabaseBehind,
  throwIfBehind,
} from "./database-behind";

const MIGRATION = "0023_project_deletion_requests";

describe("throwIfBehind", () => {
  it("does nothing when the read worked", () => {
    expect(() => throwIfBehind(null, MIGRATION)).not.toThrow();
  });

  it.each([
    ["a missing table (PostgreSQL)", { code: "42P01", message: "x" }],
    ["a missing table (PostgREST)", { code: "PGRST205", message: "x" }],
    ["a missing column (PostgreSQL)", { code: "42703", message: "x" }],
    ["a missing column (PostgREST)", { code: "PGRST204", message: "x" }],
    [
      "a proxy that kept only the sentence",
      { code: null, message: 'column projects.deleted_at does not exist' },
    ],
  ])("says the database is behind for %s", (_name, error) => {
    let caught: unknown;
    try {
      throwIfBehind(error, MIGRATION);
    } catch (thrown) {
      caught = thrown;
    }
    expect(isDatabaseBehind(caught)).toBe(true);
    expect((caught as DatabaseBehindError).migration).toBe(MIGRATION);
  });

  it("leaves every other failure alone - it is not evidence about the schema", () => {
    for (const error of [
      { code: "57014", message: "canceling statement due to statement timeout" },
      { code: "PGRST301", message: "JWT expired" },
      { code: "42501", message: "permission denied for table projects" },
      { code: null, message: "fetch failed" },
    ]) {
      expect(() => throwIfBehind(error, MIGRATION)).not.toThrow();
    }
  });
});

describe("isDatabaseBehind", () => {
  it("is false for an ordinary error", () => {
    expect(isDatabaseBehind(new Error("boom"))).toBe(false);
    expect(isDatabaseBehind(null)).toBe(false);
  });
});
