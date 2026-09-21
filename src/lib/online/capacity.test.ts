import { describe, expect, it } from "vitest";

import { fullMarker, loadByDate } from "./capacity";
import type { OrderStatus } from "./types";

const order = (status: OrderStatus, day: number, pieces: number) => ({
  status,
  dateNeeded: { year: 2026, month: 9, day },
  pieces,
});

describe("loadByDate", () => {
  it("adds up the pieces promised for each date", () => {
    const load = loadByDate(
      [order("confirmed", 25, 24), order("in_production", 25, 18), order("new", 26, 6)],
      60,
    );
    expect(load.get("2026-09-25")).toMatchObject({ pieces: 42, orders: 2, full: false });
    expect(load.get("2026-09-26")).toMatchObject({ pieces: 6, orders: 1 });
  });

  it("marks a day full only once the capacity is passed, not when it is met", () => {
    const at = loadByDate([order("confirmed", 25, 60)], 60);
    expect(at.get("2026-09-25")?.full).toBe(false);

    const over = loadByDate([order("confirmed", 25, 61)], 60);
    expect(over.get("2026-09-25")?.full).toBe(true);
  });

  it("leaves out work that has already gone out or was called off", () => {
    const load = loadByDate(
      [order("completed", 25, 100), order("cancelled", 25, 100), order("new", 25, 5)],
      60,
    );
    expect(load.get("2026-09-25")?.pieces).toBe(5);
  });

  it("knows of no full day at all until the owner says what full is", () => {
    /*
      The rule the module exists for. With no capacity set, a day of 200 pieces
      is not "full" - it is a day nobody has said anything about. Marking it
      full against a made-up sixty would turn a customer away from a day the
      shop was free.
    */
    const load = loadByDate([order("confirmed", 25, 200)], null);
    expect(load.get("2026-09-25")?.full).toBeNull();
    expect(fullMarker(load.get("2026-09-25"))).toBeNull();
  });
});

describe("fullMarker", () => {
  it("says how many pieces make the day full", () => {
    const load = loadByDate([{ status: "confirmed", dateNeeded: { year: 2026, month: 9, day: 25 }, pieces: 74 }], 60);
    expect(fullMarker(load.get("2026-09-25"))).toBe("FULL 74");
  });

  it("says nothing about a day with no orders on it", () => {
    expect(fullMarker(undefined)).toBeNull();
  });
});
