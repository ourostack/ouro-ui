// CI's time budget (.github/workflows/ci.yml, the ci-budget job). Reads this run's jobs from the
// GitHub API and ci.yml's `needs`, and reports:
//
// - the critical path: the longest chain of jobs that wait on one another, each job counted from its
//   start to its end (the slowest of a matrix's jobs), so time spent queued for a free runner does
//   not count, and the run's load on the shared runner pool cannot fail it;
// - the wall time: from the first job's creation to the last job's end, queues included, which is
//   what a developer waits for, and the median and 90th percentile of it over the last runs of the
//   same event (the workflow runs API);
// - the runner time: the minutes every job of the run held a runner, which on the shared runner
//   pool (60 jobs at once on the Team plan) sets the wall time once runs wait on each other.
//
// It writes them, with every job's queue and run times, to the step summary and to --out (JSON, the
// ci-timings artifact), and holds a pull request to the budget (see `judge`): over it, its work
// time (the critical path with setup steps left out) is compared with main's, the median of the
// latest merge queue runs that passed, and with a ceiling. A run past either fails only when the
// run's earlier attempt or the pull request's previous full run was past it too, so one slow runner
// cannot fail a pull request; with neither, it fails asking for all jobs to be run again.
//
//   node scripts/ci-budget.mjs [--out <file>]   needs GH_TOKEN, GITHUB_REPOSITORY, RUN_ID,
//                                               RUN_ATTEMPT and EVENT, and FULL (false on a
//                                               reduced run)
import { Buffer } from "node:buffer";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The target for a pull request's critical path, in minutes, and the margin over it past which a
 * run is over the budget; how many of main's latest passing merge queue runs make its baseline, and
 * how many minutes of work time (setup left out) over that baseline a run over the budget fails at;
 * and the hard ceiling one run fails at: `ceilingMinutes`, or `ceilingFactor` times main's
 * baseline, whichever is more.
 */
export const budget = { targetMinutes: 10, margin: 0.2, baselineRuns: 5, regressionMinutes: 3, ceilingMinutes: 15, ceilingFactor: 1.5 };

/**
 * The steps that set a job up rather than do its work: the runner's own, the checkout, pnpm and
 * Node, the install, and the browsers and their system packages. Their time is the runner's and the
 * network's more than the change's, so a regression is judged without them (`workSeconds`).
 */
export const setupSteps = [/^Set up job$/, /^Run actions\/checkout@/, /^Run pnpm\/action-setup@/, /^Run actions\/setup-node@/, /^Run pnpm i\b/, /^Run \.\/\.github\/actions\/playwright-browsers\b/, /^Browser system packages\b/, /install-deps/];

/** This job, which is still running when it reads the run, and never on its own critical path. */
const self = "ci-budget";

/** ci.yml's jobs: each one's id, the name its jobs report as a pattern, and the ids it needs. */
export function jobGraph(text) {
  const blocks = text.split("\njobs:\n")[1].split(/\n(?= {2}[\w-]+:\n)/);
  return blocks.map((block) => {
    const id = block.match(/^ {2}([\w-]+):/)[1];
    const name = block.match(/^ {4}name: (.+)$/m)?.[1] ?? id;
    const needs = block.match(/^ {4}needs: \[([^\]]*)\]$/m)?.[1].split(",").map((need) => need.trim()).filter(Boolean) ?? [];
    // A matrix value in the name matches the values the matrix lists, or any text without a comma or
    // parenthesis, and so does any other expression (a shard count a job's needs compute).
    const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const source = name.split(/(\$\{\{[^}]*\}\})/).map((part) => {
      if (!/^\$\{\{[^}]*\}\}$/.test(part)) return escape(part);
      const key = /^\$\{\{ *matrix\.(\w+) *\}\}$/.exec(part)?.[1];
      if (!key) return "[^,()]+";
      const values = block.match(new RegExp(`^ {8}${key}: \\[([^\\]]*)\\]$`, "m"))?.[1].split(",").map((value) => value.trim());
      return values ? `(?:${values.map(escape).join("|")})` : "[^,()]+";
    });
    return { id, pattern: new RegExp(`^${source.join("")}$`), template: name, needs };
  });
}

