// Fail fast for a pull request's CI (.github/workflows/ci-fail-fast.yml). GitHub has no switch
// that stops a run's other jobs when one fails, and each matrix keeps its own off so every shard
// reports, so one watcher job reads the jobs of every open pull_request CI run every SWEEP_MS and,
// once a run has a job that failed and finished, cancels that run, so a red job frees the runners
// of the rest rather than when the slowest of them ends. One watcher serves every run: a watcher
// job per run held a runner for as long as that run lasted, queueing included.
//
// It waits for the failed job to finish, so that job keeps its failure conclusion, its log and its
// artifacts: a cancel that reaches a job before its last step ends marks it cancelled (the runner's
// StepsRunner), which is also why no job cancels its own run. The jobs the run had not finished
// report cancelled, and ci-budget, a required check, does not run in a cancelled run, so the pull
// request stays blocked until a push or a re-run passes.
//
// Only a run's latest attempt's jobs count, so a re-run is not cancelled by the jobs its earlier
// attempt failed or had cancelled. Nor do the jobs whose failure the run tolerates (TOLERATED), or
// latency's (RERUN_ALONE): its gate reads runner speed, so a slow runner can fail it with the
// change sound, and a re-run of it alone is cheaper than a run cancelled for it. A run whose LAST
// job has finished is left alone: nothing is left to free. It never fails: a failed call is a
// warning and the next read tries again, and it gives up at SWEEP_DEADLINE_MS, under its job's time
// limit. It calls gh with fixed arguments, never through a shell.
//
// Its request budget: the repository's GITHUB_TOKEN requests share 1,000 an hour (the Team plan)
// with every other run, ci-budget's required check among them. It reads the open runs and each
// one's jobs (a page of 100 holds every job) every SWEEP_MS, plus a cancel; and when the API
// answers 403 or 429, or says fewer than RESERVE requests are left, it stops watching.
//
//   node scripts/ci-fail-fast.mjs   in GitHub Actions: GITHUB_REPOSITORY, and GH_TOKEN with
//                                   actions: write; watches every open pull request CI run
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

/** The job that waits on every other job: once it has finished, nothing is left to free. */
export const LAST = "ci-budget";
/** Jobs whose failure the run tolerates: when the plan fails, every job that reads it runs everything. */
export const TOLERATED = ["plan"];
/** Jobs that a slow runner can fail with the change sound: their failure is left to a re-run of that job, not a cancelled run. */
export const RERUN_ALONE = ["latency"];
/** A finished job with one of these conclusions means the run cannot pass. */
export const FAILED = ["failure", "timed_out", "cancelled"];
/** It stops watching when the API says fewer requests than this are left this hour, for the required checks. */
export const RESERVE = 200;
/**
 * What to do about this attempt's jobs as they stand (`{ name, status, conclusion, run_attempt }`
 * from the jobs API): leave the run ("done", LAST has finished, so a failure would free nothing),
 * cancel the run (a counted job failed and finished), or wait.
 * @returns {{ kind: "done" } | { kind: "cancel", failed: string[] } | { kind: "wait" }}
 */
export function decide(jobs, attempt) {
  const current = jobs.filter((job) => (job.run_attempt === undefined || Number(job.run_attempt) === Number(attempt)));
  if (current.some((job) => job.name === LAST && job.status === "completed")) return { kind: "done" };
  const failed = current.filter((job) => !TOLERATED.includes(job.name) && !RERUN_ALONE.includes(job.name) && job.status === "completed" && FAILED.includes(job.conclusion ?? ""));
  if (failed.length > 0) return { kind: "cancel", failed: failed.map((job) => job.name).sort() };
  return { kind: "wait" };
}

/** How often the shared watcher reads the open runs: every 2 minutes. */
export const SWEEP_MS = 120_000;
/** The shared watcher's own limit: it gives up (and the next pull request run starts another) under its job's time limit. */
export const SWEEP_DEADLINE_MS = 320 * 60_000;

/** The notice and step summary line: which job failed, so the cancelled ones read as what followed. */
export const cancelNote = (failed) => `${failed.join(", ")} failed, so fail-fast cancelled the rest of this pull request's run to free its runners. The failed job's own log says why.`;

/** The first line of an error's message, for a warning. */
const firstLine = (error) => String(error?.message ?? error).split("\n")[0];

/** Everything a failed gh call said: its output (headers, with --include), its error output and its message. */
const said = (error) => [error?.stdout, error?.stderr, error?.message].filter(Boolean).join("\n");

/** Whether what the API said means this token is rate limited: a 403 or a 429, or a header that says so. */
export const rateLimited = (text) => /\bHTTP (?:403|429)\b|^HTTP\/[\d.]+ (?:403|429)\b|^x-ratelimit-remaining:\s*0\s*$|^retry-after:/im.test(text);

