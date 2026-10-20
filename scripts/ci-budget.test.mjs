import assert from "node:assert/strict";
import { test } from "node:test";
import { budget, criticalPath, jobGraph, overBudget, wallTime } from "./ci-budget.mjs";

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

test("only a pull request's critical path is held to the budget, with its margin", () => {
  const limit = budget.targetMinutes * 60 * (1 + budget.margin);
  assert.equal(overBudget("pull_request", limit), false);
  assert.equal(overBudget("pull_request", limit + 1), true);
  for (const event of ["push", "merge_group", "workflow_dispatch"]) assert.equal(overBudget(event, limit * 3), false);
  assert.equal(overBudget("pull_request", 13 * 60, { targetMinutes: 10, margin: 0.2 }), true);
});