const seconds = (from, to) => (from && to ? Math.max(0, (Date.parse(to) - Date.parse(from)) / 1000) : 0);

/** A job's run time without its setup steps (`setupSteps`); a job reported without steps counts whole. */
export function workSeconds(job) {
  const setup = (job.steps ?? []).filter((step) => setupSteps.some((pattern) => pattern.test(step.name))).reduce((total, step) => total + seconds(step.started_at, step.completed_at), 0);
  return Math.max(0, seconds(job.started_at, job.completed_at) - setup);
}

/**
 * The critical path through `jobs` (the API's jobs of one run attempt) along the graph's `needs`:
 * its seconds and its jobs, each the slowest instance of its id. A job no API job matches (skipped,
 * or not in this run) adds nothing. This job is left out. With `work`, each job counts its work
 * time, setup left out (`workSeconds`).
 */
export function criticalPath(jobs, graph, { work = false } = {}) {
  const nodes = graph.filter((node) => node.id !== self);
  const slowest = new Map();
  const unmatched = [];
  for (const job of jobs) {
    // A matrix job its `if` skipped reports once, under its name with the expressions unexpanded.
    const node = nodes.find((candidate) => candidate.pattern.test(job.name) || candidate.template === job.name);
    if (!node) {
      if (!graph.some((candidate) => candidate.id === self && candidate.pattern.test(job.name))) unmatched.push(job.name);
      continue;
    }
    const duration = job.conclusion === "skipped" ? 0 : work ? workSeconds(job) : seconds(job.started_at, job.completed_at);
    if (!slowest.has(node.id) || duration > slowest.get(node.id).seconds) slowest.set(node.id, { name: job.name, seconds: duration });
  }
  const memo = new Map();
  const longest = (id) => {
    if (memo.has(id)) return memo.get(id);
    const node = nodes.find((candidate) => candidate.id === id);
    const before = (node?.needs ?? []).filter((need) => need !== self).map(longest).reduce((best, path) => (path.seconds > best.seconds ? path : best), { seconds: 0, jobs: [] });
    const own = slowest.get(id);
    const path = own ? { seconds: before.seconds + own.seconds, jobs: [...before.jobs, own] } : before;
    memo.set(id, path);
    return path;
  };
  const path = nodes.map((node) => longest(node.id)).reduce((best, candidate) => (candidate.seconds > best.seconds ? candidate : best), { seconds: 0, jobs: [] });
  return { ...path, unmatched };
}

/** The run's wall time: the first job's creation to the last job's end, this job left out. */
export function wallTime(jobs, graph) {
  const own = graph.find((node) => node.id === self)?.pattern;
  const others = jobs.filter((job) => !own?.test(job.name) && job.completed_at);
  if (others.length === 0) return 0;
  return seconds(new Date(Math.min(...others.map((job) => Date.parse(job.created_at)))).toISOString(), new Date(Math.max(...others.map((job) => Date.parse(job.completed_at)))).toISOString());
}

/** The minutes, in seconds, every job but this one held a runner: start to end, a skipped job none. */
export function runnerTime(jobs, graph) {
  const own = graph.find((node) => node.id === self)?.pattern;
  return jobs.filter((job) => !own?.test(job.name) && job.conclusion !== "skipped").reduce((total, job) => total + seconds(job.started_at, job.completed_at), 0);
}

/** The `fraction` percentile of `values` (nearest rank), or null when there are none. */
export function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))];
}

/**
 * The wall times, queues included, of completed workflow runs from the runs API: each from its
 * latest attempt's start to its last update, which for a completed run is its end.
 */
export function runWalls(runs) {
  return runs.filter((run) => run.status === "completed" && run.conclusion !== "cancelled" && run.conclusion !== "skipped").map((run) => seconds(run.run_started_at ?? run.created_at, run.updated_at));
}

