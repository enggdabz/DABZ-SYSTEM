import { describe, expect, it } from "vitest";

import {
  canMarkStage,
  canUndo,
  currentStage,
  lastDoneStage,
  orderPath,
  progress,
  stageNote,
  stagesForPath,
  statusAfterMarking,
  stepViews,
} from "./production";
import type { ProductionRow, ProductionStage } from "./types";

/** The eight the migration seeds, in the order it seeds them. */
const STAGES: ProductionStage[] = [
  { key: "design", label: "Design", customerLabel: "Design", description: "", position: 1, inDtfPath: true },
  { key: "pattern", label: "Pattern", customerLabel: "Pattern", description: "", position: 2, inDtfPath: false },
  { key: "print", label: "Print", customerLabel: "Print", description: "", position: 3, inDtfPath: true },
  { key: "heat_press", label: "Heat press", customerLabel: "Heat press", description: "", position: 4, inDtfPath: true },
  { key: "tabas", label: "Tabas", customerLabel: "Cutting (tabas)", description: "", position: 5, inDtfPath: false },
  { key: "sewing", label: "Sewing", customerLabel: "Sewing", description: "", position: 6, inDtfPath: false },
  { key: "quality_check", label: "Quality check", customerLabel: "Quality check", description: "", position: 7, inDtfPath: true },
  { key: "packaging", label: "Packaging", customerLabel: "Packaging", description: "", position: 8, inDtfPath: true },
];

const done = (...keys: string[]): ProductionRow[] =>
  keys.map((stageKey) => ({
    stageKey,
    doneAt: "2026-09-16T02:00:00Z",
    doneByName: "Juan Staff",
    skipped: false,
  }));

describe("orderPath", () => {
  it("takes the short path only when every item is a DTF print", () => {
    expect(orderPath([{ productionPath: "dtf" }, { productionPath: "dtf" }])).toBe("dtf");
  });

  it("takes the long path when one item is sublimated", () => {
    /*
      "Every item", not "any item". One jersey in an order of ten DTF shirts
      still has to be cut and sewn, so the whole order goes the long way.
    */
    expect(orderPath([{ productionPath: "dtf" }, { productionPath: "full" }])).toBe("full");
  });

  it("takes the long path for an order with nothing in it - the safe direction", () => {
    expect(orderPath([])).toBe("full");
  });
});

