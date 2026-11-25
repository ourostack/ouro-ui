import assert from "node:assert/strict";
import test from "node:test";
import { classifyPaintedFrames } from "../registry/ouro/e2e/ouro/painted-frames.ts";

const frames = (heights) => heights.map((height) => ({ height, runs: 1 }));

test("classifyPaintedFrames: a clean shrink has no glitches, and every frame is sound in order", () => {
  const { torn, stale, sound } = classifyPaintedFrames(frames([100, 90, 70, 40, 20, 10]), -1);
  assert.equal(torn.size, 0);
  assert.equal(stale.size, 0);
  assert.deepEqual(
    sound.map((row) => row.height),
    [100, 90, 70, 40, 20, 10],
  );
});

test("classifyPaintedFrames: a frame spliced from two paints (more than one run) is torn, whatever its height", () => {
  const body = frames([100, 90, 70, 40, 20, 10]);
  body[2] = { height: 70, runs: 2 };
  const { torn, stale, sound } = classifyPaintedFrames(body, -1);
  assert.deepEqual([...torn], [2]);
  assert.equal(stale.size, 0);
  assert.equal(sound.length, 5);
});

test("classifyPaintedFrames: a lone frame that reads behind both neighbours (a dip) is stale", () => {
  // 70 → a stray 85 (a frame further back along the shrink than either neighbour) → 40: a V-notch.
  const { torn, stale, sound } = classifyPaintedFrames(frames([100, 90, 70, 85, 40, 20, 10]), -1);
  assert.equal(torn.size, 0);
  assert.deepEqual([...stale], [3]);
  assert.deepEqual(
    sound.map((row) => row.height),
    [100, 90, 70, 40, 20, 10],
  );
});

test("classifyPaintedFrames: a lone frame that reads ahead of both neighbours (a forward spike) is stale too, and alone", () => {
  // This is the shape #3791 missed: 70 → a stray 35 (already past where 40 has reached along the
  // shrink) → 40 → 20. The old, dip-only filter let the spike stand as sound, so the very next
  // step (40 after 35) read as the box growing by 5 mid-shrink and failed the monotonic check.
  // Judging the spike against the last SOUND frame (70), not the raw frame right before it, keeps
  // 40 itself from then misreading as a second glitch relative to the spike's own stray value.
  const { torn, stale, sound } = classifyPaintedFrames(frames([100, 90, 70, 35, 40, 20, 10]), -1);
  assert.equal(torn.size, 0);
  assert.deepEqual([...stale], [3]);
  assert.deepEqual(
    sound.map((row) => row.height),
    [100, 90, 70, 40, 20, 10],
  );
});

test("classifyPaintedFrames: the first and last frame are never flagged, even as a local extremum", () => {
  // A caller checks the run's own first/last frame against from/to itself, with its own wider
  // tolerance; the interior filter must never add index 0 or the last index to stale itself,
  // whatever their height, so that wider check is never skipped by a double classification here.
  const { stale } = classifyPaintedFrames(frames([5, 90, 70, 40, 20, 95]), -1);
  assert.equal(stale.has(0), false);
  assert.equal(stale.has(5), false);
});

test("classifyPaintedFrames: within tolerance is never a glitch, on either side", () => {
  const { stale } = classifyPaintedFrames(frames([100, 90, 88, 70, 20, 10]), -1);
  assert.deepEqual([...stale], []);
});