/**
 * The budget's verdict on a run: `{ fail, reason, warning }`. A job that no ci.yml job name
 * matches (`unmatched`) fails a pull request, since its critical path would leave that job out; a
 * merge group or a push only warns, so the required check never bounces a queue entry (the pull
 * request's own run, from the same ci.yml, fails first). Otherwise only a pull request is held to it, and not a full-suite fallback run (`fallback`),
 * whose time is the whole suite's, not the change's. Under the limit (the target and its margin)
 * its critical path passes. Over it, its work time (the critical path with setup steps left out,
 * `workSeconds`) is judged: past the ceiling (`ceilingSeconds`), or more than `regressionMinutes`
 * over main's (`baselineWorkSeconds`), it fails when the earlier evidence (`earlierWorkSeconds`:
 * this run's earlier attempt, or the pull request's previous full run) was past it too, warns when
 * that was not, and with none fails asking for all its jobs to be run again, so one slow runner
 * cannot fail a pull request, and a pull request pushed once cannot pass unjudged.
 */
export function judge({ event, fallback = false, criticalSeconds, workSeconds: work = null, baselineWorkSeconds = null, earlierWorkSeconds = null, unmatched = [] }, { targetMinutes, margin, ceilingMinutes, ceilingFactor, regressionMinutes } = budget) {
  const limit = targetMinutes * 60 * (1 + margin);
  if (unmatched.length > 0) return event === "pull_request" ? { fail: true, reason: "unmatched", warning: null } : { fail: false, warning: "unmatched" };
  if (event !== "pull_request") return { fail: false, warning: null };
  if (fallback) return { fail: false, warning: "fallback" };
  if (criticalSeconds <= limit || typeof work !== "number") return { fail: false, warning: null };
  const ceiling = ceilingSeconds(baselineWorkSeconds, { ceilingMinutes, ceilingFactor });
  const regression = typeof baselineWorkSeconds === "number" ? baselineWorkSeconds + regressionMinutes * 60 : Infinity;
  const reason = work > ceiling ? "ceiling" : work > regression ? "regression" : null;
  if (!reason) return { fail: false, warning: typeof baselineWorkSeconds === "number" ? "over" : "no-baseline" };
  const bar = reason === "ceiling" ? ceiling : regression;
  if (typeof earlierWorkSeconds !== "number") return { fail: true, reason: "confirm", warning: null };
  if (earlierWorkSeconds > bar) return { fail: true, reason, warning: null };
  return { fail: false, warning: "unconfirmed" };
}

/** The work time a pull request's fails past, in seconds: `ceilingMinutes`, or `ceilingFactor` times main's work baseline when that is more. */
export function ceilingSeconds(baselineWorkSeconds, { ceilingMinutes, ceilingFactor } = budget) {
  return Math.max(ceilingMinutes * 60, typeof baselineWorkSeconds === "number" ? ceilingFactor * baselineWorkSeconds : 0);
}

/**
 * Whether every job of a run attempt that ran (`jobs`, from the jobs API) ran in that attempt, as
 * after "Re-run all jobs": "Re-run failed jobs" keeps the jobs that passed, with their times, so
 * that attempt repeats the earlier one's work time and cannot confirm it.
 */
export function freshAttempt(jobs, attempt) {
  return jobs.filter((job) => job.conclusion !== "skipped").every((job) => job.run_attempt === undefined || Number(job.run_attempt) === Number(attempt));
}

/** The fail-fast job (scripts/ci-fail-fast.mjs), which watches the run rather than doing its work. */
const watcher = "fail-fast";

/**
 * Whether a run attempt's jobs (from the jobs API) all passed, so its work time can confirm
 * another's: every job but ci-budget and fail-fast passed or was skipped. A skip then is one a green
 * run makes too (install-github on a pull request, the install shards the plan leaves to the merge
 * queue), since a job skipped for a failure or a cancel sits beside the job that failed or was
 * cancelled. A failed or cancelled job ends its chain early, and the shorter work time would excuse
 * a real regression: a flake that failed fast, motion-coverage skipped after ci failed, or a run
 * fail-fast or a newer push cancelled.
 */
export function passedAttempt(jobs) {
  const others = jobs.filter((job) => job.name !== self && job.name !== watcher);
  return others.length > 0 && others.every((job) => job.conclusion === "success" || job.conclusion === "skipped");
}

