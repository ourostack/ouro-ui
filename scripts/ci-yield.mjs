// Yield to the merge queue (.github/workflows/ci.yml, the plan job's "Yield to the merge queue"
// step, on a pull request only). The organisation's GitHub-hosted Linux and Windows runners are one
// pool of about 60 jobs at once (the Team plan; 58 to 60 held for over three hours of a busy
// 2026-11-02 afternoon), and a run's jobs take runners in the order they were queued. So a pull
// request pushed while a merge group's run is building took the runners that run was waiting for:
// merge-group jobs waited up to 32 minutes to start (run 41530354782), and a queue entry took 44 to
// 56 minutes though its jobs took at most 11. Before a pull request's run queues its jobs, this
// script waits while a merge group's run of this repository has a job waiting for a Linux or
// Windows runner, so the queue's jobs go first.
//
// It fails open: it starts the run once nothing waits, after DEADLINE_MS, when the API rate limits
// this repository's token or says fewer than RESERVE requests are left, and after ERRORS failed
// reads in a row. It never fails the step. macOS jobs draw on another pool, so they do not count,
// nor does a job queued for less than GRACE_MS, which is a runner being found, not a full pool.
//
// Its request budget: one read of the merge groups' runs, and one of each open run's jobs, every
// POLL_MS, from a token that shares 1,000 requests an hour with every other run of the repository.
// It calls gh with fixed arguments, never through a shell.
//
//   node scripts/ci-yield.mjs   in GitHub Actions: GITHUB_REPOSITORY, and GH_TOKEN with actions: read
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { rateLimited, requestsLeft } from "./ci-fail-fast.mjs";

/** How often it reads the queue: once a minute. */
export const POLL_MS = 60_000;
/** The longest it holds a pull request's run back; then the run starts anyway. */
export const DEADLINE_MS = 20 * 60_000;
/** A job queued for less than this is being given a runner, not waiting for one. */
export const GRACE_MS = 20_000;
/** It starts the run when the API says fewer requests than this are left this hour, for the required checks. */
export const RESERVE = 300;
/** It starts the run after this many failed reads in a row. */
export const ERRORS = 3;
/** Run and job statuses that mean waiting for a runner. */
export const WAITING = ["queued", "waiting", "pending", "requested"];

/** Whether a job runs on macOS, whose runners are a pool of their own. */
const onMac = (job) => (job.labels ?? []).some((label) => /^macos/i.test(label));

/**
 * What waits for a runner in the merge queue's open runs (`{ run, jobs }` each, from the runs and
 * jobs APIs): the jobs past GRACE_MS that wait for a Linux or Windows runner, and a run that has
 * waited past it with no job listed yet. Returns their count and the runs they belong to.
 */
export function waiting(open, now) {
  const runs = [];
  let count = 0;
  for (const { run, jobs } of open) {
    const old = (at) => now - Date.parse(at) >= GRACE_MS;
    const queued = jobs.filter((job) => WAITING.includes(job.status) && !onMac(job) && old(job.created_at)).length;
    const pending = jobs.length === 0 && WAITING.includes(run.status) && old(run.created_at) ? 1 : 0;
    if (queued + pending > 0) runs.push(run.id);
    count += queued + pending;
  }
  return { count, runs };
}

class RateLimit extends Error {}

/** One page through `gh api --include`: its body, after checking the requests left. */
function read(gh, url) {
  const output = gh(["api", "--include", url]);
  const at = output.search(/\r?\n\r?\n/);
  const left = requestsLeft(output.slice(0, at));
  if (left !== null && left < RESERVE) throw new RateLimit(`${left} requests are left this hour`);
  return JSON.parse(output.slice(at).trim());
}

/** The merge queue's open runs of this repository, each with its latest attempt's jobs. */
export function openRuns(gh, repo) {
  const { workflow_runs: runs } = read(gh, `repos/${repo}/actions/runs?event=merge_group&per_page=30`);
  return runs
    .filter((run) => run.status !== "completed")
    .map((run) => {
      const jobs = [];
      for (let page = 1; ; page += 1) {
        const body = read(gh, `repos/${repo}/actions/runs/${run.id}/jobs?per_page=100&page=${page}`);
        jobs.push(...body.jobs);
        if (jobs.length >= body.total_count || body.jobs.length === 0) return { run, jobs };
      }
    });
}

/** The first line of an error's message, for a warning. */
const firstLine = (error) => String(error?.message ?? error).split("\n")[0];

/** Everything a failed gh call said, as ci-fail-fast.mjs reads it. */
const said = (error) => [error?.stdout, error?.stderr, error?.message].filter(Boolean).join("\n");

/**
 * Waits while the merge queue has a job waiting for a runner, reading every POLL_MS, and returns
 * why it let the run start: "clear", "deadline", "rate-limited" or "errors". Never throws. `gh`
 * runs the GitHub CLI with an argument list and returns its output, or throws an error carrying it.
 */
export async function yieldToQueue({ gh, repo, wait = sleep, now = Date.now, log = console.log }) {
  const start = now();
  let failures = 0;
  for (;;) {
    let found = null;
    try {
      found = waiting(openRuns(gh, repo), now());
      failures = 0;
    } catch (error) {
      if (error instanceof RateLimit || rateLimited(said(error))) {
        log(`::warning::Not yielding to the merge queue: the API is rate limiting this repository's runs (${firstLine(error)}), and the required checks need what is left.`);
        return "rate-limited";
      }
      failures += 1;
      if (failures >= ERRORS) {
        log(`::warning::Not yielding to the merge queue: ${ERRORS} reads of its runs failed in a row (${firstLine(error)}).`);
        return "errors";
      }
      log(`::warning::Could not read the merge queue's runs (${firstLine(error)}); trying again.`);
    }
    const minutes = Math.round((now() - start) / 60_000);
    if (found && found.count === 0) {
      log(minutes > 0 ? `The merge queue's jobs have runners, so this run starts after ${minutes} minutes.` : "No merge-queue job is waiting for a runner, so this run starts.");
      return "clear";
    }
    if (now() - start + POLL_MS > DEADLINE_MS) {
      log(`::notice::The merge queue still had jobs waiting for a runner after ${DEADLINE_MS / 60_000} minutes, so this run starts anyway.`);
      return "deadline";
    }
    if (found) log(`${found.count} merge-queue job(s) are waiting for a runner (runs ${found.runs.join(", ")}), so this pull request's run waits for them; reading again in a minute.`);
    await wait(POLL_MS);
  }
}

async function main() {
  const { GITHUB_REPOSITORY: repo } = process.env;
  if (!repo) {
    console.error("Run in GitHub Actions: GITHUB_REPOSITORY is missing.");
    return 0;
  }
  const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  await yieldToQueue({ gh, repo });
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main();
