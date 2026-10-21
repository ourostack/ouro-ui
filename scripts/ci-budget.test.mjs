import assert from "node:assert/strict";
import { test } from "node:test";
import { baseline, budget, criticalPath, jobGraph, judge, passed, percentile, runnerTime, runWalls, wallTime } from "./ci-budget.mjs";

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

test("a pull request after main slowed down only warns, the one that fixes it included", () => {
  const min = 60;
  const pr = (criticalSeconds, baselineSeconds) => judge({ event: "pull_request", criticalSeconds, baselineSeconds });
  // Main's own baseline over the budget: the slowdown is main's, and every pull request warns.
  assert.deepEqual(pr(14 * min, 13 * min), { fail: false, warning: "baseline-over" });
  // A fix that only partly helps is still over the budget, and still passes.
  assert.deepEqual(pr(12.5 * min, 14 * min), { fail: false, warning: "baseline-over" });
  // A pull request far over a slow main still fails past the ceiling.
  assert.deepEqual(pr(budget.ceilingMinutes * min + 1, 14 * min), { fail: true, reason: "ceiling", warning: null });
});

test("with no baseline a pull request only warns, past the ceiling it fails, and only a pull request is judged", () => {
  const min = 60;
  assert.deepEqual(judge({ event: "pull_request", criticalSeconds: 13 * min, baselineSeconds: null }), { fail: false, warning: "no-baseline" });
  assert.deepEqual(judge({ event: "pull_request", criticalSeconds: budget.ceilingMinutes * min + 1, baselineSeconds: null }), { fail: true, reason: "ceiling", warning: null });
  for (const event of ["push", "merge_group", "workflow_dispatch"]) assert.deepEqual(judge({ event, criticalSeconds: 30 * min, baselineSeconds: 9 * min }), { fail: false, warning: null });
});

test("main's baseline is the median critical path of its latest merge queue runs that passed, ci-budget's own result aside", () => {
  const graph = jobGraph(workflow);
  // A run whose critical path is plan, browser and ci: 1 + `browser` + 1 minutes.
  const run = (browser, { attempt = 1, conclusion = "success", budgetConclusion = "success" } = {}) => ({
    attempt,
    jobs: [job("plan", 0, 0, 1), job("browser (1/2)", 1, 1, 1 + browser, conclusion), job("browser (2/2)", 1, 1, 2), job("ci", 1 + browser, 1 + browser, 2 + browser), job("lint", 0, 0, 1), job("install (next)", 0, 0, 1, "skipped"), job("ci-budget", 2 + browser, 2 + browser, 3 + browser, budgetConclusion)],
  });
  assert.equal(passed(run(5).jobs, graph), true);
  // ci-budget's own failure does not make a run fail; any other job's does.
  assert.equal(passed(run(5, { budgetConclusion: "failure" }).jobs, graph), true);
  assert.equal(passed(run(5, { conclusion: "failure" }).jobs, graph), false);
  assert.equal(passed(run(5, { conclusion: "cancelled" }).jobs, graph), false);
  const runs = [
    run(20, { conclusion: "failure" }),
    run(8),
    run(30, { attempt: 2 }),
    run(9, { budgetConclusion: "failure" }),
    run(6),
    run(7),
    run(10),
    run(40),
  ];
  // The failed run and the re-run are left out; the first five that passed count, newest first.
  const main = baseline(runs, graph);
  assert.deepEqual(main.values.map((value) => value / 60), [10, 11, 8, 9, 12]);
  assert.equal(main.seconds, 10 * 60);
  assert.deepEqual(baseline([run(5, { conclusion: "failure" })], graph), { seconds: null, values: [] });
  assert.equal(budget.baselineRuns, 5);
  assert.equal(budget.regressionMinutes, 2);
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
