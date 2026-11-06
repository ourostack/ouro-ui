import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DEADLINE_MS, ERRORS, GRACE_MS, ownQueueWait, POLL_MS, RESERVE, SATURATED_MS, waiting, WAITING, yieldToQueue } from "./ci-yield.mjs";

// The yield to the merge queue (scripts/ci-yield.mjs): that a pull request's CI waits while a merge
// group's run has a job waiting for a runner, that it always lets the run start in the end, and
// that ci.yml runs it on pull requests only, before any of the run's other jobs queue.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const yml = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const jobs = Object.fromEntries(
  yml
    .split("\njobs:\n")[1]
    .split(/\n(?= {2}[\w-]+:\n)/)
    .map((block) => [block.match(/^ {2}([\w-]+):/)[1], block]),
);
const needsOf = (id) => jobs[id].match(/^ {4}needs: \[([^\]]*)\]$/m)?.[1].split(",").map((need) => need.trim()) ?? [];

const at = (ms) => new Date(Date.UTC(2026, 10, 2, 21, 0, 0) + ms).toISOString();
const job = (status, created = 0, labels = ["ubuntu-24.04"]) => ({ status, created_at: at(created), labels });
const run = (id, status = "in_progress", created = 0) => ({ id, status, created_at: at(created) });

/** A fake gh: answers the runs list and each run's jobs from `pages`, a function of the read's index, with headers. */
function fakeGh(pages, { left = 900 } = {}) {
  const calls = [];
  let reads = 0;
  const gh = (args) => {
    calls.push(args.join(" "));
    const url = args.at(-1);
    const list = !url.includes("/jobs?");
    const { runs, jobs: jobsOf, fail } = pages(list ? reads++ : reads - 1);
    if (fail) throw Object.assign(new Error(fail), { stderr: fail });
    const id = url.match(/runs\/(\d+)\/jobs/)?.[1];
    const body = list ? { workflow_runs: runs } : { total_count: jobsOf[id].length, jobs: jobsOf[id] };
    return `HTTP/2.0 200 OK\nx-ratelimit-remaining: ${left}\n\n${JSON.stringify(body)}`;
  };
  return { gh, calls };
}

/** Runs yieldToQueue on a fake clock: each wait moves the clock on. */
async function drive(gh, start = GRACE_MS * 3, queuedMs = null) {
  let clock = start;
  const logs = [];
  const waits = [];
  const result = await yieldToQueue({ gh, repo: "o/r", queuedMs, now: () => Date.UTC(2026, 10, 2, 21, 0, 0) + clock, wait: async (ms) => { waits.push(ms); clock += ms; }, log: (line) => logs.push(line) });
  return { result, logs, waits };
}

test("only a merge-queue job waiting past the grace for a Linux or Windows runner counts, and a run still waiting with no job listed", () => {
  const now = Date.parse(at(GRACE_MS * 2));
  const open = [
    { run: run(1), jobs: [job("in_progress"), job("completed"), job("queued"), job("queued", GRACE_MS * 2 - 1000), job("queued", 0, ["macos-15"]), job("waiting", 0, ["windows-latest"])] },
    { run: run(2), jobs: [job("in_progress")] },
    { run: run(3, "queued"), jobs: [] },
    { run: run(4, "queued", GRACE_MS * 2 - 1000), jobs: [] },
  ];
  assert.deepEqual(waiting(open, now), { count: 3, runs: [1, 3] });
  assert.deepEqual(waiting([], now), { count: 0, runs: [] });
  assert.deepEqual(WAITING, ["queued", "waiting", "pending", "requested"]);
});

test("it starts the run at once when no merge-queue job waits, reading only the open merge-group runs", async () => {
  const { gh, calls } = fakeGh(() => ({ runs: [run(7), { ...run(8), status: "completed" }], jobs: { 7: [job("in_progress")] } }));
  const { result, logs, waits } = await drive(gh);
  assert.equal(result, "clear");
  assert.deepEqual(waits, []);
  assert.deepEqual(calls, ["api --include repos/o/r/actions/runs?event=merge_group&per_page=30", "api --include repos/o/r/actions/runs/7/jobs?per_page=100&page=1"]);
  assert.match(logs.at(-1), /^No merge-queue job is waiting for a runner, so this run starts\.$/);
});

