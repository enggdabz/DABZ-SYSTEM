import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A guard, not a measurement.
 *
 * The design rules ask for a 24px touch target on anything a person taps, and
 * underlined text on its own is about 20px. The real check is a browser
 * measuring every screen at four widths - no test can see a pixel - but that
 * check is run by hand, and the rule was quietly broken in thirty places
 * before anybody measured.
 *
 * So this reads the source instead: a className that underlines something must
 * also carry `TAP_AREA` from `ui.tsx`, which is where the padding lives. It
 * cannot prove a screen is tappable; it can stop the next bare link being
 * added without anyone noticing.
 */

const SRC = join(process.cwd(), "src");

function tsxFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...tsxFiles(path));
    else if (entry.endsWith(".tsx")) found.push(path);
  }
  return found;
}

/**
 * `underline-offset-2` on its own does not underline anything - it only says
 * how far below the text the line would sit - so a className carrying just
 * that is not a link and is left alone.
 */
function underlines(className: string): boolean {
  return /(^|[\s:])underline($|\s)|hover:underline/.test(className);
}

describe("tappable text", () => {
  const files = tsxFiles(SRC);

  it("finds the screens to check", () => {
    // A guard that silently checks nothing is worse than no guard.
    expect(files.length).toBeGreaterThan(20);
  });

  it("gives every underlined link a hand-sized hit area", () => {
    const offenders: string[] = [];

    for (const path of files) {
      const source = readFileSync(path, "utf8");
      // Both spellings a className can take: a plain string, or a template.
      const matches = source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g);

      for (const match of matches) {
        const className = match[1] ?? match[2] ?? "";
        if (!underlines(className)) continue;
        if (className.includes("TAP_AREA")) continue;
        offenders.push(`${path.replace(SRC, "src")}: ${className}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
