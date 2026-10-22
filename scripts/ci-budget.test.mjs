import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { baseline, budget, criticalPath, jobGraph, judge, percentile, previousFull, recordPassed, runnerTime, runWalls, unzipOne, wallTime, workSeconds } from "./ci-budget.mjs";

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

test("a pull request within the budget passes, whatever main does, and one over it with its work near main's only warns", () => {
  const limit = budget.targetMinutes * 60 * (1 + budget.margin);
  const min = 60;
  const pr = (criticalSeconds, baselineSeconds, workSeconds, baselineWorkSeconds) => judge({ event: "pull_request", criticalSeconds, baselineSeconds, workSeconds, baselineWorkSeconds, previousWorkSeconds: workSeconds });
  assert.deepEqual(pr(limit, 9 * min, 9 * min, 5 * min), { fail: false, warning: null });
  assert.deepEqual(pr(limit, 14 * min, 9 * min, 5 * min), { fail: false, warning: null });
  // Over it, its work 3 minutes or less past main's: a slow runner, more likely than this change.
  assert.deepEqual(pr(12.5 * min, 10 * min, 9 * min, 6 * min), { fail: false, warning: "over" });
});

test("after main slowed down, a pull request near main's baseline only warns, the one that fixes it included, and one clearly slower, twice, still fails", () => {
  const min = 60;
  const pr = (criticalSeconds, baselineSeconds, workSeconds, baselineWorkSeconds) => judge({ event: "pull_request", criticalSeconds, baselineSeconds, workSeconds, baselineWorkSeconds, previousWorkSeconds: workSeconds });
  // Main's own baseline over the budget, and the pull request near it: a warning.
  assert.deepEqual(pr(14 * min, 13 * min, 10 * min, 9 * min), { fail: false, warning: "over" });
  // A fix that only partly helps is still over the budget, and still passes.
  assert.deepEqual(pr(12.5 * min, 14 * min, 8 * min, 10 * min), { fail: false, warning: "over" });
  // Its work more than 3 minutes past main's, which is itself over the budget, on this run and the last: this change.
  assert.deepEqual(pr(15.9 * min, 12.5 * min, 12.5 * min, 9 * min), { fail: true, reason: "regression", warning: null });
  // A pull request far over a slow main still fails past the ceiling.
  assert.deepEqual(pr(21 * min + 1, 14 * min, 14 * min, 10 * min), { fail: true, reason: "ceiling", warning: null });
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
  assert.deepEqual(baseline([{ attempt: 1, record: null }, run(5, { conclusion: "failure" })]), { seconds: null, values: [], workSeconds: null, workValues: [] });
  assert.equal(budget.baselineRuns, 5);
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

/** A job of the API with steps: `steps` as [name, minutes], run back to back from 12:00. */
const stepped = (name, steps, conclusion = "success") => {
  const at = (minutes) => new Date(Date.UTC(2026, 9, 20, 12, 0, minutes * 60)).toISOString();
  let now = 0;
  const list = steps.map(([step, minutes]) => {
    const entry = { name: step, started_at: at(now), completed_at: at(now + minutes) };
    now += minutes;
    return entry;
  });
  return { name, created_at: at(0), started_at: at(0), completed_at: at(now), conclusion, steps: list };
};

test("a job's work time leaves out its setup steps: the runner, checkout, pnpm and Node, the install and the browsers", () => {
  const setup = [["Set up job", 0.5], ["Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", 0.5], ["Run pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413", 0.25], ["Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1", 0.25], ["Run pnpm i --frozen-lockfile", 1], ["Run ./.github/actions/playwright-browsers", 1], ["Browser system packages, in the background", 0.5]];
  const browser = stepped("browser (1/2)", [...setup, ["Browser tests", 6], ["Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9", 0.5], ["Complete job", 0]]);
  assert.equal(workSeconds(browser), 6.5 * 60);
  // A job the API reports without steps counts whole.
  assert.equal(workSeconds(job("plan", 0, 0, 1)), 60);
  const graph = jobGraph(workflow);
  const path = criticalPath([job("plan", 0, 0, 1), browser, job("ci", 0, 0, 1)], graph, { work: true });
  assert.equal(path.seconds, (1 + 6.5 + 1) * 60);
  assert.equal(criticalPath([job("plan", 0, 0, 1), browser, job("ci", 0, 0, 1)], graph).seconds, (1 + 10.5 + 1) * 60);
});

test("a full-suite fallback run is not judged, and the ceiling is 15 minutes or half again main's baseline, whichever is more", () => {
  const min = 60;
  assert.deepEqual(judge({ event: "pull_request", fallback: true, criticalSeconds: 40 * min, baselineSeconds: 10 * min, workSeconds: 35 * min, baselineWorkSeconds: 6 * min, previousWorkSeconds: 35 * min }), { fail: false, warning: "fallback" });
  // A fallback run with a job no name matches still fails: the record would be wrong.
  assert.equal(judge({ event: "pull_request", fallback: true, criticalSeconds: 60, baselineSeconds: 60, unmatched: ["x"] }).fail, true);
  assert.equal(budget.ceilingMinutes, 15);
  assert.equal(budget.ceilingFactor, 1.5);
  const at = (criticalSeconds, baselineSeconds) => judge({ event: "pull_request", criticalSeconds, baselineSeconds, workSeconds: baselineSeconds, baselineWorkSeconds: baselineSeconds, previousWorkSeconds: null });
  // Main at 12 minutes: the ceiling is 18, so 17 only warns.
  assert.deepEqual(at(17 * min, 12 * min), { fail: false, warning: "over" });
  assert.deepEqual(at(18 * min + 1, 12 * min), { fail: true, reason: "ceiling", warning: null });
  // Main at 8: 15 still holds.
  assert.deepEqual(at(15 * min + 1, 8 * min), { fail: true, reason: "ceiling", warning: null });
});

test("a regression is judged on work time, setup left out: it fails only past main's baseline and 3 minutes, and only when the pull request's previous full run was past it too", () => {
  const min = 60;
  assert.equal(budget.regressionMinutes, 3);
  const pr = (workSeconds, previousWorkSeconds) => judge({ event: "pull_request", criticalSeconds: 13 * min, baselineSeconds: 11 * min, workSeconds, baselineWorkSeconds: 7 * min, previousWorkSeconds });
  // Past 7 + 3 minutes of work, and so was the previous full run: this change.
  assert.deepEqual(pr(10.5 * min, 10.2 * min), { fail: true, reason: "regression", warning: null });
  // Past it once, but the previous full run was not, or there was none: not shown to be this change.
  assert.deepEqual(pr(10.5 * min, 8 * min), { fail: false, warning: "unconfirmed" });
  assert.deepEqual(pr(10.5 * min, null), { fail: false, warning: "unconfirmed" });
  // Within 3 minutes of main's work, however slow its setup was: a slow runner.
  assert.deepEqual(pr(9.9 * min, 9.9 * min), { fail: false, warning: "over" });
  // Without main's work time, a warning.
  assert.deepEqual(judge({ event: "pull_request", criticalSeconds: 13 * min, baselineSeconds: 11 * min, workSeconds: 12 * min, baselineWorkSeconds: null, previousWorkSeconds: 12 * min }), { fail: false, warning: "no-baseline" });
});

test("main's baseline carries the median work time of the same runs, and the previous full run is the newest full, non-fallback record of the pull request's earlier runs", () => {
  const run = (minutes, work) => ({ attempt: 1, record: { criticalPathSeconds: minutes * 60, workPathSeconds: work === undefined ? undefined : work * 60, jobs: [{ job: "plan", conclusion: "success" }] } });
  const main = baseline([run(10, 6), run(11, 7), run(9), run(12, 8)]);
  assert.deepEqual(main.workValues.map((value) => value / 60), [6, 7, 8]);
  assert.equal(main.workSeconds, 7 * 60);
  const record = (full, fallback, work) => ({ full, fallback, workPathSeconds: work * 60 });
  assert.equal(previousFull([null, record(false, false, 3), record(true, true, 20), record(true, false, 9), record(true, false, 5)]), 9 * 60);
  assert.equal(previousFull([record(false, false, 3)]), null);
  // A record from before work times were kept does not count.
  assert.equal(previousFull([{ full: true, fallback: false, criticalPathSeconds: 600 }]), null);
});
