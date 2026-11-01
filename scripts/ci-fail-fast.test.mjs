import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { cancelNote, DEADLINE_MS, decide, FAILED, LAST, POLL_MS, rateLimited, requestsLeft, RESERVE, SELF, TOLERATED, watch } from "./ci-fail-fast.mjs";

// Fail fast for a pull request's CI (scripts/ci-fail-fast.mjs): when it cancels the run, that it
// waits for the failed job to finish, that it never fails the run itself, and that ci.yml runs it
// beside every job on pull requests only, with no job waiting on it.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const yml = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const jobs = Object.fromEntries(
  yml
    .split("\njobs:\n")[1]
    .split(/\n(?= {2}[\w-]+:\n)/)
    .map((block) => [block.match(/^ {2}([\w-]+):/)[1], block]),
);
const needsOf = (id) => jobs[id].match(/^ {4}needs: \[([^\]]*)\]$/m)?.[1].split(",").map((need) => need.trim()) ?? [];
const job = (name, status = "in_progress", conclusion = null, attempt = 1) => ({ name, status, conclusion, run_attempt: attempt });

test("a job that failed and finished cancels the run; a job still running its failed steps is waited for", () => {
  assert.deepEqual(decide([job("checks", "completed", "success"), job("browser (2/6)"), job(SELF)], 1), { kind: "wait" });
  assert.deepEqual(decide([job("checks", "completed", "success"), job("browser (2/6)", "completed", "failure"), job("e2e (1/4)"), job(SELF)], 1), { kind: "cancel", failed: ["browser (2/6)"] });
  for (const conclusion of ["timed_out", "cancelled"]) assert.equal(decide([job("visual", "completed", conclusion), job("e2e (1/4)")], 1).kind, "cancel", conclusion);
  for (const conclusion of ["success", "skipped", "neutral"]) assert.equal(decide([job("install-github", "completed", conclusion), job("e2e (1/4)")], 1).kind, "wait", conclusion);
  assert.deepEqual(FAILED, ["failure", "timed_out", "cancelled"]);
});

test("it never counts itself, a failed plan (everything then runs), or what an earlier attempt failed or had cancelled", () => {
  assert.deepEqual(decide([job(SELF, "completed", "failure"), job("checks")], 1), { kind: "wait" });
  assert.deepEqual(TOLERATED, ["plan"]);
  assert.deepEqual(decide([job("plan", "completed", "failure"), job("checks")], 1), { kind: "wait" });
  // "Re-run failed jobs": the jobs it did not run keep their first attempt, and so may the ones it has not started yet.
  assert.deepEqual(decide([job("browser (2/6)", "completed", "failure", 1), job(LAST, "completed", "cancelled", 1), job("browser (2/6)", "in_progress", null, 2)], 2), { kind: "wait" });
  assert.deepEqual(decide([job("checks", "completed", "success", 1), job("browser (2/6)", "completed", "failure", 2)], 2), { kind: "cancel", failed: ["browser (2/6)"] });
});

test("it stops once the job that waits on every other job has finished, and not when only the jobs listed so far have", () => {
  assert.deepEqual(decide([job("checks", "completed", "success"), job(LAST, "completed", "success"), job(SELF)], 1), { kind: "done" });
  // A failure with nothing left to run frees nothing: ci-budget's own failure cancels nothing.
  assert.deepEqual(decide([job("checks", "completed", "success"), job(LAST, "completed", "failure"), job(SELF)], 1), { kind: "done" });
  // The API lists a job once its needs have finished: with only the plan listed, the rest are still to come.
  assert.deepEqual(decide([job("plan", "completed", "success"), job(SELF)], 1), { kind: "wait" });
  assert.deepEqual(decide([], 1), { kind: "wait" });
});

/** What `gh api --include` prints: the status, the headers, a blank line and the body. */
const answer = (body, left = 900) => `HTTP/2.0 200 OK\nContent-Type: application/json\nX-Ratelimit-Remaining: ${left}\n\n${JSON.stringify(body)}`;
/** A failed gh call as execFileSync throws it, with what gh printed. */
const failed = (stderr, stdout = "") => Object.assign(new Error(`Command failed: gh api\n${stderr}`), { stderr, stdout });