/**
 * The earlier evidence a regression needs, as `{ seconds, from }`: this run's earlier attempt
 * (`attemptJobs(n)`), when this one ran its jobs afresh ("Re-run all jobs") and that one ran to its
 * end with every job passed (`passedAttempt`), or else the pull request's previous full run (`previous()`), or none.
 */
export async function earlierWork({ attempt, jobs, graph, attemptJobs, previous }) {
  if (Number(attempt) > 1 && freshAttempt(jobs, attempt)) {
    const before = await attemptJobs(Number(attempt) - 1);
    if (passedAttempt(before)) return { seconds: criticalPath(before, graph, { work: true }).seconds, from: `attempt ${Number(attempt) - 1} of this run` };
  }
  const seconds = previous ? await previous() : null;
  return seconds === null ? { seconds: null, from: null } : { seconds, from: "the pull request's previous full run" };
}

/** Whether a run's ci-timings record shows every job but ci-budget passed or was skipped. */
export function recordPassed(record) {
  const others = (record?.jobs ?? []).filter((job) => job.job !== self);
  return others.length > 0 && others.every((job) => job.conclusion === "success" || job.conclusion === "skipped");
}

/**
 * Main's baseline from merge queue runs, newest first, each `{ attempt, record }` with the run's own
 * ci-timings record: the median of the critical paths the first `count` that passed recorded, each
 * on its first attempt, since the jobs API of a re-run keeps the times of the jobs it did not run
 * again. Each run's critical path is the one its own ci.yml measured, not this run's job graph's.
 * `{ seconds, values }`; seconds is null when none passed.
 */
export function baseline(runs, count = budget.baselineRuns) {
  const values = [];
  const workValues = [];
  for (const run of runs) {
    if (values.length >= count) break;
    if (run.attempt !== 1 || !recordPassed(run.record) || typeof run.record.criticalPathSeconds !== "number") continue;
    if (run.record.criticalPathSeconds > 0) {
      values.push(run.record.criticalPathSeconds);
      if (typeof run.record.workPathSeconds === "number") workValues.push(run.record.workPathSeconds);
    }
  }
  // Main's work time counts once every run of the baseline recorded one.
  return { seconds: percentile(values, 0.5), values, workSeconds: workValues.length >= count ? percentile(workValues, 0.5) : null, workValues };
}

/**
 * The work time (`workPathSeconds`) of a pull request's previous full run: the newest of its earlier
 * runs' ci-timings records (newest first, null where a run kept none) that ran the full suite and
 * not as a fallback. Null when there is none.
 */
export function previousFull(records) {
  const found = records.find((record) => record && record.full === true && record.fallback !== true && typeof record.workPathSeconds === "number");
  return found ? found.workPathSeconds : null;
}

/**
 * The one file of a zip archive (an artifact as the API downloads it): read from the central
 * directory, which holds the sizes a streamed local header may leave out. Stored or deflated.
 */
export function unzipOne(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("not a zip archive");
  const central = zip.readUInt32LE(end + 16);
  if (zip.readUInt32LE(central) !== 0x02014b50) throw new Error("no central directory");
  const method = zip.readUInt16LE(central + 10);
  const size = zip.readUInt32LE(central + 20);
  const local = zip.readUInt32LE(central + 42);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const data = zip.subarray(start, start + size);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`zip compression method ${method}`);
}

const minutes = (value) => `${(value / 60).toFixed(1)} min`;

/** The answer of a GitHub API GET, retried up to three times: JSON, or with `raw` the bytes. */
async function get(url, token, { raw = false } = {}) {
  let response;
  for (let tries = 1; ; tries += 1) {
    // An artifact's download answers with a redirect to storage, which takes no GitHub token.
    response = await globalThis.fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
      redirect: raw ? "manual" : "follow",
    });
    if (raw && response.status >= 300 && response.status < 400) response = await globalThis.fetch(response.headers.get("location"));
    if (response.ok || tries === 3) break;
    await delay(2000 * tries);
  }
  if (!response.ok) throw new Error(`${url} answered ${response.status}: ${await response.text()}`);
  return raw ? Buffer.from(await response.arrayBuffer()) : response.json();
}

const getJson = (url, token) => get(url, token);

