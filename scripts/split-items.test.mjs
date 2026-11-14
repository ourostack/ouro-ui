import assert from "node:assert/strict";
import test from "node:test";
import { split } from "./split-items.mjs";

test("split-items puts the largest item first into the lightest group and drops none", () => {
  const sizes = { a: 9, b: 5, c: 4, d: 3, e: 3 };
  const groups = split(Object.keys(sizes), (item) => sizes[item], 2);
  assert.deepEqual(groups.flat().sort(), ["a", "b", "c", "d", "e"]);
  const totals = groups.map((group) => group.reduce((sum, item) => sum + sizes[item], 0));
  assert.ok(Math.abs(totals[0] - totals[1]) <= 2, String(totals));
});
