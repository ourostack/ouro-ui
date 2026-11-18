import assert from "node:assert/strict";
import { test } from "node:test";
import { isLatencyShard, median, probeMedians, quietMedian, runQuiet, runsOf } from "./latency-quiet.mjs";

// A latency shard's log, as GitHub prints it: a timestamp before each line, the probe's lines among the rest.
const log = `2026-11-18T07:19:35.1Z ##[group]Run pnpm test:latency 1
2026-11-18T07:21:02.4Z latency-runner radio-code: script 41.2 ms, frame 16.7 ms (full speed), CPU Apple M2 × 8
2026-11-18T07:21:09.9Z latency-probe radio-code: median 52 ms (quiet 48), factor 1.08; before 48, 64, 56; after 48, 56, 48
2026-11-18T07:23:40.0Z latency-slow radio-code, press 4: 128 ms = 8 ms input delay + 40 ms handlers + 80 ms to the next paint
2026-11-18T07:25:11.3Z latency-probe orders, an item: median 56 ms (quiet 48), factor 1.17; before 48, 72, 64; after 48, 64, 48
2026-11-18T07:27:00.2Z latency-probe palette (again): median 48 ms (quiet 48), factor 1; before 48, 56, 48; after 48, 48, 48
2026-11-18T07:28:00.0Z latency: radio-code: p95 96 ms (≤ 104)
`;

test("the probe medians a shard's log names are read per control, labels with commas and '(again)' included", () => {
  assert.deepEqual(probeMedians(log), [52, 56, 48]);
});

test("a log with no probe line names no probe median", () => {
  assert.deepEqual(probeMedians("2026-11-18T07:19:35.1Z latency-runner radio-code: script 41.2 ms\n"), []);
});

test("a fractional probe median is read as it is printed", () => {
  assert.deepEqual(probeMedians("latency-probe components: median 53.5 ms (quiet 48), factor 1.11; before 48; after 56"), [53.5]);
});

test("a run's quiet reading is the median of every probe median its shards name, and null without any", () => {
  assert.deepEqual(runQuiet([log, "latency-probe alarm: median 44 ms (quiet 48), factor 1; before 40; after 48\n"]), { probes: 4, median: 50 });
  assert.deepEqual(runQuiet([]), { probes: 0, median: null });
});

test("the quiet median is the median of the runs' values, rounded to a whole ms, and null for no runs", () => {
  assert.equal(quietMedian([48, 52, 50, 46, 55]), 50);
  assert.equal(quietMedian([48, 52, 50, 46]), 49);
  assert.equal(quietMedian([47.5, 48.5]), 48);
  assert.equal(quietMedian([]), null);
  assert.equal(median([3, 1, 2]), 2);
});

test("only the latency shards are read, not the aggregate latency job or the other jobs", () => {
  assert.equal(isLatencyShard("latency (1/3)"), true);
  assert.equal(isLatencyShard("latency (3/3)"), true);
  assert.equal(isLatencyShard("latency"), false);
  assert.equal(isLatencyShard("browser (2/4)"), false);
});

test("--runs takes a positive whole number of runs, and 20 when it is not given", () => {
  assert.equal(runsOf([]), 20);
  assert.equal(runsOf(["--runs", "7"]), 7);
  assert.throws(() => runsOf(["--runs"]), /--runs takes a whole number of runs, not nothing/);
  assert.throws(() => runsOf(["--runs", "0"]), /not 0/);
  assert.throws(() => runsOf(["--runs", "2.5"]), /not 2\.5/);
});
