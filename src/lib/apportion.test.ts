import assert from "node:assert/strict";
import { test } from "node:test";

import { apportion } from "./apportion.ts";

test("parts always sum back to the total", () => {
  for (let trial = 0; trial < 5000; trial += 1) {
    const count = 1 + Math.floor(Math.random() * 6);
    const weights = Array.from(
      { length: count },
      () => 1 + Math.floor(Math.random() * 50_000),
    );
    const total = Math.floor(Math.random() * 500_000);
    const parts = apportion(total, weights);

    assert.equal(
      parts.reduce((a, b) => a + b, 0),
      total,
      `split of ${total} across ${JSON.stringify(weights)} did not sum back`,
    );
    assert.ok(parts.every((p) => Number.isInteger(p) && p >= 0));
  }
});

test("thirds do not lose a centavo", () => {
  assert.deepEqual(apportion(1000, [1, 1, 1]), [334, 333, 333]);
});

test("stays proportional", () => {
  assert.deepEqual(apportion(1000, [3, 1]), [750, 250]);
});

test("degenerate inputs", () => {
  assert.deepEqual(apportion(0, [5, 5]), [0, 0]);
  assert.deepEqual(apportion(100, [0, 0]), [0, 0]);
  assert.deepEqual(apportion(100, [1]), [100]);
});
