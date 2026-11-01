// Fail fast for a pull request's CI (.github/workflows/ci.yml, the fail-fast job). GitHub has no
// switch that stops a run's other jobs when one fails, and each matrix keeps its own off so every
// shard reports, so this job runs beside every other job of a pull_request run: it reads this run
// attempt's jobs every POLL_MS and, once one has failed and finished, cancels the run, so a red job
// frees the runners of the rest rather than when the slowest of them ends.
//
// It waits for the failed job to finish, so that job keeps its failure conclusion, its log and its
// artifacts: a cancel that reaches a job before its last step ends marks it cancelled (the runner's
// StepsRunner), which is also why no job cancels its own run. The jobs the run had not finished
// report cancelled, and ci-budget, a required check, does not run in a cancelled run, so the pull
// request stays blocked until a push or a re-run passes.
//
// Only this attempt's jobs count, so a re-run is not cancelled by the jobs its earlier attempt
// failed or had cancelled. Nor do the jobs whose failure the run tolerates (TOLERATED). It stops
// once LAST, which waits on every other job, has finished: the API lists a job only once its needs
// have finished, so "every listed job finished" alone could end the watch between two of them. It
// never fails the run: a failed call is a warning and the next poll tries again, and it gives up at
// DEADLINE_MS, under its job's time limit. It calls gh with fixed arguments, never through a shell.
//
// Its request budget: the repository's GITHUB_TOKEN requests share 1,000 an hour (the Team plan)
// with every other run, ci-budget's required check among them. So it reads once a minute, one
// request a read (a page of 100 holds every job), 60 an hour per run, plus one cancel; and when the
// API answers 403 or 429, or says fewer than RESERVE requests are left, it stops watching.
//
//   node scripts/ci-fail-fast.mjs   in GitHub Actions: GITHUB_REPOSITORY, GITHUB_RUN_ID,
//                                   GITHUB_RUN_ATTEMPT, and GH_TOKEN with actions: write
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

/** This job's name, which it never counts. */
export const SELF = "fail-fast";
/** The job that waits on every other job: once it has finished, nothing is left to free. */
export const LAST = "ci-budget";
/** Jobs whose failure the run tolerates: when the plan fails, every job that reads it runs everything. */
export const TOLERATED = ["plan"];
/** A finished job with one of these conclusions means the run cannot pass. */
export const FAILED = ["failure", "timed_out", "cancelled"];
/** How often it reads the jobs: once a minute, 60 requests an hour per pull request run. */
export const POLL_MS = 60_000;
/** It stops watching when the API says fewer requests than this are left this hour, for the required checks. */
export const RESERVE = 200;
/** Under the job's timeout-minutes (60), so the job ends by itself rather than timing out. */
export const DEADLINE_MS = 55 * 60_000;

/**
 * What to do about this attempt's jobs as they stand (`{ name, status, conclusion, run_attempt }`
 * from the jobs API): stop watching ("done", LAST has finished, so a failure would free nothing),
 * cancel the run (a counted job failed and finished), or wait.
 * @returns {{ kind: "done" } | { kind: "cancel", failed: string[] } | { kind: "wait" }}
 */
export function decide(jobs, attempt) {
  const current = jobs.filter((job) => job.name !== SELF && (job.run_attempt === undefined || Number(job.run_attempt) === Number(attempt)));
  if (current.some((job) => job.name === LAST && job.status === "completed")) return { kind: "done" };
  const failed = current.filter((job) => !TOLERATED.includes(job.name) && job.status === "completed" && FAILED.includes(job.conclusion ?? ""));
  if (failed.length > 0) return { kind: "cancel", failed: failed.map((job) => job.name).sort() };
  return { kind: "wait" };
}

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

/**
 * Watches the run until a job fails (then cancels the run), LAST finishes, the API rate limits it,
 * or the deadline passes. Never throws. `gh` runs the GitHub CLI with an argument list and returns
 * its output, or throws an error carrying its output and error output.
 */
export async function watch({ gh, repo, id, attempt, wait = sleep, now = Date.now, log = console.log, summary = () => {} }) {
  const run = `repos/${repo}/actions/runs/${id}`;
  const end = now() + DEADLINE_MS;
  while (now() < end) {
    let verdict = { kind: "wait" };
    try {
      verdict = decide(readJobs(gh, `${run}/attempts/${attempt}/jobs?per_page=100`), attempt);
    } catch (error) {
      if (error instanceof RateLimit || rateLimited(said(error))) {
        log(`::warning::Stopped watching: the API is rate limiting this repository's runs (${firstLine(error)}), and the required checks need what is left.`);
        return "rate-limited";
      }
      log(`::warning::Could not read this run's jobs (${firstLine(error)}); trying again.`);
    }
    if (verdict.kind === "done") {
      log(`${LAST} has finished, so nothing is left to cancel.`);
      return "done";
    }
    if (verdict.kind === "cancel") {
      const note = cancelNote(verdict.failed);
      try {
        gh(["api", "-X", "POST", `${run}/cancel`]);
        log(`::notice::${note}`);
        summary(`${note}\n`);
      } catch (error) {
        log(`::warning::${verdict.failed.join(", ")} failed, but cancelling the run did not work (${firstLine(error)}).`);
      }
      return "cancel";
    }
    await wait(POLL_MS);
  }
  log(`::warning::Stopped watching: the run is still going after ${DEADLINE_MS / 60_000} minutes.`);
  return "deadline";
}

async function main() {
  const { GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: id, GITHUB_RUN_ATTEMPT: attempt = "1", GITHUB_STEP_SUMMARY: out } = process.env;
  if (!repo || !id) {
    console.error("Run in GitHub Actions: GITHUB_REPOSITORY and GITHUB_RUN_ID are missing.");
    return 2;
  }
  const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  await watch({ gh, repo, id, attempt, summary: (text) => out && appendFileSync(out, text) });
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main();
