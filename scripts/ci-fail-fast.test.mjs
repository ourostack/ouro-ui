import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { cancelNote, decide, FAILED, LAST, rateLimited, requestsLeft, RERUN_ALONE, RESERVE, SWEEP_DEADLINE_MS, SWEEP_MS, sweep, TOLERATED } from "./ci-fail-fast.mjs";

// Fail fast for a pull request's CI (scripts/ci-fail-fast.mjs): when it cancels a run, that it
// waits for the failed job to finish, that it never fails a run itself, and that one watcher
// workflow serves every pull request's run, with no job in ci.yml waiting on it.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const yml = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const watcher = readFileSync(join(root, ".github/workflows/ci-fail-fast.yml"), "utf8");
const jobs = Object.fromEntries(
  yml
    .split("\njobs:\n")[1]
    .split(/\n(?= {2}[\w-]+:\n)/)
    .map((block) => [block.match(/^ {2}([\w-]+):/)[1], block]),
);
const needsOf = (id) => jobs[id].match(/^ {4}needs: \[([^\]]*)\]$/m)?.[1].split(",").map((need) => need.trim()) ?? [];
const job = (name, status = "in_progress", conclusion = null, attempt = 1) => ({ name, status, conclusion, run_attempt: attempt });

test("a job that failed and finished cancels the run; a job still running its failed steps is waited for", () => {
  assert.deepEqual(decide([job("checks", "completed", "success"), job("browser (2/6)")], 1), { kind: "wait" });
  assert.deepEqual(decide([job("checks", "completed", "success"), job("browser (2/6)", "completed", "failure"), job("e2e (1/4)")], 1), { kind: "cancel", failed: ["browser (2/6)"] });
  for (const conclusion of ["timed_out", "cancelled"]) assert.equal(decide([job("visual", "completed", conclusion), job("e2e (1/4)")], 1).kind, "cancel", conclusion);
  for (const conclusion of ["success", "skipped", "neutral"]) assert.equal(decide([job("install-github", "completed", conclusion), job("e2e (1/4)")], 1).kind, "wait", conclusion);
  assert.deepEqual(FAILED, ["failure", "timed_out", "cancelled"]);
});

test("a failed latency job cancels nothing: a slow runner can fail it, and a re-run of it alone is cheaper", () => {
  assert.deepEqual(RERUN_ALONE, ["latency"]);
  assert.deepEqual(decide([job("latency", "completed", "failure"), job("e2e (1/4)")], 1), { kind: "wait" });
  // Any other failure still cancels the run, and names only what it counted.
  assert.deepEqual(decide([job("latency", "completed", "failure"), job("browser (2/6)", "completed", "failure")], 1), { kind: "cancel", failed: ["browser (2/6)"] });
  // The job is still a real job of the workflow, so the name cannot drift away from it.
  assert.ok(Object.keys(jobs).includes("latency"));
});

test("it never counts a failed plan (everything then runs), or what an earlier attempt failed or had cancelled", () => {
  assert.deepEqual(TOLERATED, ["plan"]);
  assert.deepEqual(decide([job("plan", "completed", "failure"), job("checks")], 1), { kind: "wait" });
  // "Re-run failed jobs": the jobs it did not run keep their first attempt, and so may the ones it has not started yet.
  assert.deepEqual(decide([job("browser (2/6)", "completed", "failure", 1), job(LAST, "completed", "cancelled", 1), job("browser (2/6)", "in_progress", null, 2)], 2), { kind: "wait" });
  assert.deepEqual(decide([job("checks", "completed", "success", 1), job("browser (2/6)", "completed", "failure", 2)], 2), { kind: "cancel", failed: ["browser (2/6)"] });
});

test("it stops once the job that waits on every other job has finished, and not when only the jobs listed so far have", () => {
  assert.deepEqual(decide([job("checks", "completed", "success"), job(LAST, "completed", "success")], 1), { kind: "done" });
  // A failure with nothing left to run frees nothing: ci-budget's own failure cancels nothing.
  assert.deepEqual(decide([job("checks", "completed", "success"), job(LAST, "completed", "failure")], 1), { kind: "done" });
  // The API lists a job once its needs have finished: with only the plan listed, the rest are still to come.
  assert.deepEqual(decide([job("plan", "completed", "success")], 1), { kind: "wait" });
  assert.deepEqual(decide([], 1), { kind: "wait" });
});

