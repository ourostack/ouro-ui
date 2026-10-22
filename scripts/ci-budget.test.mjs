import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { baseline, budget, criticalPath, jobGraph, judge, percentile, recordPassed, runnerTime, runWalls, unzipOne, wallTime } from "./ci-budget.mjs";

const workflow = `name: CI
jobs:
  plan:
    runs-on: ubuntu-latest
  browser:
    needs: [plan]
    strategy:
      matrix:
        shard: [1, 2]
    name: browser (\${{ matrix.shard }}/2)
  ci:
    needs: [plan, browser]
  lint:
    runs-on: ubuntu-latest
  install:
    strategy:
      matrix:
        variant: [namespace, next]
    name: install (\${{ matrix.variant }})
  install-gate:
    needs: [install-shard]
    strategy:
      matrix:
        variant: [shadcn]
    name: install (\${{ matrix.variant }})
  ci-budget:
    needs: [ci, lint]
`;

/** A job of the API: created at `created`, started at `start` and done at `end`, in minutes after 12:00. */
const job = (name, created, start, end, conclusion = "success") => {
  const at = (minutes) => new Date(Date.UTC(2026, 9, 20, 12, 0, minutes * 60)).toISOString();
  return { name, created_at: at(created), started_at: start === null ? null : at(start), completed_at: end === null ? null : at(end), conclusion };
};

test("a job's checks are matched by its name, with each matrix value it lists", () => {
  const graph = jobGraph(workflow);
  const owner = (name) => graph.filter((node) => node.pattern.test(name)).map((node) => node.id);
  assert.deepEqual(owner("browser (2/2)"), ["browser"]);
  assert.deepEqual(owner("install (next)"), ["install"]);
  assert.deepEqual(owner("install (shadcn)"), ["install-gate"]);
  assert.deepEqual(owner("ci"), ["ci"]);
  assert.deepEqual(owner("ci-budget"), ["ci-budget"]);
  assert.deepEqual(graph.find((node) => node.id === "ci").needs, ["plan", "browser"]);
});

test("a check whose name holds an expression other than a matrix value (a shard count its needs compute) is matched too", () => {
  const graph = jobGraph(`name: CI
jobs:
  mutation-shard:
    strategy:
      matrix:
        shard: \${{ fromJSON(needs.mutation-plan.outputs.shards) }}
    name: mutation (\${{ matrix.shard }}/\${{ needs.mutation-plan.outputs.count }})
  mutation:
    needs: [mutation-shard]
`);
  const owner = (name) => graph.filter((node) => node.pattern.test(name)).map((node) => node.id);
  assert.deepEqual(owner("mutation (2/5)"), ["mutation-shard"]);
  assert.deepEqual(owner("mutation"), ["mutation"]);
});

test("the critical path follows needs through the slowest job of each matrix, and leaves queues out", () => {
  const jobs = [
    job("plan", 0, 0, 1),
    // Queued for 5 minutes: only its 3 running minutes count.
    job("browser (1/2)", 1, 6, 9),
    job("browser (2/2)", 1, 1, 5),
    job("ci", 9, 9, 10),
    job("lint", 0, 0, 6),
    job("install (next)", 0, 0, 2),
    job("ci-budget", 10, 10, null),
  ];
  const path = criticalPath(jobs, jobGraph(workflow));
  assert.deepEqual(path.jobs.map((entry) => [entry.name, entry.seconds / 60]), [["plan", 1], ["browser (2/2)", 4], ["ci", 1]]);
  assert.equal(path.seconds, 6 * 60);
  assert.deepEqual(path.unmatched, []);
  // The wall time counts the queue: 12:00 to 12:10, the budget job left out.
  assert.equal(wallTime(jobs, jobGraph(workflow)), 10 * 60);
});