/** A fake gh that answers the jobs list from `polls` in turn (an Error throws; a string is printed as is) and records every call. */
const fakeGh = (polls, cancel = null) => {
  const calls = [];
  let index = 0;
  const gh = (args) => {
    calls.push(args);
    if (args.includes("POST")) {
      if (cancel) throw cancel;
      return "";
    }
    const next = polls[Math.min(index++, polls.length - 1)];
    if (next instanceof Error) throw next;
    return typeof next === "string" ? next : answer({ total_count: next.length, jobs: next });
  };
  return { gh, calls };
};
const watched = (gh) => {
  const lines = [];
  const summaries = [];
  const waits = [];
  let clock = 0;
  const done = watch({
    gh,
    repo: "o/r",
    id: "7",
    attempt: "1",
    wait: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    now: () => clock,
    log: (line) => lines.push(line),
    summary: (text) => summaries.push(text),
  });
  return { done, lines, summaries, waits };
};

test("it polls this run attempt's jobs until one fails, then cancels the run once and says which job failed", async () => {
  const { gh, calls } = fakeGh([[job("checks"), job(SELF)], [job("checks", "completed", "failure"), job("browser (1/6)"), job(SELF)]]);
  const run = watched(gh);
  assert.equal(await run.done, "cancel");
  assert.deepEqual(calls[0], ["api", "--include", "repos/o/r/actions/runs/7/attempts/1/jobs?per_page=100&page=1"]);
  assert.deepEqual(calls.at(-1), ["api", "-X", "POST", "repos/o/r/actions/runs/7/cancel"]);
  assert.equal(calls.filter((call) => call.includes("POST")).length, 1);
  assert.deepEqual(run.waits, [POLL_MS]);
  assert.ok(run.lines.includes(`::notice::${cancelNote(["checks"])}`));
  assert.deepEqual(run.summaries, [`${cancelNote(["checks"])}\n`]);
  assert.match(cancelNote(["checks"]), /^checks failed, so fail-fast cancelled the rest of this pull request's run/);
});

test("it never fails the run: a failed read is a warning and the next poll tries again; a failed cancel is a warning", async () => {
  const read = fakeGh([new Error("HTTP 502\nmore"), [job("checks", "completed", "success"), job(LAST, "completed", "success"), job(SELF)]]);
  const first = watched(read.gh);
  assert.equal(await first.done, "done");
  assert.ok(first.lines.includes("::warning::Could not read this run's jobs (HTTP 502); trying again."));
  assert.equal(read.calls.length, 2);
  assert.equal(read.calls.filter((call) => call.includes("POST")).length, 0, "nothing failed, nothing cancelled");
  const cancel = fakeGh([[job("checks", "completed", "failure")]], new Error("HTTP 403: Resource not accessible by integration"));
  const second = watched(cancel.gh);
  assert.equal(await second.done, "cancel");
  assert.ok(second.lines.some((line) => /^::warning::checks failed, but cancelling the run did not work \(HTTP 403/.test(line)));
});

test("it reads every page of a run's jobs when they are more than a page holds", async () => {
  const pages = [answer({ total_count: 3, jobs: [job("checks", "completed", "success"), job("browser (1/6)", "completed", "success")] }), answer({ total_count: 3, jobs: [job(LAST, "completed", "success")] })];
  const { gh, calls } = fakeGh(pages);
  assert.equal(await watched(gh).done, "done");
  assert.deepEqual(calls.map((call) => call.at(-1).split("&").at(-1)), ["page=1", "page=2"]);
});

test("it stops watching, with a warning and nothing cancelled, once the API rate limits this repository's runs or has few requests left", async () => {
  const stops = [
    failed("gh: API rate limit exceeded for installation ID 1. (HTTP 403)"),
    failed("gh: You have exceeded a secondary rate limit. (HTTP 429)"),
    failed("gh: Forbidden (HTTP 403)", "HTTP/2.0 403 Forbidden\nX-Ratelimit-Remaining: 0\n\n{}"),
    answer({ total_count: 1, jobs: [job("checks")] }, RESERVE - 1),
  ];
  for (const stop of stops) {
    const { gh, calls } = fakeGh([stop, [job("checks", "completed", "failure")]]);
    const run = watched(gh);
    assert.equal(await run.done, "rate-limited");
    assert.equal(calls.length, 1, "no other read, and no cancel");
    assert.deepEqual(run.waits, []);
    assert.ok(run.lines.some((line) => /^::warning::Stopped watching: the API is rate limiting this repository's runs/.test(line)), run.lines.join("\n"));
  }
  // Another failure is tried again, and requests to spare go on.
  assert.equal(rateLimited("gh: Server Error (HTTP 502)"), false);
  assert.equal(rateLimited("Retry-After: 60"), true);
  assert.equal(requestsLeft("HTTP/2.0 200 OK\nX-Ratelimit-Remaining: 731"), 731);
  assert.equal(requestsLeft("HTTP/2.0 200 OK"), null);
  const { gh } = fakeGh([answer({ total_count: 1, jobs: [job("checks")] }, RESERVE), [job(LAST, "completed", "success")]]);
  assert.equal(await watched(gh).done, "done");
});

test("it gives up before its job's time limit, so a long run never turns the watcher red, and polls within the token's hourly requests", async () => {
  const { gh } = fakeGh([[job("e2e (1/4)"), job(SELF)]]);
  const run = watched(gh);
  assert.equal(await run.done, "deadline");
  assert.equal(run.waits.length, DEADLINE_MS / POLL_MS);
  const minutes = Number(jobs[SELF].match(/^ {4}timeout-minutes: (\d+)$/m)[1]);
  assert.ok(DEADLINE_MS < minutes * 60_000, "the deadline is under timeout-minutes");
  assert.equal(3_600_000 / POLL_MS, 60, "60 reads an hour per run, of the 1,000 a repository's GITHUB_TOKEN gets on the Team plan");
});

test("ci.yml runs fail-fast beside every job, on pull requests only, with the least it needs, and nothing else cancels or writes to Actions", () => {
  const block = jobs[SELF];
  assert.match(block, /^ {4}if: github\.event_name == 'pull_request'$/m, "never in the merge queue, on main or in a dispatched run");
  assert.doesNotMatch(block, /^ {4}(?:needs|name|strategy):/m, "it starts with the run, and its API name is its key");
  assert.match(block, /^ {4}continue-on-error: true$/m, "the watcher cannot fail the run");
  assert.match(block, /\n {4}permissions:\n {6}actions: write\n {6}contents: read\n {4}steps:/, "actions: write to read the jobs and cancel; nothing more");
  assert.match(block, /- run: node scripts\/ci-fail-fast\.mjs\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}$/m);
  assert.match(block, /sparse-checkout: scripts\/ci-fail-fast\.mjs\n/);
  assert.match(yml, /^permissions:\n {2}contents: read\n#/m, "the workflow's default stays read-only");
  for (const id of Object.keys(jobs).filter((key) => key !== SELF)) {
    assert.doesNotMatch(jobs[id], /actions: write/, `${id} has no actions: write`);
    // A cancel that reaches a job before it finishes would turn its failure into cancelled.
    assert.doesNotMatch(jobs[id], /gh run cancel|\/cancel\b/, `${id} does not cancel the run`);
    assert.notEqual(jobs[id].match(/^ {4}name: (.+)$/m)?.[1], SELF, `${id} is not named as the watcher`);
  }
});

test("no job waits on fail-fast, so where it is skipped every job runs as before, and only a failure that fails the run is counted", () => {
  for (const id of Object.keys(jobs)) assert.ok(!needsOf(id).includes(SELF), `${id} needs fail-fast`);
  // LAST waits on every job but fail-fast, at any depth, and does not run in a cancelled run.
  const waited = new Set();
  const walk = (id) => {
    for (const need of needsOf(id)) {
      if (waited.has(need)) continue;
      waited.add(need);
      walk(need);
    }
  };
  walk(LAST);
  assert.deepEqual([...waited].sort(), Object.keys(jobs).filter((id) => id !== LAST && id !== SELF).sort());
  assert.match(jobs[LAST], /^ {4}if: \$\{\{ !cancelled\(\) && /m);
  // A job whose own failure the run allows (continue-on-error on the job) would be a false cancel: only the watcher has one.
  assert.deepEqual(Object.keys(jobs).filter((id) => /^ {4}continue-on-error:/m.test(jobs[id])), [SELF]);
  // Each matrix keeps fail-fast off, so a cancelled shard means the run was cancelled or it timed out.
  for (const [id, block] of Object.entries(jobs)) if (/^ {4}strategy:/m.test(block)) assert.match(block, /^ {6}fail-fast: false$/m, id);
  // A failed plan is tolerated: no rule requires it, and every job that waits on it runs whatever happened to it.
  const required = JSON.parse(readFileSync(join(root, ".github/required-checks.json"), "utf8"));
  for (const id of TOLERATED) {
    assert.ok(!required.includes(id), id);
    for (const [other, block] of Object.entries(jobs)) if (needsOf(other).includes(id)) assert.match(block, /^ {4}if: \$\{\{ !cancelled\(\)/m, `${other} runs after a failed ${id}`);
  }
});