/** What `gh api --include` prints: the status, the headers, a blank line and the body. */
const answer = (body, left = 900) => `HTTP/2.0 200 OK\nContent-Type: application/json\nX-Ratelimit-Remaining: ${left}\n\n${JSON.stringify(body)}`;
/** A failed gh call as execFileSync throws it, with what gh printed. */
const failed = (stderr, stdout = "") => Object.assign(new Error(`Command failed: gh api\n${stderr}`), { stderr, stdout });

/**
 * A fake gh for the shared watcher. `rounds` is, per read of the open runs, the runs then open
 * (`{ id, attempt, jobs }`, or an Error to throw); a run's jobs are answered from its entry.
 */
const fakeGh = (rounds, cancel = null, queuedNow = () => 0) => {
  const calls = [];
  let round = -1;
  const gh = (args) => {
    calls.push(args);
    const url = args.at(-1);
    if (args.includes("POST")) {
      if (cancel) throw cancel;
      return "";
    }
    if (url.includes("status=queued")) return answer({ total_count: queuedNow(round) });
    if (url.includes("/workflows/ci.yml/runs?")) {
      round = Math.min(round + 1, rounds.length - 1);
      const open = rounds[round];
      if (open instanceof Error) throw open;
      if (typeof open === "string") return open;
      return answer({ workflow_runs: open.map(({ id, attempt }) => ({ id, run_attempt: attempt })) });
    }
    const id = Number(url.match(/runs\/(\d+)\/attempts/)[1]);
    const open = rounds[round].find((run) => run.id === id);
    if (open.jobs instanceof Error) throw open.jobs;
    return answer({ total_count: open.jobs.length, jobs: open.jobs });
  };
  return { gh, calls };
};
const swept = (gh) => {
  const lines = [];
  const summaries = [];
  const waits = [];
  let clock = 0;
  const done = sweep({
    gh,
    repo: "o/r",
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
const open = (id, jobsOf, attempt = 1) => ({ id, attempt, jobs: jobsOf });

test("it reads every open pull request run's latest attempt, cancels the runs with a failed job once each, and leaves the others", async () => {
  const red = [job("checks", "completed", "failure", 1), job("checks", "completed", "success", 2), job("browser (1/6)", "in_progress", null, 2), job("e2e (1/4)", "completed", "failure", 2)];
  const green = [job("checks", "completed", "success"), job("browser (1/6)")];
  const { gh, calls } = fakeGh([[open(7, green), open(8, red, 2)], [open(7, green)], []]);
  const run = swept(gh);
  assert.equal(await run.done, "idle");
  assert.deepEqual(calls[0], ["api", "--include", "repos/o/r/actions/workflows/ci.yml/runs?event=pull_request&status=in_progress&per_page=100"]);
  assert.ok(calls.some((call) => call.at(-1) === "repos/o/r/actions/runs/8/attempts/2/jobs?per_page=100&page=1"));
  assert.deepEqual(calls.filter((call) => call.includes("POST")), [["api", "-X", "POST", "repos/o/r/actions/runs/8/cancel"]]);
  assert.deepEqual(run.waits, [SWEEP_MS, SWEEP_MS]);
  assert.ok(run.lines.includes(`::notice::Run 8: ${cancelNote(["e2e (1/4)"])}`), "the earlier attempt's failure is not counted");
  assert.deepEqual(run.summaries, [`Run 8: ${cancelNote(["e2e (1/4)"])}\n`]);
  assert.match(cancelNote(["checks"]), /^checks failed, so fail-fast cancelled the rest of this pull request's run/);
});

test("it keeps watching while a pull request run waits for a runner, which has no jobs to read yet, and stops when none does", async () => {
  const { gh, calls } = fakeGh([[], [], [open(7, [job("checks", "completed", "failure")])], []], null, (round) => (round < 2 ? 1 : 0));
  const run = swept(gh);
  assert.equal(await run.done, "idle");
  assert.deepEqual(run.waits, [SWEEP_MS, SWEEP_MS, SWEEP_MS]);
  assert.equal(calls.filter((call) => call.includes("POST")).length, 1, "the run that began meanwhile is cancelled when it fails");
});

test("it never fails: a failed read is a warning and the next read tries again; a failed cancel is a warning", async () => {
  const read = fakeGh([new Error("HTTP 502\nmore"), [open(7, [job("checks", "completed", "success"), job(LAST, "completed", "success")])], []]);
  const first = swept(read.gh);
  assert.equal(await first.done, "idle");
  assert.ok(first.lines.includes("::warning::Could not read the open runs (HTTP 502); trying again."));
  assert.equal(read.calls.filter((call) => call.includes("POST")).length, 0, "nothing failed, nothing cancelled");
  const jobsFail = fakeGh([[open(7, new Error("HTTP 502\nmore"))], []]);
  const second = swept(jobsFail.gh);
  assert.equal(await second.done, "idle");
  assert.ok(second.lines.includes("::warning::Could not read run 7's jobs (HTTP 502); trying again."));
  const cancel = fakeGh([[open(7, [job("checks", "completed", "failure")])], []], new Error("HTTP 403: Resource not accessible by integration"));
  const third = swept(cancel.gh);
  assert.equal(await third.done, "idle");
  assert.ok(third.lines.some((line) => /^::warning::checks failed in run 7, but cancelling it did not work \(HTTP 403/.test(line)));
});

test("it reads every page of a run's jobs when they are more than a page holds", async () => {
  const pages = [answer({ workflow_runs: [{ id: 7, run_attempt: 1 }] }), answer({ total_count: 3, jobs: [job("checks", "completed", "success"), job("browser (1/6)", "completed", "success")] }), answer({ total_count: 3, jobs: [job(LAST, "completed", "success")] }), answer({ workflow_runs: [] }), answer({ total_count: 0 })];
  const calls = [];
  let index = 0;
  const gh = (args) => {
    calls.push(args);
    return pages[index++];
  };
  assert.equal(await swept(gh).done, "idle");
  assert.deepEqual(calls.slice(1, 3).map((call) => call.at(-1).split("&").at(-1)), ["page=1", "page=2"]);
});

test("it stops watching, with a warning and nothing cancelled, once the API rate limits this repository's runs or has few requests left", async () => {
  const stops = [
    failed("gh: API rate limit exceeded for installation ID 1. (HTTP 403)"),
    failed("gh: You have exceeded a secondary rate limit. (HTTP 429)"),
    failed("gh: Forbidden (HTTP 403)", "HTTP/2.0 403 Forbidden\nX-Ratelimit-Remaining: 0\n\n{}"),
    answer({ workflow_runs: [{ id: 7, run_attempt: 1 }] }, RESERVE - 1),
  ];
  for (const stop of stops) {
    const { gh, calls } = fakeGh([stop, [open(7, [job("checks", "completed", "failure")])]]);
    const run = swept(gh);
    assert.equal(await run.done, "rate-limited");
    assert.equal(calls.length, 1, "no other read, and no cancel");
    assert.deepEqual(run.waits, []);
    assert.ok(run.lines.some((line) => /^::warning::Stopped watching: the API is rate limiting this repository's runs/.test(line)), run.lines.join("\n"));
  }
  // A limit hit while reading a run's jobs stops it too.
  const midway = fakeGh([[open(7, failed("gh: Forbidden (HTTP 403)"))]]);
  assert.equal(await swept(midway.gh).done, "rate-limited");
  // Another failure is tried again, and requests to spare go on.
  assert.equal(rateLimited("gh: Server Error (HTTP 502)"), false);
  assert.equal(rateLimited("Retry-After: 60"), true);
  assert.equal(requestsLeft("HTTP/2.0 200 OK\nX-Ratelimit-Remaining: 731"), 731);
  assert.equal(requestsLeft("HTTP/2.0 200 OK"), null);
});

test("it gives up before its job's time limit, so a long stretch of runs never turns the watcher red, and reads within the token's hourly requests", async () => {
  const { gh } = fakeGh([[open(7, [job("e2e (1/4)")])]]);
  const run = swept(gh);
  assert.equal(await run.done, "deadline");
  assert.equal(run.waits.length, SWEEP_DEADLINE_MS / SWEEP_MS);
  const minutes = Number(watcher.match(/^ {4}timeout-minutes: (\d+)$/m)[1]);
  assert.ok(SWEEP_DEADLINE_MS < minutes * 60_000, "the deadline is under timeout-minutes");
  assert.equal(3_600_000 / SWEEP_MS, 30, "30 reads an hour of each open run, of the 1,000 a repository's GITHUB_TOKEN gets on the Team plan");
});

test("ci-fail-fast.yml runs one watcher for every pull request's CI run, on pull requests only, with the least it needs, and nothing else cancels or writes to Actions", () => {
  assert.match(watcher, /^on:\n {2}workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[requested\]\n {2}workflow_dispatch:\n/m);
  assert.match(watcher, /^ {4}if: \$\{\{ github\.event_name == 'workflow_dispatch' \|\| github\.event\.workflow_run\.event == 'pull_request' \}\}$/m, "never for the merge queue, main or a dispatched run");
  // The group is the job's, so a skipped job holds no place in it; a waiting watcher is replaced, never a running one.
  assert.match(watcher, /^ {4}concurrency:\n {6}group: ci-fail-fast\n {6}cancel-in-progress: false$/m);
  assert.doesNotMatch(watcher.split("\njobs:\n")[0], /concurrency:/, "not the workflow's");
  assert.match(watcher, /\n {4}permissions:\n {6}actions: write\n {6}contents: read\n {4}steps:/, "actions: write to read the jobs and cancel; nothing more");
  assert.match(watcher, /^permissions:\n {2}contents: read\n/m, "the workflow's default stays read-only");
  assert.match(watcher, /- run: node scripts\/ci-fail-fast\.mjs\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}$/m);
  assert.match(watcher, /sparse-checkout: scripts\/ci-fail-fast\.mjs\n/);
  assert.match(yml, /^permissions:\n {2}contents: read\n#/m, "ci.yml's default stays read-only");
  assert.ok(!Object.keys(jobs).includes("fail-fast"), "ci.yml holds no watcher job of its own");
  for (const id of Object.keys(jobs)) {
    assert.doesNotMatch(jobs[id], /actions: write/, `${id} has no actions: write`);
    // A cancel that reaches a job before it finishes would turn its failure into cancelled.
    assert.doesNotMatch(jobs[id], /gh run cancel|\/cancel\b/, `${id} does not cancel the run`);
  }
});

test("a failed plan is tolerated, no job's own failure is allowed by the run, and every matrix keeps its own fail-fast off", () => {
  // LAST waits on every other job, at any depth, and does not run in a cancelled run.
  const waited = new Set();
  const walk = (id) => {
    for (const need of needsOf(id)) {
      if (waited.has(need)) continue;
      waited.add(need);
      walk(need);
    }
  };
  walk(LAST);
  assert.deepEqual([...waited].sort(), Object.keys(jobs).filter((id) => id !== LAST).sort());
  assert.match(jobs[LAST], /^ {4}if: \$\{\{ !cancelled\(\) && /m);
  // A job whose own failure the run allows (continue-on-error on the job) would be a false cancel.
  assert.deepEqual(Object.keys(jobs).filter((id) => /^ {4}continue-on-error:/m.test(jobs[id])), []);
  // Each matrix keeps fail-fast off, so a cancelled shard means the run was cancelled or it timed out.
  for (const [id, block] of Object.entries(jobs)) if (/^ {4}strategy:/m.test(block)) assert.match(block, /^ {6}fail-fast: false$/m, id);
  // A failed plan is tolerated: no rule requires it, and every job that waits on it runs whatever happened to it.
  const required = JSON.parse(readFileSync(join(root, ".github/required-checks.json"), "utf8"));
  for (const id of TOLERATED) {
    assert.ok(!required.includes(id), id);
    for (const [other, block] of Object.entries(jobs)) if (needsOf(other).includes(id)) assert.match(block, /^ {4}if: \$\{\{ !cancelled\(\)/m, `${other} runs after a failed ${id}`);
  }
});
