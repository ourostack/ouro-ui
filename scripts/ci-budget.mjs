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
// ci-timings artifact), and holds a pull request to the budget (see `judge`): a warning when this
// run's critical path is over it, and a failure only past a hard ceiling or when the median of the
// last full pull request runs is over it, as their ci-timings artifacts record them. One slow
// runner cannot fail it, and a re-run of failed jobs, whose jobs API keeps the first attempt's times
// for the jobs it did not re-run, cannot be needed to clear it.
//
//   node scripts/ci-budget.mjs [--out <file>]   needs GH_TOKEN, GITHUB_REPOSITORY, RUN_ID,
//                                               RUN_ATTEMPT and EVENT, and FULL (false on a
//                                               reduced run)
import { Buffer } from "node:buffer";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The target for a pull request's critical path, in minutes; the margin over it, past which a run
 * warns and the median of the last `medianRuns` full runs fails; and the hard ceiling one run fails at.
 */
export const budget = { targetMinutes: 10, margin: 0.2, ceilingMinutes: 15, medianRuns: 5 };

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
    return { id, pattern: new RegExp(`^${source.join("")}$`), needs };
  });
}

const seconds = (from, to) => (from && to ? Math.max(0, (Date.parse(to) - Date.parse(from)) / 1000) : 0);

/**
 * The critical path through `jobs` (the API's jobs of one run attempt) along the graph's `needs`:
 * its seconds and its jobs, each the slowest instance of its id. A job no API job matches (skipped,
 * or not in this run) adds nothing. This job is left out.
 */
