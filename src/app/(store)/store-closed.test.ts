import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A guard, not a measurement - the same shape as the Phase 14 shop's
 * `shop-closed.test.ts`.
 *
 * The store has an off switch (`store_settings.store_enabled`). It is meant to
 * take the whole storefront down without removing anything, and nothing else
 * can see a page that forgets to ask: it renders perfectly, every other test
 * passes, and the store is only found to be open by somebody opening it.
 *
 * So this reads the source. Every store page must mention `StoreClosed`, and
 * both public API routes must ask `isStoreOpen`. Anything exempt is listed by
 * name below, so adding an exemption is a decision somebody makes on purpose.
 * (When order tracking is built it will be listed here: somebody who already
 * ordered is owed their order however long the store stays shut.)
 */

const STORE = join(process.cwd(), "src", "app", "(store)");
const API = join(process.cwd(), "src", "app", "api", "store");

const STAYS_OPEN: string[] = [];

function files(dir: string, name: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...files(path, name));
    else if (entry === name) found.push(path);
  }
  return found;
}

describe("the store's off switch", () => {
  const pages = files(STORE, "page.tsx").map((path) => ({
    name: relative(STORE, path).split(/[\\/]/).join("/"),
    source: readFileSync(path, "utf8"),
  }));

  it("finds the store's pages", () => {
    expect(pages.length).toBeGreaterThanOrEqual(4);
  });

  it("is checked by every page", () => {
    const missing = pages
      .filter((page) => !STAYS_OPEN.includes(page.name))
      .filter((page) => !page.source.includes("StoreClosed"))
      .map((page) => page.name);
    expect(missing).toEqual([]);
  });

  it("is checked by every public route", () => {
    const routes = files(API, "route.ts");
    expect(routes.length).toBeGreaterThanOrEqual(2);
    const missing = routes
      .filter((path) => !readFileSync(path, "utf8").includes("isStoreOpen"))
      .map((path) => relative(API, path));
    expect(missing).toEqual([]);
  });
});
