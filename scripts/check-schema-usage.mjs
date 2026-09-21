/**
 * Checks that every table and column the app asks for actually exists.
 *
 * WHY THIS EXISTS
 * Supabase queries are written as strings - .from("profiles").select("full_name")
 * - so TypeScript cannot catch a misspelled column. The mistake would only show
 *   up as a runtime error after the real database is connected.
 *
 * This script builds a throwaway database from supabase/migrations, reads the
 * real column names out of it, then scans the source for table and column
 * references and reports any that do not exist.
 *
 * Run with: npm run check:schema   (needs a local PostgreSQL; optional)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const PGHOST = process.env.PGHOST ?? "/tmp";
const PGPORT = process.env.PGPORT ?? "5433";
const PGUSER = process.env.PGUSER ?? "postgres";
const DB = `dabz_schema_check_${process.pid}`;
const ROOT = process.cwd();

function psql(args, database = DB) {
  return execFileSync(
    "psql",
    ["-h", PGHOST, "-p", PGPORT, "-U", PGUSER, "-d", database, "-q", "-v", "ON_ERROR_STOP=1", ...args],
    { encoding: "utf8", env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" } },
  );
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/**
 * The file's own column-list constants, resolved to their text.
 *
 * A long select is often given a name - `const ORDER_COLUMNS = "id, ..."` -
 * and a `.select(ORDER_COLUMNS)` would otherwise be invisible to this script,
 * which is exactly the coverage worth keeping: the longer the list, the more
 * chances there are to misspell one of it. Two forms are understood, a plain
 * string and a template literal built from another constant in the same file:
 *
 *   const LINE_COLUMNS_BEFORE_13 = "id, order_id, name";
 *   const LINE_COLUMNS = `${LINE_COLUMNS_BEFORE_13}, uniform_type`;
 *
 * Anything cleverer than that is left alone rather than guessed at - a wrong
 * guess here would report a column that does not exist and send somebody
 * hunting for a bug that is not there.
 */
function columnConstants(source) {
  const constants = new Map();

  for (const match of source.matchAll(
    /(?:const|let)\s+([A-Z][A-Z0-9_]*)\s*=\s*(["'`])([^"'`]*)\2\s*;/g,
  )) {
    constants.set(match[1], match[3]);
  }

  // A second pass, so a constant built from one declared above it resolves.
  for (const match of source.matchAll(
    /(?:const|let)\s+([A-Z][A-Z0-9_]*)\s*=\s*`([^`]*)`\s*;/g,
  )) {
    const text = match[2].replace(
      /\$\{\s*([A-Z][A-Z0-9_]*)\s*\}/g,
      (whole, name) => constants.get(name) ?? whole,
    );
    // Anything still carrying an unresolved ${...} is not understood.
    if (!text.includes("${")) constants.set(match[1], text);
  }

  return constants;
}

/**
 * Finds every `.from("table")` and the calls chained after it, up to the next
 * `.from(` or the end of the statement. Good enough for the query style this
 * project uses, and it errs towards reporting rather than staying silent.
 */
function extractUsages(source, file) {
  const usages = [];
  const constants = columnConstants(source);
  const fromPattern = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g;

  let match;
  while ((match = fromPattern.exec(source)) !== null) {
    const table = match[1];
    const rest = source.slice(match.index + match[0].length, match.index + 1200);
    // Stop at the next .from( so chains do not bleed into each other.
    const chain = rest.split(/\.from\(/)[0];

    const columns = new Set();

    // .select("a, b, c") - ignoring count/head options and "*"
    for (const select of chain.matchAll(/\.select\(\s*["'`]([^"'`]*)["'`]/g)) {
      for (const raw of select[1].split(",")) {
        const name = raw.trim();
        if (name && name !== "*") columns.add(name);
      }
    }

    // .select(ORDER_COLUMNS) - a named list declared in the same file.
    for (const select of chain.matchAll(/\.select\(\s*([A-Z][A-Z0-9_]*)\s*\)/g)) {
      const list = constants.get(select[1]);
      if (list === undefined) continue;
      for (const raw of list.split(",")) {
        const name = raw.trim();
        if (name && name !== "*") columns.add(name);
      }
    }

    // .eq("col", ...), .gte("col", ...), .in("col", ...), .order("col")
    for (const filter of chain.matchAll(
      /\.(?:eq|neq|gt|gte|lt|lte|like|ilike|in|order)\(\s*["'`]([a-z_]+)["'`]/g,
    )) {
      columns.add(filter[1]);
    }

    // .insert({ a: ..., b: ... }) and .update({ ... }), including the
    // shorthand spread form used for settings.
    //
    // A ternary inside a value - `{ profile_id: id === "" ? null : id }` -
    // also matches "something followed by a colon", so JavaScript's own words
    // are skipped rather than reported as missing columns.
    const NOT_COLUMNS = new Set([
      "null",
      "undefined",
      "true",
      "false",
      "default",
      "case",
      "return",
    ]);

    for (const write of chain.matchAll(/\.(?:insert|update|upsert)\(\s*\{([\s\S]{0,600}?)\}\s*\)/g)) {
      for (const key of write[1].matchAll(/(?:^|[\s,{])([a-z_][a-z0-9_]*)\s*:/g)) {
        if (!NOT_COLUMNS.has(key[1])) columns.add(key[1]);
      }
    }

    usages.push({ table, columns: [...columns], file });
  }

  return usages;
}

let failed = false;

try {
  psql(["-c", `create database "${DB}";`], "postgres");

  const migrationsDir = join(ROOT, "supabase", "migrations");
  const stubPath = join(ROOT, "supabase", "tests", "00_local_stub.sql");
  psql(["-f", stubPath]);
  for (const file of readdirSync(migrationsDir).sort()) {
    psql(["-f", join(migrationsDir, file)]);
  }

  const rows = psql([
    "-A",
    "-t",
    "-c",
    `select table_name || ':' || column_name
       from information_schema.columns
      where table_schema = 'public'
      order by table_name, column_name;`,
  ])
    .trim()
    .split("\n")
    .filter(Boolean);

  const schema = new Map();
  for (const row of rows) {
    const [table, column] = row.split(":");
    if (!schema.has(table)) schema.set(table, new Set());
    schema.get(table).add(column);
  }

  const problems = [];
  let checkedTables = 0;
  let checkedColumns = 0;

  for (const file of walk(join(ROOT, "src"))) {
    const source = readFileSync(file, "utf8");
    for (const usage of extractUsages(source, file)) {
      const where = relative(ROOT, usage.file);

      if (!schema.has(usage.table)) {
        problems.push(`${where}: table "${usage.table}" does not exist`);
        continue;
      }
      checkedTables += 1;

      for (const column of usage.columns) {
        checkedColumns += 1;
        if (!schema.get(usage.table).has(column)) {
          problems.push(
            `${where}: "${usage.table}" has no column "${column}"`,
          );
        }
      }
    }
  }

  console.log(
    `Checked ${checkedTables} table references and ${checkedColumns} column references against ${schema.size} tables.`,
  );

  if (problems.length > 0) {
    failed = true;
    console.error(`\n${problems.length} problem(s) found:`);
    for (const problem of problems) console.error(`  - ${problem}`);
  } else {
    console.log("Every table and column the app uses exists in the migrations.");
  }
} finally {
  try {
    psql(["-c", `drop database if exists "${DB}";`], "postgres");
  } catch {
    // The throwaway database is gone or was never made; nothing to clean up.
  }
}

process.exit(failed ? 1 : 0);
