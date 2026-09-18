import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".ts") || path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/*
 * A "use server" module may only export async functions. Exporting a constant
 * beside its actions breaks every route that imports it — at request time, not
 * at build time, because these routes are dynamic. That failure has slipped
 * through twice; this catches it in CI instead.
 */
test("use server modules export only async functions", () => {
  const offenders: string[] = [];

  for (const file of walk("src")) {
    const source = readFileSync(file, "utf8");
    if (!/^\s*["']use server["']/m.test(source)) continue;

    for (const [index, line] of source.split("\n").entries()) {
      // `export type` and `export interface` are erased before runtime, so
      // they are allowed; anything else that is not an async function is not.
      if (/^export\s+(const|let|var|class|enum|default|\{)/.test(line)) {
        offenders.push(`${file}:${index + 1}: ${line.trim()}`);
      }
      if (/^export\s+function\s/.test(line)) {
        offenders.push(`${file}:${index + 1}: ${line.trim()} (must be async)`);
      }
    }
  }

  assert.deepEqual(offenders, [], `illegal exports:\n${offenders.join("\n")}`);
});
