import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LAST_STAGE_INDEX,
  PRODUCTION_STAGES,
  PRODUCTION_STAGE_LABELS,
  isProductionStage,
  itemProduction,
  itemStatusLabel,
  projectProduction,
  projectStatusLabel,
  productionSummaryLine,
  projectStatusNote,
  statusDisagreement,
  summariseProduction,
  type ProductionStage,
  type ProductionStep,
} from "./production";

/** A mark on a bench, with a time so "last marked" can be checked. */
function step(
  lineId: string,
  stage: ProductionStage,
  markedAt = "2026-09-21T01:00:00.000Z",
): ProductionStep {
  return { lineId, stage, markedAt };
}

/** Every bench up to and including this one, in order. */
function through(lineId: string, stage: ProductionStage): ProductionStep[] {
  const last = PRODUCTION_STAGES.indexOf(stage);
  return PRODUCTION_STAGES.slice(0, last + 1).map((name) => step(lineId, name));
}

const jerseys = { lineId: "line-1", name: "Full sublimation jersey", quantity: 18 };
const jacket = { lineId: "line-2", name: "Jacket", quantity: 1 };

// ---------------------------------------------------------------------------
// The benches themselves
// ---------------------------------------------------------------------------

describe("the ten benches", () => {
  it("is the owner's list, in the owner's order", () => {
    // Written out rather than derived, so a reorder has to be deliberate:
    // this is the order the work happens in at the shop, and the project's
    // status is a position in it.
    expect([...PRODUCTION_STAGES]).toEqual([
      "design",
      "colour_test",
      "pattern",
      "print",
      "heat_press",
      "fabric_cutting",
      "sewing",
      "quality_check",
      "packaging",
      "ready",
    ]);
  });

  it("gives every bench a label, in sentence case", () => {
    for (const stage of PRODUCTION_STAGES) {
      const label = PRODUCTION_STAGE_LABELS[stage];
      expect(label).toBeTruthy();
      // Sentence case: a capital first and nothing else shouting.
      expect(label).toBe(label[0].toUpperCase() + label.slice(1).toLowerCase());
    }
  });

  it("is the same list the database will accept", () => {
    /*
      The check constraint in `0018_phase12_production.sql` and this list have
      to agree, and nothing else would notice if they stopped: a bench the app
      offers and the database refuses fails at the counter, with the work
      already done. Read from the migration itself, the same way
      `schema-health.test.ts` reads them.
    */
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/0018_phase12_production.sql"),
      "utf8",
    );

    const constraint = sql.match(/stage text not null check \(stage in \(([\s\S]*?)\)\)/);
    expect(constraint).not.toBeNull();

    const accepted = [...(constraint?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map(
      (found) => found[1],
    );
    expect(accepted).toEqual([...PRODUCTION_STAGES]);
  });

  it("refuses a bench that is not one of them", () => {
    expect(isProductionStage("sewing")).toBe(true);
    expect(isProductionStage("embroidery")).toBe(false);
    expect(isProductionStage("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// One item
// ---------------------------------------------------------------------------

describe("itemProduction", () => {
  it("says an unmarked item has not started, rather than guessing", () => {
    const item = itemProduction(jerseys, []);

    expect(item.started).toBe(false);
    expect(item.reachedIndex).toBe(-1);
    expect(item.reached).toBeNull();
    expect(item.complete).toBe(false);
    expect(itemStatusLabel(item)).toBe("Not started");
  });

  it("reads a run of benches as having got that far", () => {
    const item = itemProduction(jerseys, through("line-1", "print"));

    expect(item.reached).toBe("print");
    expect(item.furthest).toBe("print");
    expect(item.missing).toEqual([]);
    expect(itemStatusLabel(item)).toBe("Print");
  });

  it("NEVER counts a skipped bench as done", () => {
    /*
      The rule this file exists for. Somebody ticked Print without ticking the
      colour test or the pattern. The honest answer is that the item has got
      as far as Design and that two benches behind the printing are blank -
      not that it is at Print and everything under it must have happened.
    */
    const item = itemProduction(jerseys, [
      step("line-1", "design"),
      step("line-1", "print"),
    ]);

    expect(item.reached).toBe("design");
    expect(item.furthest).toBe("print");
    expect(item.missing).toEqual(["colour_test", "pattern"]);
  });

  it("reports a bench ticked with nothing at all behind it", () => {
    const item = itemProduction(jerseys, [step("line-1", "sewing")]);

    expect(item.reached).toBeNull();
    expect(item.furthest).toBe("sewing");
    expect(item.missing).toEqual([
      "design",
      "colour_test",
      "pattern",
      "print",
      "heat_press",
      "fabric_cutting",
    ]);
    expect(itemStatusLabel(item)).toBe("Not started");
  });

  it("is complete only when every bench is marked", () => {
    const nearly = itemProduction(jerseys, through("line-1", "packaging"));
    expect(nearly.complete).toBe(false);
    expect(nearly.reachedIndex).toBe(LAST_STAGE_INDEX - 1);

    const done = itemProduction(jerseys, through("line-1", "ready"));
    expect(done.complete).toBe(true);
    expect(itemStatusLabel(done)).toBe("Ready");
  });

  it("ignores marks belonging to another item", () => {
    const item = itemProduction(jerseys, through("line-2", "ready"));

    expect(item.marked).toEqual([]);
    expect(item.started).toBe(false);
  });

  it("takes the LATEST mark as when it last moved, whatever order they arrive in", () => {
    const item = itemProduction(jerseys, [
      step("line-1", "pattern", "2026-09-20T02:00:00.000Z"),
      step("line-1", "design", "2026-09-19T02:00:00.000Z"),
      step("line-1", "colour_test", "2026-09-21T02:00:00.000Z"),
    ]);

    expect(item.lastMarkedAt).toBe("2026-09-21T02:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// The sum: a project is its least advanced item
// ---------------------------------------------------------------------------

describe("projectProduction", () => {
  it("sums the items to the LEAST advanced one", () => {
    const project = projectProduction({
      items: [jerseys, jacket],
      steps: [...through("line-1", "packaging"), ...through("line-2", "pattern")],
    });

    expect(project.stage).toBe("pattern");
    expect(projectStatusLabel(project)).toBe("Pattern");
    expect(project.behind.map((item) => item.name)).toEqual(["Jacket"]);
  });

  it("does not let nine finished items hide one that has not started", () => {
    /*
      An average would read as 90% and sound like good news. The customer
      collects all of it at once, so the jacket nobody has begun is the whole
      truth about when this project is ready.
    */
    const project = projectProduction({
      items: [jerseys, jacket],
      steps: through("line-1", "ready"),
    });

    expect(project.stage).toBeNull();
    expect(projectStatusLabel(project)).toBe("Not started");
    expect(project.complete).toBe(false);
    expect(project.itemsComplete).toBe(1);
    expect(projectStatusNote(project)).toContain("Jacket");
  });

  it("is ready only when every item is through every bench", () => {
    const project = projectProduction({
      items: [jerseys, jacket],
      steps: [...through("line-1", "ready"), ...through("line-2", "packaging")],
    });
    expect(project.complete).toBe(false);
    expect(projectStatusLabel(project)).toBe("Packaging");

    const finished = projectProduction({
      items: [jerseys, jacket],
      steps: [...through("line-1", "ready"), ...through("line-2", "ready")],
    });
    expect(finished.complete).toBe(true);
    expect(projectStatusLabel(finished)).toBe("Ready");
  });

  it("treats an order with no items as its own state, neither started nor ready", () => {
    const project = projectProduction({ items: [], steps: [] });

    expect(project.noItems).toBe(true);
    expect(project.complete).toBe(false);
    expect(project.stage).toBeNull();
    expect(project.percentMarked).toBe(0);
    expect(projectStatusLabel(project)).toBe("Nothing being made yet");
    expect(projectStatusNote(project)).toContain("Add what is being made");
  });

  it("counts the marks made against the marks there are to make", () => {
    const project = projectProduction({
      items: [jerseys, jacket],
      // Five benches on one item, none on the other, out of twenty.
      steps: through("line-1", "heat_press"),
    });

    expect(project.marksDone).toBe(5);
    expect(project.marksTotal).toBe(20);
    expect(project.percentMarked).toBe(25);
  });

  it("names every item at the back, not just the first", () => {
    const project = projectProduction({
      items: [jerseys, jacket],
      steps: [...through("line-1", "design"), ...through("line-2", "design")],
    });

    expect(project.behind).toHaveLength(2);
    expect(projectStatusNote(project)).toBe("Every item is at design.");
  });

  it("carries a skipped bench up to the project", () => {
    const project = projectProduction({
      items: [jerseys, jacket],
      steps: [
        ...through("line-1", "ready"),
        step("line-2", "design"),
        step("line-2", "sewing"),
      ],
    });

    expect(project.withMissing.map((item) => item.name)).toEqual(["Jacket"]);
    expect(project.stage).toBe("design");
  });

  it("takes the latest mark across every item as when the project last moved", () => {
    const project = projectProduction({
      items: [jerseys, jacket],
      steps: [
        step("line-1", "design", "2026-09-18T01:00:00.000Z"),
        step("line-2", "design", "2026-09-20T09:30:00.000Z"),
      ],
    });

    expect(project.lastMarkedAt).toBe("2026-09-20T09:30:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Where the shop floor and the counter disagree
// ---------------------------------------------------------------------------

describe("statusDisagreement", () => {
  const finished = projectProduction({
    items: [jerseys],
    steps: through("line-1", "ready"),
  });
  const halfway = projectProduction({
    items: [jerseys],
    steps: through("line-1", "print"),
  });

  it("says so when the benches are done and the order has not caught up", () => {
    expect(
      statusDisagreement({
        project: finished,
        orderStatus: "in_production",
        orderStatusLabel: "In production",
      }),
    ).toContain("In production");
  });

  it("says so when the order says ready and the benches are not", () => {
    const message = statusDisagreement({
      project: halfway,
      orderStatus: "ready",
      orderStatusLabel: "Ready for pickup",
    });

    expect(message).toContain("Ready for pickup");
    expect(message).toContain("1 item has");
  });

  it("stays quiet when the two agree", () => {
    expect(
      statusDisagreement({
        project: finished,
        orderStatus: "released",
        orderStatusLabel: "Released",
      }),
    ).toBeNull();
    expect(
      statusDisagreement({
        project: halfway,
        orderStatus: "in_production",
        orderStatusLabel: "In production",
      }),
    ).toBeNull();
  });

  it("stays quiet about a cancelled order and one with nothing on it", () => {
    // A cancelled order's benches are not a disagreement, they are history.
    expect(
      statusDisagreement({
        project: halfway,
        orderStatus: "cancelled",
        orderStatusLabel: "Cancelled",
      }),
    ).toBeNull();

    expect(
      statusDisagreement({
        project: projectProduction({ items: [], steps: [] }),
        orderStatus: "ready",
        orderStatusLabel: "Ready for pickup",
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The line the Apparel screen shows
// ---------------------------------------------------------------------------

describe("summariseProduction", () => {
  const ready = projectProduction({
    items: [jerseys],
    steps: through("line-1", "ready"),
  });
  const untouched = projectProduction({ items: [jacket], steps: [] });
  const gappy = projectProduction({
    items: [jacket],
    steps: [step("line-2", "design"), step("line-2", "print")],
  });
  const empty = projectProduction({ items: [], steps: [] });

  it("counts what the shop needs to act on", () => {
    const summary = summariseProduction([ready, untouched, gappy, empty]);

    expect(summary.projects).toBe(4);
    expect(summary.ready).toBe(1);
    expect(summary.notStarted).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.noItems).toBe(1);
    expect(summary.marksDone).toBe(12);
    // Three projects with one item each; the empty one adds no benches.
    expect(summary.marksTotal).toBe(30);
  });

  it("says nothing is on the bench rather than that all is well", () => {
    expect(productionSummaryLine(summariseProduction([]))).toBe(
      "No projects on the bench.",
    );
  });

  it("always ends with the count of marks, so an untouched report says so", () => {
    expect(productionSummaryLine(summariseProduction([untouched]))).toBe(
      "1 not started · 0 of 10 benches marked",
    );
  });
});