test("it waits, reading once a minute, while a merge-queue job waits for a runner, then starts the run", async () => {
  const { gh } = fakeGh((read) => ({ runs: [run(7)], jobs: { 7: [read < 3 ? job("queued") : job("in_progress")] } }));
  const { result, logs, waits } = await drive(gh);
  assert.equal(result, "clear");
  assert.deepEqual(waits, [POLL_MS, POLL_MS, POLL_MS]);
  assert.match(logs[0], /^1 merge-queue job\(s\) are waiting for a runner \(runs 7\), so this pull request's run waits for them/);
  assert.match(logs.at(-1), /^The merge queue's jobs have runners, so this run starts after 3 minutes\.$/);
});

test("it never holds a run back past its deadline, which fits the step's and the plan's time limits", async () => {
  const { gh } = fakeGh(() => ({ runs: [run(7)], jobs: { 7: [job("queued")] } }));
  const { result, logs, waits } = await drive(gh);
  assert.equal(result, "deadline");
  assert.equal(waits.length, DEADLINE_MS / POLL_MS);
  assert.match(logs.at(-1), /^::notice::The merge queue still had jobs waiting for a runner after 10 minutes, so this run starts anyway\.$/);
  const step = jobs.plan.split(/\n {6}- /).find((block) => block.startsWith("name: Yield to the merge queue\n"));
  const stepMinutes = Number(step.match(/^ {8}timeout-minutes: (\d+)$/m)[1]);
  assert.ok(DEADLINE_MS + POLL_MS <= stepMinutes * 60_000, "the deadline and its last read fit the step's time limit");
  const limit = jobs.plan.match(/^ {4}timeout-minutes: \$\{\{ github\.event_name == 'pull_request' && (\d+) \|\| (\d+) \}\}$/m);
  assert.ok(limit, "the plan's time limit depends on the event");
  const [prMinutes, otherMinutes] = [Number(limit[1]), Number(limit[2])];
  assert.ok(prMinutes >= stepMinutes + 8, "on a pull request the plan keeps its own 8 minutes besides the yield");
  assert.equal(otherMinutes, 10, "every other run, which never yields, keeps the plan's 10 minutes");
  assert.match(step, /^ {8}if: github\.event_name == 'pull_request'$/m, "only a pull request yields");
});

test("a plan that waited for its own runner finds the pool full and starts the run without reading the queue", async () => {
  const { gh, calls } = fakeGh(() => ({ runs: [run(7)], jobs: { 7: [job("queued")] } }));
  const { result, waits, logs } = await drive(gh, GRACE_MS * 3, SATURATED_MS);
  assert.equal(result, "saturated");
  assert.deepEqual(waits, []);
  assert.deepEqual(calls, []);
  assert.match(logs[0], /^The plan waited 5 minutes for its own runner, so the pool is full/);
  // A shorter wait, or one that could not be told, yields as before.
  assert.equal((await drive(gh, GRACE_MS * 3, SATURATED_MS - 1)).result, "deadline");
  assert.equal((await drive(gh, GRACE_MS * 3, null)).result, "deadline");
});

test("ownQueueWait reads how long the job the runner took waited, and null when it cannot tell", () => {
  const own = (extra = {}) => ({ runner_name: "GitHub Actions 7", status: "in_progress", created_at: at(0), started_at: at(4 * 60_000), ...extra });
  const reply = (jobsList) => () => `HTTP/2.0 200 OK\nx-ratelimit-remaining: 900\n\n${JSON.stringify({ total_count: jobsList.length, jobs: jobsList })}`;
  assert.equal(ownQueueWait(reply([{ runner_name: "other", status: "in_progress", created_at: at(0), started_at: at(1) }, own()]), "o/r", "9", "GitHub Actions 7"), 4 * 60_000);
  assert.equal(ownQueueWait(reply([own({ runner_name: "other" })]), "o/r", "9", "GitHub Actions 7"), null);
  assert.equal(ownQueueWait(reply([own()]), "o/r", "", "GitHub Actions 7"), null);
  assert.equal(ownQueueWait(reply([own()]), "o/r", "9", ""), null);
});

test("it fails open: a rate limit, few requests left, or repeated failed reads start the run", async () => {
  const limited = fakeGh(() => ({ fail: "gh: API rate limit exceeded (HTTP 403)" }));
  const first = await drive(limited.gh);
  assert.equal(first.result, "rate-limited");
  assert.deepEqual(first.waits, []);
  const low = fakeGh(() => ({ runs: [run(7)], jobs: { 7: [job("queued")] } }), { left: RESERVE - 1 });
  assert.equal((await drive(low.gh)).result, "rate-limited");
  const broken = fakeGh(() => ({ fail: "gh: Server Error (HTTP 502)" }));
  const third = await drive(broken.gh);
  assert.equal(third.result, "errors");
  assert.equal(third.waits.length, ERRORS - 1);
  assert.match(third.logs[0], /^::warning::Could not read the merge queue's runs \(gh: Server Error \(HTTP 502\)\); trying again\.$/);
  // A failed read between two good ones is forgotten.
  const flaky = fakeGh((read) => (read === 1 ? { fail: "gh: Server Error (HTTP 502)" } : { runs: [run(7)], jobs: { 7: [read < 3 ? job("queued") : job("in_progress")] } }));
  assert.equal((await drive(flaky.gh)).result, "clear");
});

test("ci.yml yields on pull requests only, in the plan before any other job queues, and never fails the plan", () => {
  const steps = jobs.plan.split(/\n {6}- /).slice(1);
  const index = steps.findIndex((block) => block.startsWith("name: Yield to the merge queue\n"));
  assert.ok(index > 0, "the plan yields");
  const step = steps[index];
  assert.match(step, /^ {8}if: github\.event_name == 'pull_request'$/m, "never in the merge queue, on main or in a dispatched run");
  assert.match(step, /^ {8}continue-on-error: true$/m);
  assert.match(step, /^ {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {8}run: node scripts\/ci-yield\.mjs$/m);
  assert.match(jobs.plan, /^ {4}permissions:\n {6}actions: read\n {6}contents: read\n/m, "it reads Actions and writes nothing");
  // After the checkout that brings the script, before the install and the plan itself.
  assert.ok(steps.findIndex((block) => block.startsWith("uses: actions/checkout@")) < index);
  assert.ok(steps.findIndex((block) => block.startsWith("run: pnpm i ")) > index);
  // Every other job waits on the plan, so none queues for a runner while the plan yields.
  for (const id of Object.keys(jobs).filter((key) => key !== "plan")) {
    const waits = (key, seen = new Set()) => needsOf(key).some((need) => need === "plan" || (!seen.has(need) && (seen.add(need), waits(need, seen))));
    assert.ok(waits(id) || id === "install-github" || id === "install-latest", `${id} waits on the plan`);
  }
});
