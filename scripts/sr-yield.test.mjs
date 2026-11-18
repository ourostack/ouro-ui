import assert from "node:assert/strict";
import { test } from "node:test";
import { DEADLINE_MS, ERRORS, POLL_MS, RESERVE } from "./ci-yield.mjs";
import { laneWaiting, yieldToLane } from "./sr-yield.mjs";

// The yield to main's screen-reader lane (scripts/sr-yield.mjs): that a pull request's lane waits
// while a macOS job of the lane's runs holds or waits for a runner, starts at the deadline, and fails
// open on rate limits and repeated read errors.

const macos = ["macos-26"];
const linux = ["ubuntu-latest"];
const job = (status, labels = macos) => ({ status, labels });
const run = (id, status = "in_progress") => ({ id, status });

/** A fake gh: each runs read takes the next of `states` (the last repeats), and a jobs read answers from the state of the runs read before it, with the requests left. */
function fakeGh(states, { left = 900, fail = null } = {}) {
  const calls = [];
  let lists = 0;
  let current = states[0];
  let errors = 0;
  const gh = (args) => {
    calls.push(args.join(" "));
    const url = args.at(-1);
    if (fail !== null && errors++ >= fail.from) throw Object.assign(new Error(fail.message), { stderr: fail.message });
    if (!url.includes("/jobs?")) current = states[Math.min(lists++, states.length - 1)];
    const id = url.match(/runs\/(\d+)\/jobs/)?.[1];
    const body = id ? { total_count: current.jobs[id].length, jobs: current.jobs[id] } : { workflow_runs: current.runs };
    return `HTTP/2.0 200 OK\nx-ratelimit-remaining: ${left}\n\n${JSON.stringify(body)}`;
  };
  return { gh, calls };
}

/** Runs yieldToLane on a fake clock: each wait moves the clock on. */
async function drive(gh) {
  let clock = 0;
  const logs = [];
  const waits = [];
  const result = await yieldToLane({ gh, repo: "o/r", now: () => clock, wait: async (ms) => { waits.push(ms); clock += ms; }, log: (line) => logs.push(line) });
  return { result, logs, waits };
}

test("only a lane job that holds or waits for a macOS runner counts, and a queued run with no job listed yet", () => {
  const open = [
    { run: run(1), jobs: [job("in_progress"), job("completed"), job("queued"), job("in_progress", linux)] },
    { run: run(2, "queued"), jobs: [] },
    { run: run(3), jobs: [job("completed"), job("in_progress", linux)] },
  ];
  assert.deepEqual(laneWaiting(open), { count: 3, runs: [1, 2] });
});

test("a lane with no macOS job held or waited for does not hold a pull request's lane back", () => {
  assert.deepEqual(laneWaiting([{ run: run(4), jobs: [job("completed")] }]), { count: 0, runs: [] });
});

test("the yield starts at once when the lane holds no macOS runner", async () => {
  const { gh } = fakeGh([{ runs: [{ id: 5, status: "completed" }], jobs: {} }]);
  const { result, waits } = await drive(gh);
  assert.equal(result, "clear");
  assert.deepEqual(waits, []);
});

test("the yield waits while main's lane holds a macOS runner, reading once a minute, and starts once it is done", async () => {
  const busy = { runs: [run(6)], jobs: { 6: [job("in_progress"), job("completed")] } };
  const done = { runs: [{ id: 6, status: "completed" }], jobs: { 6: [] } };
  const { gh } = fakeGh([busy, busy, done]);
  const { result, waits, logs } = await drive(gh);
  assert.equal(result, "clear");
  assert.deepEqual(waits, [POLL_MS, POLL_MS]);
  assert.ok(logs.some((line) => /hold or wait for a macOS runner \(runs 6\)/.test(line)));
});

test("the yield starts the lane at the deadline, when the lane still holds a macOS runner", async () => {
  const busy = { runs: [run(7)], jobs: { 7: [job("queued")] } };
  const { gh } = fakeGh([busy]);
  const { result, waits, logs } = await drive(gh);
  assert.equal(result, "deadline");
  assert.equal(waits.length, DEADLINE_MS / POLL_MS);
  assert.ok(logs.some((line) => /starts anyway/.test(line)));
});

test("the yield starts the lane when the API rate limits the repository, rather than holding a required check", async () => {
  const { gh } = fakeGh([{ runs: [run(8)], jobs: { 8: [job("in_progress")] } }], { left: RESERVE - 1 });
  const { result, waits, logs } = await drive(gh);
  assert.equal(result, "rate-limited");
  assert.deepEqual(waits, []);
  assert.ok(logs.some((line) => /rate limiting/.test(line)));
});

test("the yield starts the lane after the reads fail in a row, and retries in between", async () => {
  const { gh } = fakeGh([{ runs: [], jobs: {} }], { fail: { from: 0, message: "HTTP 500: server error" } });
  const { result, waits, logs } = await drive(gh);
  assert.equal(result, "errors");
  assert.equal(waits.length, ERRORS - 1);
  assert.equal(logs.filter((line) => /trying again/.test(line)).length, ERRORS - 1);
});