/** The requests left this hour, from `gh api --include` headers, or null. */
export const requestsLeft = (headers) => {
  const match = /^x-ratelimit-remaining:\s*(\d+)/im.exec(headers);
  return match ? Number(match[1]) : null;
};

class RateLimit extends Error {}

/** Every job of the run attempt, a page of 100 at a time, through `gh api --include`. */
function readJobs(gh, url) {
  const jobs = [];
  for (let page = 1; ; page += 1) {
    const output = gh(["api", "--include", `${url}&page=${page}`]);
    const at = output.search(/\r?\n\r?\n/);
    const left = requestsLeft(output.slice(0, at));
    if (left !== null && left < RESERVE) throw new RateLimit(`${left} requests are left this hour`);
    const body = JSON.parse(output.slice(at).trim());
    jobs.push(...body.jobs);
    if (jobs.length >= body.total_count || body.jobs.length === 0) return jobs;
  }
}

/** The open pull request CI runs, `{ id, attempt }` each, through `gh api --include`. */
function openRuns(gh, repo) {
  const output = gh(["api", "--include", `repos/${repo}/actions/workflows/ci.yml/runs?event=pull_request&status=in_progress&per_page=100`]);
  const at = output.search(/\r?\n\r?\n/);
  const left = requestsLeft(output.slice(0, at));
  if (left !== null && left < RESERVE) throw new RateLimit(`${left} requests are left this hour`);
  return JSON.parse(output.slice(at).trim()).workflow_runs.map((run) => ({ id: run.id, attempt: run.run_attempt }));
}

/** How many pull request CI runs wait for a runner: they have nothing to read yet, but they will. */
function queuedRuns(gh, repo) {
  const output = gh(["api", "--include", `repos/${repo}/actions/workflows/ci.yml/runs?event=pull_request&status=queued&per_page=1`]);
  const at = output.search(/\r?\n\r?\n/);
  return JSON.parse(output.slice(at).trim()).total_count;
}

/**
 * Watches every open pull request CI run until none is in progress or waiting for a runner, the API rate limits it, or the
 * deadline passes: once a run has a counted job that failed and finished, cancels that run. Never
 * throws. `gh` is as for `watch`.
 * @returns {Promise<"idle" | "rate-limited" | "deadline">}
 */
export async function sweep({ gh, repo, wait = sleep, now = Date.now, log = console.log, summary = () => {} }) {
  const end = now() + SWEEP_DEADLINE_MS;
  while (now() < end) {
    try {
      const runs = openRuns(gh, repo);
      if (runs.length === 0 && queuedRuns(gh, repo) === 0) {
        log("No pull request CI run is in progress or waiting for a runner, so there is nothing to watch.");
        return "idle";
      }
      for (const { id, attempt } of runs) {
        const run = `repos/${repo}/actions/runs/${id}`;
        let verdict = { kind: "wait" };
        try {
          verdict = decide(readJobs(gh, `${run}/attempts/${attempt}/jobs?per_page=100`), attempt);
        } catch (error) {
          if (error instanceof RateLimit || rateLimited(said(error))) throw error;
          log(`::warning::Could not read run ${id}'s jobs (${firstLine(error)}); trying again.`);
        }
        if (verdict.kind !== "cancel") continue;
        const note = cancelNote(verdict.failed);
        try {
          gh(["api", "-X", "POST", `${run}/cancel`]);
          log(`::notice::Run ${id}: ${note}`);
          summary(`Run ${id}: ${note}\n`);
        } catch (error) {
          log(`::warning::${verdict.failed.join(", ")} failed in run ${id}, but cancelling it did not work (${firstLine(error)}).`);
        }
      }
    } catch (error) {
      if (error instanceof RateLimit || rateLimited(said(error))) {
        log(`::warning::Stopped watching: the API is rate limiting this repository's runs (${firstLine(error)}), and the required checks need what is left.`);
        return "rate-limited";
      }
      log(`::warning::Could not read the open runs (${firstLine(error)}); trying again.`);
    }
    await wait(SWEEP_MS);
  }
  log(`::warning::Stopped watching: pull request runs are still going after ${SWEEP_DEADLINE_MS / 60_000} minutes.`);
  return "deadline";
}

async function main() {
  const { GITHUB_REPOSITORY: repo, GITHUB_STEP_SUMMARY: out } = process.env;
  if (!repo) {
    console.error("Run in GitHub Actions: GITHUB_REPOSITORY is missing.");
    return 2;
  }
  const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  await sweep({ gh, repo, summary: (text) => out && appendFileSync(out, text) });
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main();
