import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  REQUIRED_RELATIONS,
  SENTINEL_RELATIONS,
  outcomeFromError,
  schemaAdvice,
  schemaReport,
  type ProbeOutcome,
} from "./schema-health";

const outcomes = (entries: Record<string, ProbeOutcome>) =>
  new Map(Object.entries(entries));

// ---------------------------------------------------------------------------
// Telling "no such table" from "I could not ask"
// ---------------------------------------------------------------------------

describe("outcomeFromError", () => {
  it("calls no error present", () => {
    expect(outcomeFromError(null)).toBe("present");
  });

  it("recognises PostgreSQL and PostgREST saying the relation is not there", () => {
    // 42P01 is what the owner's SQL editor answered on 21 Sep; PGRST205 is
    // what the same absence looks like through the API.
    expect(outcomeFromError({ code: "42P01" })).toBe("missing");
    expect(outcomeFromError({ code: "PGRST205" })).toBe("missing");
    expect(outcomeFromError({ code: "pgrst205" })).toBe("missing");
  });

  it("recognises the sentence when a proxy has eaten the code", () => {
    expect(
      outcomeFromError({ message: 'relation "public.collections" does not exist' }),
    ).toBe("missing");
    expect(
      outcomeFromError({
        message: "Could not find the table 'public.collections' in the schema cache",
      }),
    ).toBe("missing");
  });

  it("calls anything else UNKNOWN, not missing", () => {
    /*
      The rule this module lives or dies by. A timeout, a paused project or a
      bad key say nothing at all about the schema, and reporting them as
      "missing" would send somebody to re-run migrations against a database
      that was fine - a confident wrong answer beside money, which is the
      exact failure this whole file was written to prevent.
    */
    expect(outcomeFromError({ code: "57014", message: "canceling statement" })).toBe("unknown");
    expect(outcomeFromError({ code: "PGRST301", message: "JWT expired" })).toBe("unknown");
    expect(outcomeFromError({ message: "fetch failed" })).toBe("unknown");
    expect(outcomeFromError({})).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

describe("schemaReport", () => {
  const three = [
    { name: "sales", migration: "0005_phase4_pos", breaks: "the Counter" },
    { name: "collections", migration: "0015_phase10_collections", breaks: "Sales" },
    { name: "push_subscriptions", migration: "0016_phase11_notifications", breaks: "notifications" },
  ];

  it("is ok only when everything came back present", () => {
    const report = schemaReport(
      outcomes({ sales: "present", collections: "present", push_subscriptions: "present" }),
      three,
    );

    expect(report.ok).toBe(true);
    expect(report.missing).toHaveLength(0);
    expect(report.headline).toBe("The database has everything the system needs");
  });

  it("names the migration that would fix what is missing", () => {
    // The owner's actual situation on 21 Sep 2026.
    const report = schemaReport(
      outcomes({ sales: "present", collections: "missing", push_subscriptions: "missing" }),
      three,
    );

    expect(report.ok).toBe(false);
    expect(report.missingMigrations).toEqual([
      "0015_phase10_collections",
      "0016_phase11_notifications",
    ]);
    expect(report.headline).toBe("The database is missing 2 migrations");
  });

  it("counts migrations rather than tables, so one migration reads as one", () => {
    const report = schemaReport(
      outcomes({ sales: "missing", collections: "present", push_subscriptions: "present" }),
      three,
    );

    expect(report.headline).toBe("The database is missing one migration");
  });

  it("keeps unknown out of missing, and says so in the headline", () => {
    const report = schemaReport(
      outcomes({ sales: "present", collections: "unknown", push_subscriptions: "present" }),
      three,
    );

    expect(report.ok).toBe(false);
    expect(report.missing).toHaveLength(0);
    expect(report.unknown).toHaveLength(1);
    expect(report.headline).toBe("The database could not be checked");
  });

  it("lets missing win the headline when both are present", () => {
    // Something to DO beats something that could not be asked.
    const report = schemaReport(
      outcomes({ sales: "missing", collections: "unknown", push_subscriptions: "present" }),
      three,
    );

    expect(report.headline).toBe("The database is missing one migration");
  });

  it("treats a relation nobody probed as unknown rather than present", () => {
    // Silence is not a yes.
    const report = schemaReport(outcomes({ sales: "present" }), three);

    expect(report.unknown.map((r) => r.name)).toEqual([
      "collections",
      "push_subscriptions",
    ]);
  });
});

// ---------------------------------------------------------------------------
// What the owner is told to do
// ---------------------------------------------------------------------------

describe("schemaAdvice", () => {
  const missingOne = schemaReport(
    outcomes({ collections: "missing" }),
    [{ name: "collections", migration: "0015_phase10_collections", breaks: "Sales" }],
  );

  it("ALWAYS warns about 0013 before telling anybody to push", () => {
    /*
      Not optional and not a nicety. 0013 deletes every bill, loan, product,
      apparel item and repair service and cannot be undone. The app cannot see
      which migrations are recorded, so it must assume the dangerous case is
      possible - a screen that says "run db:push" without this is handing
      somebody a loaded instruction.
    */
    const advice = schemaAdvice(missingOne).join(" ");

    expect(advice).toContain("0013");
    expect(advice).toContain("cannot be undone");
    expect(advice).toContain("schema_migrations");
  });

  it("says nothing at all when everything is present", () => {
    const fine = schemaReport(outcomes({ collections: "present" }), [
      { name: "collections", migration: "0015_phase10_collections", breaks: "Sales" },
    ]);

    expect(schemaAdvice(fine)).toEqual([]);
  });

  it("does not tell anybody to run a migration when the check merely failed", () => {
    const unknown = schemaReport(outcomes({ collections: "unknown" }), [
      { name: "collections", migration: "0015_phase10_collections", breaks: "Sales" },
    ]);
    const advice = schemaAdvice(unknown).join(" ");

    expect(advice).not.toContain("db:push");
    expect(advice).toContain("could not be asked");
  });
});

// ---------------------------------------------------------------------------
// The list cannot drift from the migrations
// ---------------------------------------------------------------------------

describe("REQUIRED_RELATIONS", () => {
  /*
    The guard that keeps this honest. A check that quietly stopped covering a
    new table would be worse than no check at all: it would report "everything
    the system needs is here" while the thing that was missing went unnamed.

    Same rule that holds the public page and the To fill in checklist together
    - adding one means adding the other, and the test says so rather than a
    comment nobody reads.
  */
  const created = (() => {
    const dir = join(process.cwd(), "supabase", "migrations");
    const names = new Set<string>();
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(dir, file), "utf8");
      for (const match of sql.matchAll(
        /create\s+(?:table\s+if\s+not\s+exists|view|or\s+replace\s+view)\s+public\.([a-z_]+)/gi,
      )) {
        names.add(match[1]);
      }
    }
    return names;
  })();

  it("covers every table and view the migrations create", () => {
    const listed = new Set(REQUIRED_RELATIONS.map((relation) => relation.name));
    const forgotten = [...created].filter((name) => !listed.has(name)).sort();

    expect(forgotten).toEqual([]);
  });

  it("does not ask for anything the migrations never create", () => {
    // A typo here would report a healthy database as broken for ever.
    const invented = REQUIRED_RELATIONS.map((r) => r.name)
      .filter((name) => !created.has(name))
      .sort();

    expect(invented).toEqual([]);
  });

  it("names each relation once", () => {
    const names = REQUIRED_RELATIONS.map((relation) => relation.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it("points every relation at a migration file that exists", () => {
    const files = new Set(
      readdirSync(join(process.cwd(), "supabase", "migrations"))
        .filter((f) => f.endsWith(".sql"))
        .map((f) => f.replace(/\.sql$/, "")),
    );

    for (const relation of REQUIRED_RELATIONS) {
      expect(files.has(relation.migration), relation.migration).toBe(true);
    }
  });
});

describe("SENTINEL_RELATIONS", () => {
  it("covers every migration exactly once", () => {
    // The home-screen check is only allowed to be cheap because migrations
    // are applied whole and in order: one relation per migration answers
    // "is this database behind?" without forty-four round trips.
    const all = new Set(REQUIRED_RELATIONS.map((r) => r.migration));
    const sentinels = SENTINEL_RELATIONS.map((r) => r.migration);

    expect(new Set(sentinels).size).toBe(sentinels.length);
    expect(new Set(sentinels)).toEqual(all);
  });

  it("is much smaller than the full sweep", () => {
    expect(SENTINEL_RELATIONS.length).toBeLessThan(REQUIRED_RELATIONS.length / 3);
  });
});