export function criticalPath(jobs, graph) {
  const nodes = graph.filter((node) => node.id !== self);
  const slowest = new Map();
  const unmatched = [];
  for (const job of jobs) {
    const node = nodes.find((candidate) => candidate.pattern.test(job.name));
    if (!node) {
      if (!graph.some((candidate) => candidate.id === self && candidate.pattern.test(job.name))) unmatched.push(job.name);
      continue;
    }
    const duration = job.conclusion === "skipped" ? 0 : seconds(job.started_at, job.completed_at);
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
 * The budget's verdict on a run: `{ fail, warning, median }`. Only a pull request is held to it. Its
 * critical path past the ceiling fails it. A full run (not a reduced one, whose path is shorter) is
 * also failed when the median of its critical path and those of the last full pull request runs
 * (`history`, seconds, newest first), `medianRuns` of them in all, is over the limit; with fewer
 * runs recorded, it is not. Otherwise a critical path over the limit is a warning.
 */
export function judge({ event, criticalSeconds, full, history }, { targetMinutes, margin, ceilingMinutes, medianRuns } = budget) {
  const limit = targetMinutes * 60 * (1 + margin);
  const values = full ? [criticalSeconds, ...history.slice(0, medianRuns - 1)] : [];
  const median = values.length === medianRuns ? percentile(values, 0.5) : null;
  if (event !== "pull_request") return { fail: false, warning: null, median };
  if (criticalSeconds > ceilingMinutes * 60) return { fail: true, reason: "ceiling", warning: null, median };
  if (median !== null && median > limit) return { fail: true, reason: "median", warning: null, median };
  return { fail: false, warning: criticalSeconds > limit ? "over" : null, median };
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
 * The critical paths, seconds, newest first, of the last full pull request runs of ci.yml before this
 * one (`count` at most), as their ci-timings artifacts recorded them. A run with no such artifact,
 * or from before the artifact said whether the run was full, is left out.
 */
async function fullRunHistory({ repository, runId, token, count }) {
  const found = [];
  const { workflow_runs: runs } = await getJson(`https://api.github.com/repos/${repository}/actions/workflows/ci.yml/runs?event=pull_request&status=completed&per_page=30`, token);
  for (const run of runs) {
    if (found.length >= count) break;
    if (String(run.id) === String(runId)) continue;
    const { artifacts } = await getJson(`https://api.github.com/repos/${repository}/actions/runs/${run.id}/artifacts?name=ci-timings`, token);
    const artifact = artifacts.find((candidate) => !candidate.expired);
    if (!artifact) continue;
    const record = JSON.parse(unzipOne(await get(artifact.archive_download_url, token, { raw: true })).toString("utf8"));
    if (record.full === true && typeof record.criticalPathSeconds === "number") found.push(record.criticalPathSeconds);
  }
  return found;
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
  const { GH_TOKEN: token, GITHUB_REPOSITORY: repository, RUN_ID: runId, RUN_ATTEMPT: attempt = "1", EVENT: event } = process.env;
  const full = process.env["FULL"] !== "false";
  if (!token || !repository || !runId || !event) {
    console.error("Set GH_TOKEN, GITHUB_REPOSITORY, RUN_ID, RUN_ATTEMPT and EVENT.");
    return 2;
  }
  const graph = jobGraph(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8"));
  const jobs = await fetchJobs({ repository, runId, attempt, token });
  const path = criticalPath(jobs, graph);
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
  let history = [];
  if (event === "pull_request" && full) {
    try {
      history = await fullRunHistory({ repository, runId, token, count: budget.medianRuns - 1 });
    } catch (error) {
      console.log(`::warning::The critical paths of the last full runs could not be read: ${error.message}`);
    }
  }
  const verdict = judge({ event, criticalSeconds: path.seconds, full, history });
  const record = {
    run: `https://github.com/${repository}/actions/runs/${runId}/attempts/${attempt}`,
    event,
    full,
    criticalPathSeconds: Math.round(path.seconds),
    criticalPath: path.jobs.map((job) => ({ job: job.name, seconds: Math.round(job.seconds) })),
    wallSeconds: Math.round(wall),
    runnerSeconds: Math.round(runner),
    recentWall: recent,
    budget: { ...budget, limitSeconds: limit },
    history,
    medianSeconds: verdict.median === null ? null : Math.round(verdict.median),
    jobs: jobs
      .filter((job) => job.completed_at)
      .map((job) => ({ job: job.name, conclusion: job.conclusion, queuedSeconds: Math.round(seconds(job.created_at, job.started_at)), seconds: Math.round(seconds(job.started_at, job.completed_at)) }))
      .sort((a, b) => b.seconds - a.seconds),
  };
  if (out) writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  const summary = [
    `## CI time`,
    ``,
    `Critical path **${minutes(path.seconds)}** (budget for a pull request: ${budget.targetMinutes} min; over ${minutes(limit)} warns, and fails when the median of the last ${budget.medianRuns} full runs is over it or one run passes ${budget.ceilingMinutes} min).`,
    verdict.median === null
      ? `Median of the last ${budget.medianRuns} full pull request runs: not taken (${full ? `${history.length + 1} recorded` : "a reduced run"}).`
      : `Median of the last ${budget.medianRuns} full pull request runs, this one included: ${minutes(verdict.median)}.`,
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
  if (path.unmatched.length > 0) console.log(`::warning::Jobs no ci.yml job name matches, left out of the critical path: ${path.unmatched.join(", ")}`);
  const chain = path.jobs.map((job) => `${job.name} ${minutes(job.seconds)}`).join(" → ");
  const advice = "Make the slowest job on it faster or split it (scripts/shard.mjs), or raise the budget in scripts/ci-budget.mjs with the reason.";
  if (verdict.warning) console.log(`::warning::The critical path took ${minutes(path.seconds)}, over the ${budget.targetMinutes}-minute budget and its ${budget.margin * 100}% margin: ${chain}. One run can be a slow runner; the check fails when the median of the last ${budget.medianRuns} full runs is over it.`);
  if (verdict.fail) {
    const why = verdict.reason === "ceiling" ? `over the ${budget.ceilingMinutes}-minute ceiling` : `and the median of the last ${budget.medianRuns} full pull request runs is ${minutes(verdict.median)}, over the ${budget.targetMinutes}-minute budget and its ${budget.margin * 100}% margin`;
    console.log(`::error::The critical path took ${minutes(path.seconds)}, ${why}: ${chain}. ${advice}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
