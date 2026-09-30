import { describe, expect, it } from "vitest";

import { parseChartRows } from "./size-chart";

describe("parseChartRows", () => {
  it("keeps rows of cells as strings", () => {
    expect(parseChartRows([["S", 18, null], ["M", "19", 27]])).toEqual([
      ["S", "18", ""],
      ["M", "19", "27"],
    ]);
  });

  it("drops anything that is not a row, and copes with a non-array", () => {
    expect(parseChartRows([["S"], "junk", { a: 1 }])).toEqual([["S"]]);
    expect(parseChartRows(null)).toEqual([]);
    expect(parseChartRows({})).toEqual([]);
  });
});
