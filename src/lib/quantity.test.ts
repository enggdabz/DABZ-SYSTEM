import assert from "node:assert/strict";
import { test } from "node:test";

import {
  costOfQuantity,
  formatQuantity,
  parseQuantityToThousandths,
} from "./quantity.ts";

test("cost of a whole quantity", () => {
  // 3 units at ₱12.50
  assert.equal(costOfQuantity(3000, 1250), 3750);
});

test("cost of a fractional quantity", () => {
  // 1.5 units at ₱10.00
  assert.equal(costOfQuantity(1500, 1000), 1500);
});

test("rounds half away from zero, matching the SQL", () => {
  // 0.5 thousandths of a centavo must round up, not to even.
  assert.equal(costOfQuantity(1, 500), 1);
  assert.equal(costOfQuantity(-1, 500), -1);
  assert.equal(costOfQuantity(1, 1500), 2);
});

test("quantity round-trips through formatting", () => {
  for (const value of [0, 1, 500, 1000, 1500, 123_456, 999]) {
    assert.equal(parseQuantityToThousandths(formatQuantity(value)), value);
  }
});

test("rejects malformed quantities", () => {
  for (const bad of ["", ".", "-", "1.2345", "abc", "1..2"]) {
    assert.equal(parseQuantityToThousandths(bad), null, `accepted ${bad}`);
  }
});
