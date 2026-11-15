import assert from "node:assert/strict";
import { test } from "node:test";
import { byRound, compareRounds, median, slowerNeeded } from "./compare.mjs";

/** Frames for each round: `size` frames at each round's value. */
const frames = (values, size = 5) => values.flatMap((value) => Array(size).fill(value));

test("a slow stretch in one round no longer decides the run, as the mean did on an avatar-only pull request (#1526)", () => {
  // Run 43718481759's per-round medians: on 54.5 ms on average in the first round, near ref in the rest.
  const on = frames([37, 19, 16, 17, 19, 15, 15, 13, 18, 13]);
  const ref = frames([17, 17, 14, 15, 19, 33, 13, 14.5, 20, 14]);
  const result = compareRounds(on, ref, 10);
  assert.equal(result.slower, 5);
  assert.equal(result.costsMore, false);
});

test("surfaces slower in nearly every round cost more, even by a millisecond", () => {
  const ref = frames([12, 14, 13, 15, 12, 16, 13, 12, 14, 13]);
  const on = frames([13, 15, 14, 16, 13, 17, 14, 13, 15, 12]);
  const result = compareRounds(on, ref, 10);
  assert.deepEqual([result.slower, result.faster, result.needed], [9, 1, 9]);
  assert.equal(result.costsMore, true);
});

test("tied rounds count for neither side", () => {
  const ref = frames([12, 12, 12, 12, 12, 12, 12, 12, 12, 12]);
  const on = frames([13, 13, 13, 13, 13, 12, 12, 12, 12, 12]);
  const result = compareRounds(on, ref, 10);
  assert.deepEqual([result.slower, result.faster, result.needed, result.costsMore], [5, 0, 5, true]);
});

test("the slower rounds needed are the fewest that chance alone gives at most 5% of the time", () => {
  assert.deepEqual([4, 5, 8, 10].map(slowerNeeded), [5, 5, 7, 9]);
});

test("frames that do not split into equal rounds are an error, not a guess", () => {
  assert.throws(() => byRound([1, 2, 3], 2), /3 frames do not split into 2 rounds/);
  assert.deepEqual(byRound([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});