describe("stagesForPath", () => {
  it("is all eight on the full path", () => {
    expect(stagesForPath(STAGES, "full")).toHaveLength(8);
  });

  it("is five on the DTF path, and skips pattern, tabas and sewing", () => {
    const keys = stagesForPath(STAGES, "dtf").map((stage) => stage.key);
    expect(keys).toEqual(["design", "print", "heat_press", "quality_check", "packaging"]);
  });

  it("puts them in position order however they arrive", () => {
    const shuffled = [...STAGES].reverse();
    expect(stagesForPath(shuffled, "full").map((s) => s.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });
});

describe("currentStage", () => {
  it("is the first step with nothing against it", () => {
    expect(currentStage(STAGES, "full", done("design", "pattern"))?.key).toBe("print");
  });

  it("is the first step of all on an order nobody has started", () => {
    expect(currentStage(STAGES, "full", [])?.key).toBe("design");
  });

  it("is nothing at all once every step is done", () => {
    expect(
      currentStage(STAGES, "dtf", done("design", "print", "heat_press", "quality_check", "packaging")),
    ).toBeNull();
  });

  it("ignores a row for a step that is not on this order's path", () => {
    // A row for `pattern` on a DTF order cannot make `print` the current step.
    expect(currentStage(STAGES, "dtf", done("pattern"))?.key).toBe("design");
  });
});

describe("stepViews", () => {
  it("marks a step that was not needed as done, not as skipped over", () => {
    const rows: ProductionRow[] = [
      { stageKey: "design", doneAt: "x", doneByName: "Juan", skipped: false },
      { stageKey: "pattern", doneAt: "x", doneByName: "Juan", skipped: true },
    ];
    const views = stepViews(STAGES, "full", rows);
    expect(views[1].state).toBe("done");
    expect(views[1].row?.skipped).toBe(true);
    expect(views[2].state).toBe("current");
    expect(views[3].state).toBe("future");
  });

  it("has exactly one current step, or none", () => {
    const views = stepViews(STAGES, "full", done("design"));
    expect(views.filter((view) => view.state === "current")).toHaveLength(1);
  });
});

describe("progress and stageNote", () => {
  it("counts the steps done out of the steps there are", () => {
    expect(progress(STAGES, "full", done("design", "pattern", "print", "heat_press", "tabas"))).toEqual({
      done: 5,
      total: 8,
      percent: 63,
    });
  });

  it("counts out of five on a DTF order", () => {
    expect(progress(STAGES, "dtf", done("design")).total).toBe(5);
  });

  it("reads as the shop would say it", () => {
    expect(stageNote(STAGES, "full", done("design", "pattern", "print", "heat_press", "tabas"))).toBe(
      "Sewing · 5 of 8",
    );
  });

  it("says nothing once everything is done - there is no step to name", () => {
    expect(
      stageNote(STAGES, "dtf", done("design", "print", "heat_press", "quality_check", "packaging")),
    ).toBeNull();
  });
});

describe("canMarkStage", () => {
  it("allows the current step on a confirmed order", () => {
    expect(canMarkStage({ status: "confirmed" }, STAGES, "full", [], "design").allowed).toBe(true);
  });

  it("refuses a step in the middle", () => {
    const check = canMarkStage({ status: "in_production" }, STAGES, "full", done("design"), "sewing");
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Pattern");
  });

  it("refuses everything on an order that has not been confirmed", () => {
    expect(canMarkStage({ status: "new" }, STAGES, "full", [], "design").allowed).toBe(false);
    expect(canMarkStage({ status: "quoted" }, STAGES, "full", [], "design").allowed).toBe(false);
  });

  it("refuses everything once the order is packed", () => {
    expect(
      canMarkStage({ status: "ready_to_ship" }, STAGES, "dtf", done("design"), "print").allowed,
    ).toBe(false);
  });
});

describe("statusAfterMarking", () => {
  it("stays in production while a step is left", () => {
    expect(statusAfterMarking(STAGES, "full", done("design"))).toBe("in_production");
  });

  it("becomes ready to ship when the last one is done", () => {
    expect(
      statusAfterMarking(
        STAGES,
        "dtf",
        done("design", "print", "heat_press", "quality_check", "packaging"),
      ),
    ).toBe("ready_to_ship");
  });
});

describe("canUndo and lastDoneStage", () => {
  it("takes back the last step in PATH order, not the last row written", () => {
    /*
      Rows carry a timestamp and could arrive in any order. Walking back along
      the path is what makes undo mean "one step back" rather than "whichever
      was ticked most recently".
    */
    const rows = done("pattern", "design");
    expect(lastDoneStage(STAGES, "full", rows)?.key).toBe("pattern");
  });

  it("is allowed while the order is in production or packed", () => {
    expect(canUndo({ status: "in_production" }, STAGES, "full", done("design")).allowed).toBe(true);
    expect(canUndo({ status: "ready_to_ship" }, STAGES, "dtf", done("design")).allowed).toBe(true);
  });

  it("is not allowed before production, or once the order is finished", () => {
    expect(canUndo({ status: "confirmed" }, STAGES, "full", []).allowed).toBe(false);
    expect(canUndo({ status: "completed" }, STAGES, "full", done("design")).allowed).toBe(false);
  });

  it("has nothing to take back when no step has been done", () => {
    expect(canUndo({ status: "in_production" }, STAGES, "full", []).allowed).toBe(false);
  });

  it("undoing from packed leaves an order that is no longer ready", () => {
    const all = done("design", "print", "heat_press", "quality_check", "packaging");
    const undone = all.filter((row) => row.stageKey !== "packaging");
    expect(statusAfterMarking(STAGES, "dtf", undone)).toBe("in_production");
    expect(currentStage(STAGES, "dtf", undone)?.key).toBe("packaging");
  });
});