test("a skipped job adds nothing, and a job no name matches is reported", () => {
  const path = criticalPath([job("plan", 0, 0, 1), job("browser (1/2)", 1, 1, 9, "skipped"), job("lint", 0, 0, 3), job("mystery", 0, 0, 30)], jobGraph(workflow));
  assert.equal(path.seconds, 3 * 60);
  assert.deepEqual(path.unmatched, ["mystery"]);
});

test("a pull request over the budget fails only when it is also more than 2 minutes over main's baseline", () => {
  const limit = budget.targetMinutes * 60 * (1 + budget.margin);
  const min = 60;
  const pr = (criticalSeconds, baselineSeconds) => judge({ event: "pull_request", criticalSeconds, baselineSeconds });
  // Within the budget: nothing, whatever main does.
  assert.deepEqual(pr(limit, 9 * min), { fail: false, warning: null });
  assert.deepEqual(pr(limit, 14 * min), { fail: false, warning: null });
  // Over it and more than 2 minutes over main's baseline: this change made it slower.
  assert.deepEqual(pr(12.5 * min, 10 * min), { fail: true, reason: "regression", warning: null });
  // Over it but within 2 minutes of the baseline: a slow runner, more likely than this change.
  assert.deepEqual(pr(12.5 * min, 10.5 * min), { fail: false, warning: "over" });
  assert.deepEqual(pr(12 * min + 1, 10 * min + 1), { fail: false, warning: "over" });
});

test("after main slowed down, a pull request near main's baseline only warns, the one that fixes it included, and one clearly slower still fails", () => {
  const min = 60;
  const pr = (criticalSeconds, baselineSeconds) => judge({ event: "pull_request", criticalSeconds, baselineSeconds });
  // Main's own baseline over the budget, and the pull request within 2 minutes of it: a warning.
  assert.deepEqual(pr(14 * min, 13 * min), { fail: false, warning: "over" });
  // A fix that only partly helps is still over the budget, and still passes.
  assert.deepEqual(pr(12.5 * min, 14 * min), { fail: false, warning: "over" });
  // More than 2 minutes over a baseline that is itself over the budget: this change made it slower still.
  assert.deepEqual(pr(14.9 * min, 12.5 * min), { fail: true, reason: "regression", warning: null });
  // A pull request far over a slow main still fails past the ceiling.
  assert.deepEqual(pr(budget.ceilingMinutes * min + 1, 14 * min), { fail: true, reason: "ceiling", warning: null });
});

test("a run with a job that no ci.yml job matches fails, whatever its event, so the critical path never leaves a job out", () => {
  for (const event of ["pull_request", "merge_group", "push"]) {
    assert.deepEqual(judge({ event, criticalSeconds: 60, baselineSeconds: 60, unmatched: ["install (shadcn, nova, 3/3)"] }), { fail: true, reason: "unmatched", warning: null });
  }
  assert.deepEqual(judge({ event: "pull_request", criticalSeconds: 60, baselineSeconds: 60, unmatched: [] }), { fail: false, warning: null });
});

test("with no baseline a pull request only warns, past the ceiling it fails, and only a pull request is judged", () => {
  const min = 60;
  assert.deepEqual(judge({ event: "pull_request", criticalSeconds: 13 * min, baselineSeconds: null }), { fail: false, warning: "no-baseline" });
  assert.deepEqual(judge({ event: "pull_request", criticalSeconds: budget.ceilingMinutes * min + 1, baselineSeconds: null }), { fail: true, reason: "ceiling", warning: null });
  for (const event of ["push", "merge_group", "workflow_dispatch"]) assert.deepEqual(judge({ event, criticalSeconds: 30 * min, baselineSeconds: 9 * min }), { fail: false, warning: null });
});

