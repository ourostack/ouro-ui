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
/**
 * How often it reads the jobs. A run's GITHUB_TOKEN may make 1,000 requests an hour in this
 * repository, shared with every other run, so not more often: 240 an hour per pull request run.
 */
export const POLL_MS = 15_000;
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

/**
 * Watches the run until a job fails (then cancels the run), LAST finishes, or the deadline passes.
 * Never throws. `gh` runs the GitHub CLI with an argument list and returns its output.
 */
export async function watch({ gh, repo, id, attempt, wait = sleep, now = Date.now, log = console.log, summary = () => {} }) {
  const run = `repos/${repo}/actions/runs/${id}`;
  const end = now() + DEADLINE_MS;
  while (now() < end) {
    let verdict = { kind: "wait" };
    try {
      const pages = JSON.parse(gh(["api", "--paginate", "--slurp", `${run}/attempts/${attempt}/jobs?per_page=100`]));
      verdict = decide(pages.flatMap((page) => page.jobs), attempt);
    } catch (error) {
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
