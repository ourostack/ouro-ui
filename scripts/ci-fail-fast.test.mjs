import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { cancelNote, GATES, LAST, NOT_ON_PULL_REQUESTS, notifierId, notifierJob, rateLimited, requestsLeft, RERUN_ALONE, TOLERATED, WATCHED } from "./ci-fail-fast.mjs";

// Fail fast for a pull request's CI (scripts/ci-fail-fast.mjs): that every job doing the run's work
// has a notifier that cancels the rest of the run once it failed, that no runner waits for a
// failure, that only the notifiers write to Actions, and that no job waits on them.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const yml = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const jobs = Object.fromEntries(
  yml
    .split("\njobs:\n")[1]
    .split(/\n(?= {2}[\w-]+:\n)/)
    .map((block) => [block.match(/^ {2}([\w-]+):/)[1], block]),
);
const needsOf = (id) => jobs[id].match(/^ {4}needs: \[([^\]]*)\]$/m)?.[1].split(",").map((need) => need.trim()) ?? [];
const notifiers = Object.keys(jobs).filter((id) => id.startsWith("fail-fast-"));
const work = Object.keys(jobs).filter((id) => !notifiers.includes(id));

test("every job of ci.yml is watched, a gate, tolerated, re-run alone, the last, or never on a pull request, and each watched one has its notifier, verbatim", () => {
  const classified = [...WATCHED, ...GATES, ...TOLERATED, ...RERUN_ALONE, LAST, ...NOT_ON_PULL_REQUESTS];
  assert.deepEqual([...classified].sort(), [...work].sort(), "a new job must say whether its failure cancels the run");
  assert.equal(new Set(classified).size, classified.length);
  assert.deepEqual(notifiers.sort(), WATCHED.map(notifierId).sort());
  for (const job of WATCHED) assert.equal(jobs[notifierId(job)].trimEnd(), notifierJob(job), job);
  // A gate fails only after a job it waits on failed, and that job's notifier cancels the run: it
  // checks nothing out and runs no script of the repository, only reads its needs' results and markers.
  for (const gate of GATES) {
    assert.ok(needsOf(gate).some((need) => WATCHED.includes(need) || GATES.includes(need)), `${gate} waits on a watched job`);
    assert.doesNotMatch(jobs[gate], /scripts\/coverage-merge|motion:coverage|pnpm (?!i\b)/, `${gate} checks something of its own, so it is watched`);
  }
  for (const job of NOT_ON_PULL_REQUESTS) assert.doesNotMatch(jobs[job].match(/^ {4}if: (.+)$/m)[1], /pull_request/, job);
});

test("a notifier runs only when its job failed on a pull request, and so holds no runner on a green run, in the merge queue, on main or in a dispatched run", () => {
  const condition = notifierJob("browser").match(/^ {4}if: \$\{\{ (.+) \}\}$/m)[1];
  const runs = (event, result, cancelled = false) =>
    runInNewContext(condition.replace("!cancelled()", String(!cancelled)).replace(/==/g, "==="), { github: { event_name: event }, needs: { browser: { result } } });
  assert.equal(runs("pull_request", "failure"), true);
  // In a run nobody cancelled, a cancelled job is one that timed out.
  assert.equal(runs("pull_request", "cancelled"), true);
  for (const result of ["success", "skipped"]) assert.equal(runs("pull_request", result), false, result);
  for (const event of ["merge_group", "push", "workflow_dispatch"]) assert.equal(runs(event, "failure"), false, event);
  // A newer push cancelled the run: nothing more to cancel.
  for (const result of ["failure", "cancelled"]) assert.equal(runs("pull_request", result, true), false, result);
  // It starts once its job has finished, so the job keeps its failure conclusion.
  assert.match(notifierJob("browser"), /^ {4}needs: \[browser\]$/m);
});

