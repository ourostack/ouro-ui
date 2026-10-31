import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { baseline, budget, criticalPath, freshAttempt, jobGraph, judge, percentile, previousFull, recordPassed, runnerTime, runWalls, unzipOne, wallTime, workSeconds } from "./ci-budget.mjs";

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

test("a matrix job its if skipped, reported once under its unexpanded name, is matched and adds nothing", () => {
  const path = criticalPath([job("plan", 0, 0, 1), job("browser (${{ matrix.shard }}/2)", 1, 1, 1, "skipped"), job("lint", 0, 0, 3)], jobGraph(workflow));
  assert.equal(path.seconds, 3 * 60);
  assert.deepEqual(path.unmatched, []);
});

test("a pull request with a job that no ci.yml job matches fails, so the critical path never leaves a job out, and a merge group or a push only warns, so the required check never bounces a queue entry", () => {
  const unmatched = ["install (shadcn, nova, 3/3)"];
  assert.deepEqual(judge({ event: "pull_request", criticalSeconds: 60, workSeconds: 60, baselineWorkSeconds: 60, unmatched }), { fail: true, reason: "unmatched", warning: null });
  for (const event of ["merge_group", "push", "workflow_dispatch"]) {
    assert.deepEqual(judge({ event, criticalSeconds: 60, workSeconds: 60, baselineWorkSeconds: 60, unmatched }), { fail: false, warning: "unmatched" });
  }
  assert.deepEqual(judge({ event: "pull_request", criticalSeconds: 60, workSeconds: 60, baselineWorkSeconds: 60, unmatched: [] }), { fail: false, warning: null });
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

test("main's baseline carries the median work time of the same runs, once all of them recorded one, and the previous full run is the newest full, non-fallback record of the pull request's earlier runs", () => {
  const run = (minutes, work) => ({ attempt: 1, record: { criticalPathSeconds: minutes * 60, workPathSeconds: work === undefined ? undefined : work * 60, jobs: [{ job: "plan", conclusion: "success" }] } });
  // Work times from fewer than baselineRuns runs make no work baseline yet.
  const partial = baseline([run(10, 6), run(11, 7), run(9), run(12, 8), run(13)]);
  assert.deepEqual(partial.workValues.map((value) => value / 60), [6, 7, 8]);
  assert.equal(partial.workSeconds, null);
  const main = baseline([run(10, 6), run(11, 7), run(9, 5), run(12, 8), run(13, 9)]);
  assert.equal(main.workSeconds, 7 * 60);
  const record = (full, fallback, work) => ({ full, fallback, workPathSeconds: work * 60 });
  assert.equal(previousFull([null, record(false, false, 3), record(true, true, 20), record(true, false, 9), record(true, false, 5)]), 9 * 60);
  assert.equal(previousFull([record(false, false, 3)]), null);
  // A record from before work times were kept does not count.
  assert.equal(previousFull([{ full: true, fallback: false, criticalPathSeconds: 600 }]), null);
});

const min = 60;
/** A pull request run's verdict: `work` minutes of work (setup left out), `critical` minutes of critical path, against main's `main` minutes of work, with `earlier` minutes from its earlier attempt or previous full run. */
const verdict = ({ critical = 13, work, main = 7, earlier = null, fallback = false, event = "pull_request" }) =>
  judge({ event, fallback, criticalSeconds: critical * min, workSeconds: work * min, baselineWorkSeconds: main === null ? null : main * min, earlierWorkSeconds: earlier === null ? null : earlier * min });

test("only a pull request over the budget is judged, and not a full-suite fallback run", () => {
  const limit = (budget.targetMinutes * (1 + budget.margin));
  assert.deepEqual(verdict({ critical: limit, work: 30 }), { fail: false, warning: null });
  for (const event of ["push", "merge_group", "workflow_dispatch"]) assert.deepEqual(verdict({ event, critical: 40, work: 35 }), { fail: false, warning: null });
  assert.deepEqual(verdict({ fallback: true, critical: 40, work: 35, earlier: 35 }), { fail: false, warning: "fallback" });
  // Over the budget, its work within 3 minutes of main's: a slow runner, more likely than this change.
  assert.deepEqual(verdict({ work: 10 }), { fail: false, warning: "over" });
  assert.equal(budget.regressionMinutes, 3);
});

test("work more than 3 minutes over main's fails when the earlier attempt or the previous full run was over too, warns when it was not, and asks for a re-run when there is neither", () => {
  assert.deepEqual(verdict({ work: 10.5, earlier: 10.2 }), { fail: true, reason: "regression", warning: null });
  assert.deepEqual(verdict({ work: 10.5, earlier: 8 }), { fail: false, warning: "unconfirmed" });
  // A pull request pushed once is not let through: it fails until a second run of all its jobs says the same.
  assert.deepEqual(verdict({ work: 10.5 }), { fail: true, reason: "confirm", warning: null });
  // With no work baseline from main, only the ceiling holds.
  assert.deepEqual(verdict({ work: 14, main: null }), { fail: false, warning: "no-baseline" });
});

test("the ceiling is on work time too, 15 minutes or half again main's work, whichever is more, and a single slow run past it only asks for a re-run", () => {
  assert.equal(budget.ceilingMinutes, 15);
  assert.equal(budget.ceilingFactor, 1.5);
  // Run 39713764485: 38.8 minutes on a slow network; most of it setup, so its work is near main's.
  assert.deepEqual(verdict({ critical: 38.8, work: 9 }), { fail: false, warning: "over" });
  // No main baseline: past 15 minutes of work twice fails, once asks for a re-run, and once against an earlier run under it warns.
  assert.deepEqual(verdict({ critical: 20, work: 15.5, main: null, earlier: 16 }), { fail: true, reason: "ceiling", warning: null });
  assert.deepEqual(verdict({ critical: 20, work: 15.5, main: null }), { fail: true, reason: "confirm", warning: null });
  assert.deepEqual(verdict({ critical: 20, work: 15.5, main: null, earlier: 9 }), { fail: false, warning: "unconfirmed" });
  // Main at 12 minutes of work: the ceiling is 18, past main's and 3 minutes it is a regression first.
  assert.deepEqual(verdict({ critical: 25, work: 18.5, main: 12, earlier: 19 }), { fail: true, reason: "ceiling", warning: null });
  assert.deepEqual(verdict({ critical: 25, work: 16, main: 12, earlier: 16 }), { fail: true, reason: "regression", warning: null });
});

test("an earlier attempt confirms only when this attempt ran its jobs afresh, as after Re-run all jobs", () => {
  const ran = (attempt) => ({ name: "plan", conclusion: "success", run_attempt: attempt });
  assert.equal(freshAttempt([ran(2), ran(2), { ...ran(1), conclusion: "skipped" }], 2), true);
  // Re-run failed jobs keeps the jobs that passed, with their times, so the attempt repeats the last.
  assert.equal(freshAttempt([ran(2), ran(1)], 2), false);
  assert.equal(freshAttempt([ran(1)], 1), true);
});
