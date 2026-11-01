import assert from "node:assert/strict";
import { test } from "node:test";
import { LATENCY, asOnReference } from "../e2e/latency.ts";

test("on a runner of the reference runner's pace, every press is judged as measured", () => {
  for (const fixed of [0, 16, 24, 32, 48]) for (let sample = 16; sample <= 240; sample += 8) assert.equal(asOnReference(sample, fixed, 1), sample);
});

test("a press's CPU part is judged at the reference runner's pace, and its fixed part as measured", () => {
  // A runner 1.5 times slower: 32 ms fixed, then 96 ms of CPU that took 64 on the reference runner.
  assert.equal(asOnReference(128, 32, 1.5), 96);
  // A runner twice as fast: 32 ms fixed, then 32 ms of CPU that took 64 on the reference runner.
  assert.equal(asOnReference(64, 32, 0.5), 96);
  // A press within the fixed part has no CPU part to scale.
  assert.equal(asOnReference(24, 32, 0.5), 24);
  assert.equal(asOnReference(24, 32, 2), 24);
});

test("the budget, the samples and the throttle are the same on every runner", () => {
  assert.equal(LATENCY.p95, 100);
  assert.equal(LATENCY.samples, 20);
  assert.equal(LATENCY.warmUps, 2);
  assert.equal(LATENCY.throttle, 4);
});