/**
 * Main's latest completed merge queue runs of ci.yml that ran once, newest first, as
 * `{ attempt, record }` with each run's ci-timings record (null when it has none), until `count`
 * of them passed (of the latest 30).
 */
async function mergeQueueRuns({ repository, token, count }) {
  const found = [];
  const { workflow_runs: runs } = await getJson(`https://api.github.com/repos/${repository}/actions/workflows/ci.yml/runs?event=merge_group&status=completed&per_page=30`, token);
  for (const run of runs) {
    if (found.filter((candidate) => recordPassed(candidate.record)).length >= count) break;
    if (run.run_attempt !== 1) continue;
    found.push({ attempt: 1, record: await timingsOf({ repository, token, runId: run.id }) });
  }
  return found;
}

/** A run's ci-timings record, or null when it kept none. */
async function timingsOf({ repository, token, runId }) {
  const { artifacts } = await getJson(`https://api.github.com/repos/${repository}/actions/runs/${runId}/artifacts?name=ci-timings`, token);
  const artifact = artifacts.find((candidate) => !candidate.expired);
  return artifact ? JSON.parse(unzipOne(await get(artifact.archive_download_url, token, { raw: true })).toString("utf8")) : null;
}

/** How many of a pull request's earlier runs that kept a ci-timings record are read, and over how many pages of its runs. */
export const previousRuns = { records: 5, pages: 3, perPage: 20 };

/**
 * The work time of the pull request's previous full run (`previousFull`), from its branch's earlier
 * runs, newest first (`runsPage(page)`, each run's record from `recordOf(runId)`): the newest of the
 * latest `previousRuns.records` runs that kept a ci-timings record. A run that kept none, as one
 * fail-fast or a newer push cancelled before ci-budget ran, is passed over rather than counted, so a
 * few red pushes do not hide the full run before them; at most `previousRuns.pages` pages are read.
 */
export async function previousRunWorkFrom({ runsPage, recordOf, runId }, { records: keep, pages } = previousRuns) {
  const records = [];
  for (let page = 1; page <= pages && records.length < keep; page += 1) {
    const runs = await runsPage(page);
    for (const run of runs.filter((candidate) => String(candidate.id) !== String(runId))) {
      const record = await recordOf(run.id);
      if (record === null) continue;
      records.push(record);
      if (previousFull([record]) !== null || records.length >= keep) return previousFull(records);
    }
    if (runs.length < previousRuns.perPage) break;
  }
  return previousFull(records);
}

async function previousRunWork({ repository, token, branch, runId }) {
  const runsPage = async (page) => (await getJson(`https://api.github.com/repos/${repository}/actions/workflows/ci.yml/runs?event=pull_request&branch=${encodeURIComponent(branch)}&status=completed&per_page=${previousRuns.perPage}&page=${page}`, token)).workflow_runs;
  return previousRunWorkFrom({ runsPage, recordOf: (id) => timingsOf({ repository, token, runId: id }), runId });
}

/** How many of the latest runs the wall time's median and 90th percentile are taken over. */
export const recentRuns = 20;

/** Every job of a run attempt, through the API's pages. */
async function fetchJobs({ repository, runId, attempt, token }) {
  const jobs = [];
  for (let page = 1; ; page += 1) {
    const body = await getJson(`https://api.github.com/repos/${repository}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100&page=${page}`, token);
    jobs.push(...body.jobs);
    if (jobs.length >= body.total_count || body.jobs.length === 0) return jobs;
  }
}