test("main's baseline is the median of the critical paths its latest passing merge queue runs recorded in their own ci-timings, ci-budget's own result aside", () => {
  // A merge queue run's ci-timings record: its critical path as that run's ci.yml measured it, and its jobs but ci-budget, still running then.
  const run = (minutes, { attempt = 1, conclusion = "success" } = {}) => ({
    attempt,
    record: { criticalPathSeconds: minutes * 60, jobs: [{ job: "plan", conclusion: "success" }, { job: "browser (1/2)", conclusion }, { job: "install (next)", conclusion: "skipped" }] },
  });
  assert.equal(recordPassed(run(5).record), true);
  assert.equal(recordPassed(run(5, { conclusion: "failure" }).record), false);
  assert.equal(recordPassed(run(5, { conclusion: "cancelled" }).record), false);
  // ci-budget's own result, had it been recorded, does not count.
  assert.equal(recordPassed({ criticalPathSeconds: 60, jobs: [{ job: "plan", conclusion: "success" }, { job: "ci-budget", conclusion: "failure" }] }), true);
  assert.equal(recordPassed({ criticalPathSeconds: 60, jobs: [] }), false);
  const runs = [run(20, { conclusion: "failure" }), run(10), run(30, { attempt: 2 }), run(11), run(8), run(9), run(12), run(40)];
  // The failed run and the re-run are left out; the first five that passed count, newest first.
  const main = baseline(runs);
  assert.deepEqual(main.values.map((value) => value / 60), [10, 11, 8, 9, 12]);
  assert.equal(main.seconds, 10 * 60);
  // A run with no ci-timings record is left out.
  assert.deepEqual(baseline([{ attempt: 1, record: null }, run(5, { conclusion: "failure" })]), { seconds: null, values: [] });
  assert.equal(budget.baselineRuns, 5);
  assert.equal(budget.regressionMinutes, 2);
});

test("an artifact's one file comes out of its zip, stored or deflated, sizes read from the central directory", () => {
  const zip = (name, content, method) => {
    const data = method === 8 ? deflateRawSync(content) : content;
    const nameBytes = Buffer.from(name);
    // A streamed local header: sizes 0, given after the data and in the central directory.
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(0, 42);
    const descriptor = Buffer.alloc(16);
    const centralAt = local.length + nameBytes.length + data.length + descriptor.length;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + nameBytes.length, 12);
    end.writeUInt32LE(centralAt, 16);
    return Buffer.concat([local, nameBytes, data, descriptor, central, nameBytes, end]);
  };
  const record = Buffer.from(JSON.stringify({ full: true, criticalPathSeconds: 600 }));
  assert.deepEqual(JSON.parse(unzipOne(zip("ci-timings.json", record, 8)).toString()), { full: true, criticalPathSeconds: 600 });
  assert.equal(unzipOne(zip("ci-timings.json", record, 0)).toString(), record.toString());
  assert.throws(() => unzipOne(Buffer.from("not a zip")), /not a zip archive/);
});


test("the runner time adds every job's run time but this one's and a skipped job's", () => {
  const jobs = [job("plan", 0, 0, 1), job("browser (1/2)", 1, 6, 9), job("browser (2/2)", 1, 1, 5), job("lint", 0, 0, 6, "skipped"), job("ci-budget", 10, 10, 11)];
  assert.equal(runnerTime(jobs, jobGraph(workflow)), (1 + 3 + 4) * 60);
});

test("the wall times of the latest runs count their queues, and leave out unfinished and cancelled runs", () => {
  const at = (minutes) => new Date(Date.UTC(2026, 9, 20, 12, minutes)).toISOString();
  const run = (start, end, conclusion = "success", status = "completed") => ({ status, conclusion, created_at: at(0), run_started_at: at(start), updated_at: at(end) });
  const walls = runWalls([run(0, 30), run(5, 25, "failure"), run(0, 40, "cancelled"), run(0, 50, null, "in_progress"), { ...run(0, 12), run_started_at: undefined }]);
  assert.deepEqual(walls, [30 * 60, 20 * 60, 12 * 60]);
  assert.equal(percentile(walls, 0.5), 20 * 60);
  assert.equal(percentile(walls, 0.9), 30 * 60);
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([7], 0.9), 7);
});
