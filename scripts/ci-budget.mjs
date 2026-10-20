// CI's time budget (.github/workflows/ci.yml, the ci-budget job). Reads this run's jobs from the
// GitHub API and ci.yml's `needs`, and reports:
//
// - the critical path: the longest chain of jobs that wait on one another, each job counted from its
//   start to its end (the slowest of a matrix's jobs), so time spent queued for a free runner does
//   not count, and the run's load on the shared runner pool cannot fail it;
// - the wall time: from the first job's creation to the last job's end, queues included.
//
// It writes both, with every job's queue and run times, to the step summary and to --out (JSON),
// and on a pull request fails when the critical path is over budget.
//
//   node scripts/ci-budget.mjs [--out <file>]   needs GH_TOKEN, GITHUB_REPOSITORY, RUN_ID,
//                                               RUN_ATTEMPT and EVENT
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The target for a pull request's critical path, in minutes, and the margin over it that fails the check. */
export const budget = { targetMinutes: 10, margin: 0.2 };

/** This job, which is still running when it reads the run, and never on its own critical path. */
const self = "ci-budget";

/** ci.yml's jobs: each one's id, the name its jobs report as a pattern, and the ids it needs. */
export function jobGraph(text) {
  const blocks = text.split("\njobs:\n")[1].split(/\n(?= {2}[\w-]+:\n)/);
  return blocks.map((block) => {
    const id = block.match(/^ {2}([\w-]+):/)[1];
    const name = block.match(/^ {4}name: (.+)$/m)?.[1] ?? id;
    const needs = block.match(/^ {4}needs: \[([^\]]*)\]$/m)?.[1].split(",").map((need) => need.trim()).filter(Boolean) ?? [];
    // A matrix value in the name matches the values the matrix lists, or any text without a comma or parenthesis.
    const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const source = name.split(/(\$\{\{ *matrix\.\w+ *\}\})/).map((part) => {
      const key = /^\$\{\{ *matrix\.(\w+) *\}\}$/.exec(part)?.[1];
      if (!key) return escape(part);
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

/** Whether a run's critical path is over budget: only a pull request's is held to it. */
export function overBudget(event, criticalSeconds, { targetMinutes, margin } = budget) {
  return event === "pull_request" && criticalSeconds > targetMinutes * 60 * (1 + margin);
}

const minutes = (value) => `${(value / 60).toFixed(1)} min`;

/** Every job of a run attempt, through the API's pages. */
async function fetchJobs({ repository, runId, attempt, token }) {
  const jobs = [];
  for (let page = 1; ; page += 1) {
    let response;
    for (let tries = 1; ; tries += 1) {
      response = await globalThis.fetch(`https://api.github.com/repos/${repository}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100&page=${page}`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
      });
      if (response.ok || tries === 3) break;
      await delay(2000 * tries);
    }
    if (!response.ok) throw new Error(`The jobs API answered ${response.status}: ${await response.text()}`);
    const body = await response.json();
    jobs.push(...body.jobs);
    if (jobs.length >= body.total_count || body.jobs.length === 0) return jobs;
  }
}

async function main(argv) {
  const out = argv[argv.indexOf("--out") + 1];
  const { GH_TOKEN: token, GITHUB_REPOSITORY: repository, RUN_ID: runId, RUN_ATTEMPT: attempt = "1", EVENT: event } = process.env;
  if (!token || !repository || !runId || !event) {
    console.error("Set GH_TOKEN, GITHUB_REPOSITORY, RUN_ID, RUN_ATTEMPT and EVENT.");
    return 2;
  }
  const graph = jobGraph(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8"));
  const jobs = await fetchJobs({ repository, runId, attempt, token });
  const path = criticalPath(jobs, graph);
  const wall = wallTime(jobs, graph);
  const limit = budget.targetMinutes * 60 * (1 + budget.margin);
  const record = {
    run: `https://github.com/${repository}/actions/runs/${runId}/attempts/${attempt}`,
    event,
    criticalPathSeconds: Math.round(path.seconds),
    criticalPath: path.jobs.map((job) => ({ job: job.name, seconds: Math.round(job.seconds) })),
    wallSeconds: Math.round(wall),
    budget: { ...budget, limitSeconds: limit },
    jobs: jobs
      .filter((job) => job.completed_at)
      .map((job) => ({ job: job.name, conclusion: job.conclusion, queuedSeconds: Math.round(seconds(job.created_at, job.started_at)), seconds: Math.round(seconds(job.started_at, job.completed_at)) }))
      .sort((a, b) => b.seconds - a.seconds),
  };
  if (out) writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  const summary = [
    `## CI time`,
    ``,
    `Critical path **${minutes(path.seconds)}** (budget for a pull request: ${budget.targetMinutes} min, failing over ${minutes(limit)}); wall time ${minutes(wall)}, queues included.`,
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
  if (overBudget(event, path.seconds)) {
    console.log(`::error::The critical path took ${minutes(path.seconds)}, over the ${budget.targetMinutes}-minute budget and its ${budget.margin * 100}% margin: ${path.jobs.map((job) => `${job.name} ${minutes(job.seconds)}`).join(" → ")}. Make the slowest job on it faster or split it (scripts/shard.mjs), or raise the budget in scripts/ci-budget.mjs with the reason.`);
    return 1;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