test("only the notifiers write to Actions, they run no repository code, and no other job cancels the run", () => {
  assert.match(yml, /^permissions:\n {2}contents: read\n#/m, "the workflow's default stays read-only");
  for (const id of notifiers) {
    const block = jobs[id];
    assert.match(block, /\n {4}permissions:\n {6}actions: write\n {4}steps:\n/, id);
    assert.doesNotMatch(block, /uses:|pnpm|node /, `${id} checks nothing out and installs nothing`);
    assert.equal(block.split(/\n {6}- /).length, 2, `${id} has one step`);
  }
  for (const id of work) {
    assert.doesNotMatch(jobs[id], /actions: write/, `${id} has no actions: write`);
    // A cancel that reaches a job before it finishes would turn its failure into cancelled.
    assert.doesNotMatch(jobs[id], /gh run cancel|\/cancel\b/, `${id} does not cancel the run`);
  }
});

test("a notifier's step cancels the run and says which job failed, and a refused cancel is a warning that fails nothing", () => {
  const script = notifierJob("browser").split("        run: |\n")[1].split("\n").map((line) => line.slice(10)).join("\n");
  const run = (status) =>
    spawnSync("bash", ["-e", "-o", "pipefail", "-c", `gh() { echo "CALL gh $*" >&2; return ${status}; }\n${script}`], { encoding: "utf8", env: { ...process.env, GITHUB_REPOSITORY: "o/r", GITHUB_RUN_ID: "7" } });
  const ok = run(0);
  assert.equal(ok.status, 0);
  assert.match(ok.stderr, /^CALL gh api -X POST repos\/o\/r\/actions\/runs\/7\/cancel$/m);
  assert.equal(ok.stdout, `::notice::${cancelNote("browser")}\n`);
  const refused = run(1);
  assert.equal(refused.status, 0);
  assert.equal(refused.stdout, "::warning::browser failed, but cancelling the rest of the run did not work.\n");
});

test("no job waits on a notifier, so where they are skipped every job runs as before, and only a failure that fails the run is counted", () => {
  for (const id of Object.keys(jobs)) assert.ok(!needsOf(id).some((need) => notifiers.includes(need)), `${id} needs a notifier`);
  // LAST waits on every job but the notifiers, at any depth, and does not run in a cancelled run.
  const waited = new Set();
  const walk = (id) => {
    for (const need of needsOf(id)) {
      if (waited.has(need)) continue;
      waited.add(need);
      walk(need);
    }
  };
  walk(LAST);
  assert.deepEqual([...waited].sort(), work.filter((id) => id !== LAST).sort());
  assert.match(jobs[LAST], /^ {4}if: \$\{\{ !cancelled\(\) && /m);
  // A job whose own failure the run allows (continue-on-error on the job) would be a false cancel: none has one.
  assert.deepEqual(Object.keys(jobs).filter((id) => /^ {4}continue-on-error:/m.test(jobs[id])), []);
  // Each matrix keeps fail-fast off, so a cancelled shard means the run was cancelled or it timed out.
  for (const [id, block] of Object.entries(jobs)) if (/^ {4}strategy:/m.test(block)) assert.match(block, /^ {6}fail-fast: false$/m, id);
  // A failed plan is tolerated: no rule requires it, and every job that waits on it runs whatever happened to it.
  const required = JSON.parse(readFileSync(join(root, ".github/required-checks.json"), "utf8"));
  for (const id of TOLERATED) {
    assert.ok(!required.includes(id), id);
    for (const [other, block] of Object.entries(jobs)) if (needsOf(other).includes(id)) assert.match(block, /^ {4}if: \$\{\{ !cancelled\(\)/m, `${other} runs after a failed ${id}`);
  }
  // No notifier is a required check: the ruleset counts only the jobs that do the work.
  for (const id of notifiers) assert.ok(!required.includes(jobs[id].match(/^ {4}name: (.+)$/m)[1]), id);
});

test("rateLimited and requestsLeft read what the API said about this token's hourly requests, for scripts/ci-yield.mjs", () => {
  for (const text of ["gh: API rate limit exceeded for installation ID 1. (HTTP 403)", "gh: You have exceeded a secondary rate limit. (HTTP 429)", "HTTP/2.0 403 Forbidden\nX-Ratelimit-Remaining: 0", "Retry-After: 60"]) assert.equal(rateLimited(text), true, text);
  assert.equal(rateLimited("gh: Server Error (HTTP 502)"), false);
  assert.equal(requestsLeft("HTTP/2.0 200 OK\nX-Ratelimit-Remaining: 731"), 731);
  assert.equal(requestsLeft("HTTP/2.0 200 OK"), null);
});
