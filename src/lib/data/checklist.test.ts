import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A guard, not a measurement.
 *
 * The public page prints only what the owner has filled in, and whatever is
 * missing is supposed to surface on the To fill in screen so the gap can be
 * found. Nothing but memory holds those two files together, and memory already
 * failed once: `shopEmail` and `mapUrl` were rendered on the page from Phase 9
 * onwards while the checklist stayed silent about them, so the screen could
 * say "Nothing left to fill in" beside a public page that gave a customer no
 * way to email the shop and no way to find it.
 *
 * This reads both sources and checks they still agree. It cannot judge whether
 * the wording is any good; it can stop the next public field being added to
 * the page and forgotten here.
 */

/**
 * Every page a CUSTOMER sees. The online shop (Phase 12) is on this list for
 * the same reason the public page is: it prints what the owner has filled in
 * and leaves out what they have not, and the gap has to surface somewhere
 * they will look.
 */
const CUSTOMER_PAGES = [
  join(process.cwd(), "src/app/(public)/page.tsx"),
  join(process.cwd(), "src/app/(shop)/shop/page.tsx"),
  join(process.cwd(), "src/app/(shop)/shop/order/details/page.tsx"),
  join(process.cwd(), "src/app/(shop)/shop/order/received/[token]/page.tsx"),
];

const CHECKLIST = join(process.cwd(), "src/lib/data/checklist.ts");

/**
 * Not details anyone fills in.
 *
 * `publicPageEnabled` and `onlineShopEnabled` are the switches that take a
 * page down, and both ship as true - a checklist entry for either would read
 * as an instruction to turn your own shop off. `onlineMinDaysAhead` and
 * `onlineShowStepsToCustomers` are policies with a default the specification
 * itself gives, not figures only the owner can know.
 */
const NOT_A_FILL_IN_FIELD = new Set([
  "publicPageEnabled",
  "onlineShopEnabled",
  "onlineMinDaysAhead",
  "onlineShowStepsToCustomers",
]);

function settingsFieldsReadBy(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const found = new Set<string>();
  // Both spellings the page uses: `settings.x` and the optional `settings?.x`.
  for (const match of source.matchAll(/settings\??\.([a-zA-Z][a-zA-Z0-9]*)/g)) {
    found.add(match[1]);
  }
  return [...found].filter((field) => !NOT_A_FILL_IN_FIELD.has(field));
}

describe("the pages a customer sees, and the To fill in screen", () => {
  const fields = [
    ...new Set(CUSTOMER_PAGES.flatMap((page) => settingsFieldsReadBy(page))),
  ];

  it("finds the fields to check", () => {
    // A guard that silently checks nothing is worse than no guard.
    expect(fields.length).toBeGreaterThan(5);
  });

  it("lists every shop detail a customer-facing page prints", () => {
    const checklist = readFileSync(CHECKLIST, "utf8");
    const missing = fields.filter(
      (field) => !checklist.includes(`settings.${field}`),
    );

    expect(
      missing,
      `A page the customer sees prints ${missing.join(", ")}, but src/lib/data/checklist.ts never mentions that. A customer would see the gap and the owner would never be told.`,
    ).toEqual([]);
  });
});
