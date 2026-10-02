// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card, HEADING_BOX } from "./ui";

/**
 * Every heading in the signed-in system sits in a red box with white text
 * (owner's request, 2 Oct 2026). The style lives in ONE place, `HEADING_BOX`
 * in `ui.tsx`, so this guards the two ways it could quietly stop applying: a
 * new screen written with a bare page title, and a class added to a box that
 * would make its words vanish into the red.
 *
 * Like `tap-targets.test.ts` it reads the source, so it cannot see a pixel -
 * it can only stop the next bare heading going in unnoticed.
 */

const SRC = join(process.cwd(), "src");
const APP = join(SRC, "app", "(app)");

function tsxFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...tsxFiles(path));
    else if (entry.endsWith(".tsx") && !entry.includes(".test.")) found.push(path);
  }
  return found;
}

describe("red heading boxes", () => {
  it("is red with white text, and plain black on paper", () => {
    expect(HEADING_BOX).toContain("bg-accent");
    expect(HEADING_BOX).toContain("text-on-accent");
    expect(HEADING_BOX).toContain("print:bg-transparent");
  });

  it("boxes a card's title", () => {
    render(<Card title="Orders in progress">body</Card>);
    const heading = screen.getByRole("heading", { name: "Orders in progress" });
    expect(heading.className).toContain("bg-accent");
    expect(heading.className).toContain("text-on-accent");
  });

  it("boxes every page title in the signed-in system", () => {
    const files = tsxFiles(APP);
    // A guard that silently checks nothing is worse than no guard.
    expect(files.length).toBeGreaterThan(40);

    const offenders: string[] = [];
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/<h1\b[^>]*>/g)) {
        if (!match[0].includes("HEADING_BOX")) {
          offenders.push(`${path.replace(SRC, "src")}: ${match[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never puts a coloured text class on the box itself", () => {
    // Muted grey, amber or accent red on the red bar cannot be read.
    const offenders: string[] = [];
    for (const path of tsxFiles(SRC)) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/`\$\{HEADING_BOX\}([^`]*)`/g)) {
        if (/\btext-(muted|accent|attention|ink|success)\b/.test(match[1])) {
          offenders.push(`${path.replace(SRC, "src")}: ${match[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