async function main(argv) {
  const out = argv[argv.indexOf("--out") + 1];
  const { GH_TOKEN: token, GITHUB_REPOSITORY: repository, RUN_ID: runId, RUN_ATTEMPT: attempt = "1", EVENT: event, HEAD_REF: branch } = process.env;
  const full = process.env["FULL"] !== "false";
  const fallback = process.env["FALLBACK"] === "true";
  if (!token || !repository || !runId || !event) {
    console.error("Set GH_TOKEN, GITHUB_REPOSITORY, RUN_ID, RUN_ATTEMPT and EVENT.");
    return 2;
  }
  const graph = jobGraph(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8"));
  const jobs = await fetchJobs({ repository, runId, attempt, token });
  const path = criticalPath(jobs, graph);
  const work = criticalPath(jobs, graph, { work: true });
  const wall = wallTime(jobs, graph);
  const runner = runnerTime(jobs, graph);
  // The latest completed runs of ci.yml for the same event, this one not yet among them.
  let recent = null;
  try {
    const { workflow_runs: runs } = await getJson(`https://api.github.com/repos/${repository}/actions/workflows/ci.yml/runs?event=${encodeURIComponent(event)}&status=completed&per_page=${recentRuns}`, token);
    const walls = runWalls(runs);
    recent = { event, runs: walls.length, p50Seconds: Math.round(percentile(walls, 0.5) ?? 0), p90Seconds: Math.round(percentile(walls, 0.9) ?? 0) };
  } catch (error) {
    console.log(`::warning::The wall times of the latest runs could not be read: ${error.message}`);
  }
  const limit = budget.targetMinutes * 60 * (1 + budget.margin);
  let mainBaseline = { seconds: null, values: [], workSeconds: null, workValues: [] };
  // The earlier evidence a regression needs (earlierWork).
  let earlier = { seconds: null, from: null };
  if (event === "pull_request" && !fallback) {
    try {
      mainBaseline = baseline(await mergeQueueRuns({ repository, token, count: budget.baselineRuns }));
    } catch (error) {
      console.log(`::warning::Main's baseline, from its latest merge queue runs, could not be read: ${error.message}`);
    }
    if (path.seconds > limit) {
      try {
        earlier = await earlierWork({
          attempt,
          jobs,
          graph,
          attemptJobs: (number) => fetchJobs({ repository, runId, attempt: number, token }),
          previous: branch ? () => previousRunWork({ repository, token, branch, runId }) : null,
        });
      } catch (error) {
        console.log(`::warning::The earlier attempt or the pull request's previous full run could not be read: ${error.message}`);
      }
    }
  }
  const verdict = judge({ event, fallback, criticalSeconds: path.seconds, workSeconds: work.seconds, baselineWorkSeconds: mainBaseline.workSeconds, earlierWorkSeconds: earlier.seconds, unmatched: path.unmatched });
  const ceiling = ceilingSeconds(mainBaseline.workSeconds);
  const record = {
    run: `https://github.com/${repository}/actions/runs/${runId}/attempts/${attempt}`,
    event,
    full,
    fallback,
    criticalPathSeconds: Math.round(path.seconds),
    workPathSeconds: Math.round(work.seconds),
    workPath: work.jobs.map((job) => ({ job: job.name, seconds: Math.round(job.seconds) })),
    criticalPath: path.jobs.map((job) => ({ job: job.name, seconds: Math.round(job.seconds) })),
    wallSeconds: Math.round(wall),
    runnerSeconds: Math.round(runner),
    recentWall: recent,
    budget: { ...budget, limitSeconds: limit },
    baseline: { seconds: mainBaseline.seconds === null ? null : Math.round(mainBaseline.seconds), runs: mainBaseline.values.map(Math.round), workSeconds: mainBaseline.workSeconds === null ? null : Math.round(mainBaseline.workSeconds), workRuns: mainBaseline.workValues.map(Math.round) },
    earlierWork: earlier.seconds === null ? null : { seconds: Math.round(earlier.seconds), from: earlier.from },
    ceilingSeconds: Math.round(ceiling),
    jobs: jobs
      .filter((job) => job.completed_at)
      .map((job) => ({ job: job.name, conclusion: job.conclusion, queuedSeconds: Math.round(seconds(job.created_at, job.started_at)), seconds: Math.round(seconds(job.started_at, job.completed_at)) }))
      .sort((a, b) => b.seconds - a.seconds),
  };
  if (out) writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  const summary = [
    `## CI time`,
    ``,
    `Critical path **${minutes(path.seconds)}**, work time (setup steps left out) **${minutes(work.seconds)}** (budget for a pull request: ${budget.targetMinutes} min; over ${minutes(limit)}, a work time more than ${budget.regressionMinutes} min over main's, or past ${minutes(ceiling)}, fails when the earlier attempt or the pull request's previous full run was past it too${fallback ? "; a full-suite fallback run is not judged" : ""}).`,
    mainBaseline.seconds === null ? `Main's baseline: none (no passing merge queue run read).` : `Main's baseline, the median of its latest ${mainBaseline.values.length} passing merge queue runs: ${minutes(mainBaseline.seconds)}, work time ${mainBaseline.workSeconds === null ? "not recorded" : minutes(mainBaseline.workSeconds)}.`,
    ``,
    `Wall time **${minutes(wall)}**, queues included; runners held for **${minutes(runner)}**.`,
    recent && recent.runs > 0
      ? `Over the last ${recent.runs} completed \`${event}\` runs, wall time p50 ${minutes(recent.p50Seconds)}, p90 ${minutes(recent.p90Seconds)}.`
      : `No completed \`${event}\` run to compare with.`,
    ``,
    `| critical path | run time |`,
    `|---|---|`,
    ...path.jobs.map((job) => `| ${job.name} | ${minutes(job.seconds)} |`),
    ``,
    `<details><summary>Every job (queued, run)</summary>`,
    ``,
    `| job | queued | run |`,
    `|---|---|---|`,
    ...record.jobs.map((job) => `| ${job.job} | ${minutes(job.queuedSeconds)} | ${minutes(job.seconds)} |`),
    ``,
    `</details>`,
    ``,
  ].join("\n");
  console.log(summary);
  if (process.env["GITHUB_STEP_SUMMARY"]) appendFileSync(process.env["GITHUB_STEP_SUMMARY"], summary);
  const chain = path.jobs.map((job) => `${job.name} ${minutes(job.seconds)}`).join(" → ");
  const advice = "Make the slowest job on it faster or split it (scripts/shard.mjs), or raise the budget in scripts/ci-budget.mjs with the reason.";
  const over = `over the ${budget.targetMinutes}-minute budget and its ${budget.margin * 100}% margin`;
  const workBar = verdict.reason === "ceiling" || mainBaseline.workSeconds === null ? minutes(ceiling) : minutes(mainBaseline.workSeconds + budget.regressionMinutes * 60);
  const pastBar = `its work time (${minutes(work.seconds)}) is past ${workBar} (main's work time and ${budget.regressionMinutes} min, or the ceiling of ${budget.ceilingMinutes} min or ${budget.ceilingFactor}× main's)`;
  const because = {
    over: `but its work time (${minutes(work.seconds)}) is within ${budget.regressionMinutes} min of main's (${minutes(mainBaseline.workSeconds ?? 0)}): more likely a slow runner than this change`,
    unconfirmed: `and ${pastBar}, but ${earlier.from}'s (${minutes(earlier.seconds ?? 0)}) was not: more likely a slow runner than this change`,
    "no-baseline": "with no work time from a passing merge queue run on main to compare it with",
    fallback: "on a full-suite fallback run, which is not judged",
  }[verdict.warning];
  if (verdict.warning === "unmatched") console.log(`::warning::No ci.yml job name matches these jobs, so this run's critical path leaves them out: ${path.unmatched.join(", ")}. A pull request run fails on this; give each job a name the job graph reads (jobGraph).`);
  else if (verdict.warning) console.log(`::warning::The critical path took ${minutes(path.seconds)}, ${over}, ${because}: ${chain}.`);
  if (verdict.fail) {
    if (verdict.reason === "unmatched") {
      console.log(`::error::No ci.yml job name matches these jobs, so the critical path would leave them out: ${path.unmatched.join(", ")}. Give each job a name the job graph reads (jobGraph), with every matrix value it uses listed in its matrix.`);
      return 1;
    }
    if (verdict.reason === "confirm") {
      console.log(`::error::The critical path took ${minutes(path.seconds)}, ${over}, and ${pastBar}, with no earlier attempt or full run of this pull request to confirm it: ${chain}. Re-run all jobs to confirm (not only the failed ones): one slow runner does not fail a pull request, two runs past it do.`);
      return 1;
    }
    console.log(`::error::The critical path took ${minutes(path.seconds)}, ${over}, and ${pastBar}, as ${earlier.from}'s was (${minutes(earlier.seconds ?? 0)}): ${chain}. ${advice}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
