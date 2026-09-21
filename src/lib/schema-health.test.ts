import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  REQUIRED_COLUMNS,
  REQUIRED_RELATIONS,
  REQUIRED_SCHEMA,
  SENTINEL_RELATIONS,
  outcomeFromError,
  probeKey,
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

  it("recognises a COLUMN that is not there", () => {
    /*
      The 21 Sep gap, one layer down. `0014` adds one column and no table, so
      nothing in this module could see it was missing - and Settings refused
      to save while this screen reported the database had everything.
    */
    expect(
      outcomeFromError({
        code: "42703",
        message: "column app_settings.staff_stay_signed_in does not exist",
      }),
    ).toBe("missing");
    expect(
      outcomeFromError({
        code: "PGRST204",
        message:
          "Could not find the 'staff_stay_signed_in' column of 'app_settings' in the schema cache",
      }),
    ).toBe("missing");
    expect(
      outcomeFromError({
        message:
          "Could not find the 'staff_stay_signed_in' column of 'app_settings' in the schema cache",
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
    // are applied whole and in order: one probe per migration answers
    // "is this database behind?" without the full sweep.
    const all = new Set(REQUIRED_SCHEMA.map((r) => r.migration));
    const sentinels = SENTINEL_RELATIONS.map((r) => r.migration);

    expect(new Set(sentinels).size).toBe(sentinels.length);
    expect(new Set(sentinels)).toEqual(all);
  });

  it("covers a migration that adds only a column", () => {
    /*
      Not a detail. `0014` creates no table, so before columns were probed it
      had no sentinel at all - and Home reported a database that was behind as
      fine while Settings could not save a single field.
    */
    const sentinel = SENTINEL_RELATIONS.find(
      (r) => r.migration === "0014_staff_stay_signed_in",
    );

    expect(sentinel?.column).toBe("staff_stay_signed_in");
  });

  it("prefers a table over a column where a migration has both", () => {
    // A missing table is the bigger absence and the cheaper question.
    const sentinel = SENTINEL_RELATIONS.find(
      (r) => r.migration === "0015_phase10_collections",
    );

    expect(sentinel?.column).toBeUndefined();
  });

  it("is much smaller than the full sweep", () => {
    expect(SENTINEL_RELATIONS.length).toBeLessThan(REQUIRED_SCHEMA.length / 3);
  });
});

// ---------------------------------------------------------------------------
// Columns: the half of "is this database behind?" that nothing could see
// ---------------------------------------------------------------------------

describe("probeKey", () => {
  it("asks for a table by name and a column by table.column", () => {
    expect(probeKey({ name: "sales", migration: "0005", breaks: "x" })).toBe("sales");
    expect(
      probeKey({
        name: "app_settings",
        column: "staff_stay_signed_in",
        migration: "0014",
        breaks: "x",
      }),
    ).toBe("app_settings.staff_stay_signed_in");
  });

  it("keeps a table and a column on it apart in a report", () => {
    // Same `name`, two different questions. Keying on `name` alone would let
    // one answer overwrite the other.
    const both = [
      { name: "app_settings", migration: "0001_phase1_foundation", breaks: "settings" },
      {
        name: "app_settings",
        column: "staff_stay_signed_in",
        migration: "0014_staff_stay_signed_in",
        breaks: "staying signed in",
      },
    ];

    const report = schemaReport(
      outcomes({
        app_settings: "present",
        "app_settings.staff_stay_signed_in": "missing",
      }),
      both,
    );

    expect(report.missingMigrations).toEqual(["0014_staff_stay_signed_in"]);
    expect(report.present.map(probeKey)).toEqual(["app_settings"]);
  });
});

describe("REQUIRED_COLUMNS", () => {
  /*
    The same anti-drift guard the relations have, for the gap that actually
    bit: a migration that adds a column to a table created EARLIER is invisible
    to a relation probe, so unless it is listed here the System check screen
    reports "everything the system needs is here" while a screen refuses to
    save.

    One column per table per migration is enough, and the rule is the one the
    sentinels rest on: a migration is applied whole.
  */
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  /** Which migration file created each table or view. */
  const createdIn = new Map<string, string>();
  /** Pairs of [table, migration] where a LATER migration adds a column. */
  const addedLater: [string, string][] = [];

  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    const version = file.replace(/\.sql$/, "");

    for (const match of sql.matchAll(
      /create\s+(?:table\s+if\s+not\s+exists|view|or\s+replace\s+view)\s+public\.([a-z_]+)/gi,
    )) {
      if (!createdIn.has(match[1])) createdIn.set(match[1], version);
    }

    // Each `alter table ... ;` statement, so an `add column` is attributed to
    // the table its own statement names.
    for (const statement of sql.matchAll(
      /alter\s+table\s+(?:public\.)?([a-z_]+)([\s\S]*?);/gi,
    )) {
      const table = statement[1];
      if (!/add\s+column/i.test(statement[2])) continue;
      if (createdIn.get(table) === version) continue; // same file: not a gap
      addedLater.push([table, version]);
    }
  }

  it("found something to check, so a broken parser cannot pass silently", () => {
    expect(addedLater.length).toBeGreaterThan(0);
    expect(addedLater).toContainEqual(["app_settings", "0014_staff_stay_signed_in"]);
  });

  it("asks about every table that a later migration adds a column to", () => {
    const listed = new Set(
      REQUIRED_COLUMNS.map((r) => `${r.name}@${r.migration}`),
    );
    const forgotten = [...new Set(addedLater.map(([t, m]) => `${t}@${m}`))]
      .filter((pair) => !listed.has(pair))
      .sort();

    expect(forgotten).toEqual([]);
  });

  it("does not ask for a column the migrations never add", () => {
    // A typo here would report a healthy database as behind for ever.
    const invented = REQUIRED_COLUMNS.filter((relation) => {
      const sql = readFileSync(
        join(dir, `${relation.migration}.sql`),
        "utf8",
      );
      return !new RegExp(`add\\s+column[^;]*?\\b${relation.column}\\b`, "is").test(sql);
    }).map(probeKey);

    expect(invented).toEqual([]);
  });

  it("only names tables the migrations actually create", () => {
    const unknown = REQUIRED_COLUMNS.map((r) => r.name).filter(
      (name) => !createdIn.has(name),
    );

    expect(unknown).toEqual([]);
  });

  it("asks each question once", () => {
    const keys = REQUIRED_SCHEMA.map(probeKey);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
