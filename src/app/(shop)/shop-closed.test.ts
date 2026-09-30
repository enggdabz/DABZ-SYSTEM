import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A guard, not a measurement - the same shape as `tap-targets.test.ts`.
 *
 * Settings carries a switch called "Show the online shop". It is meant to take
 * the shop down without removing anything, and for a while it did almost
 * nothing: only `/shop` itself asked, so a bookmarked product URL still took a
 * live order, and `placeOrderAction` read the column and then ignored it.
 *
 * Nothing else can see that. A page that forgets the guard renders perfectly,
 * every other test passes, and the shop is only found to be open by somebody
 * opening it. So this reads the source: every shop page a customer could order
 * FROM has to mention `ShopClosed`, and both public write actions have to
 * mention the switch.
 *
 * TWO PAGES ARE DELIBERATELY EXEMPT. Tracking an order and a receipt link stay
 * open while the shop is shut: somebody who already ordered is owed their
 * order however long it stays that way. They are listed by name below, so
 * adding a third exemption is a decision somebody makes on purpose.
 *
 * ONE PAGE ANSWERS THE SWITCH DIFFERENTLY, and it still has to answer it. The
 * catalogue became the homepage on 22 September 2026, and "we are not taking
 * online orders" is not a whole homepage: it leaves a customer with no
 * address, no opening hours, no price lists and nothing to ask. So the front
 * door sends them to the page about the rest of the shop instead. That is a
 * different answer, not a missing one, so it is checked here by name.
 */

const SHOP = join(process.cwd(), "src", "app", "(shop)");

/** Pages that must still work with the shop switched off. */
const STAYS_OPEN = ["shop/track/page.tsx", "shop/order/received/[token]/page.tsx"];

/**
 * Pages that answer the switch some other way, and every word that proves it.
 * A page here is NOT exempt - it is held to its own answer instead.
 */
const ANSWERS_DIFFERENTLY: Record<string, string[]> = {
  "page.tsx": ["onlineShopEnabled", 'redirect("/about")'],
};

function pages(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...pages(path));
    else if (entry === "page.tsx") found.push(path);
  }
  return found;
}

describe("the online shop's off switch", () => {
  const found = pages(SHOP).map((path) => ({
    name: relative(SHOP, path).split(/[\\/]/).join("/"),
    source: readFileSync(path, "utf8"),
  }));

  it("finds the shop's pages", () => {
    expect(found.length).toBeGreaterThan(5);
  });

  it("is checked by every page a customer could order from", () => {
    const missing = found
      .filter((page) => !STAYS_OPEN.includes(page.name))
      .filter((page) => !(page.name in ANSWERS_DIFFERENTLY))
      .filter((page) => !page.source.includes("ShopClosed"))
      .map((page) => page.name);

    expect(missing).toEqual([]);
  });

  it("is checked by the homepage, which sends the customer to /about instead", () => {
    for (const [name, proof] of Object.entries(ANSWERS_DIFFERENTLY)) {
      const page = found.find((candidate) => candidate.name === name);
      expect(page, `${name} has moved - update ANSWERS_DIFFERENTLY`).toBeDefined();
      for (const word of proof) {
        expect(page?.source, `${name} must still contain ${word}`).toContain(word);
      }
    }
  });

  it("leaves tracking and receipts open", () => {
    for (const name of STAYS_OPEN) {
      const page = found.find((candidate) => candidate.name === name);
      expect(page, `${name} has moved - update STAYS_OPEN`).toBeDefined();
      expect(page?.source.includes("ShopClosed")).toBe(false);
    }
  });

  it("is checked by both actions a stranger can call", () => {
    const source = readFileSync(join(SHOP, "actions.ts"), "utf8");

    // A hidden page is not a rule: the actions re-check for themselves.
    const inUpload = source.slice(
      source.indexOf("export async function uploadOrderFileAction"),
      source.indexOf("export async function placeOrderAction"),
    );
    const inPlace = source.slice(
      source.indexOf("export async function placeOrderAction"),
      source.indexOf("async function tellTheShop"),
    );

    expect(inUpload).toContain("shopIsOpen");
    expect(inPlace).toContain("online_shop_enabled");
    expect(inPlace).toContain("SHOP_CLOSED");
  });
});
