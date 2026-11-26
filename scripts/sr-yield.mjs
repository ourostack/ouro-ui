// Yield to main's screen-reader lane (.github/workflows/ci.yml, the sr-yield job, which runs before a
// pull request's screen-reader job calls screen-reader-lane.yml). The lane's jobs that run on macOS draw
// on the organisation's five macOS runners, and main's push runs, nightly runs and release
// dispatches take one or two each (VoiceOver on macos-26, and macos-15 nightly). So while any
// of those runs has a macOS job queued or running, a pull request's lane waits, so its specs take
// the runners after them. Like scripts/ci-yield.mjs, it reads once a minute, starts the lane at a
// deadline, and fails open: it starts the lane when nothing waits, after DEADLINE_MS, when the API
// rate limits this repository's token or says fewer than RESERVE requests are left, and after ERRORS
// failed reads in a row. It never fails its step.
//
//   node scripts/sr-yield.mjs   in GitHub Actions: GITHUB_REPOSITORY, and GH_TOKEN with actions: read
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { DEADLINE_MS, ERRORS, POLL_MS, RateLimit, read, WAITING } from "./ci-yield.mjs";
import { rateLimited } from "./ci-fail-fast.mjs";
import { listJobs } from "./run-jobs.mjs";

/** The lane's workflow file: its runs of every event, a push to main and a release's dispatch alike. */
export const lane = "screen-reader.yml";

/** Job statuses that hold a macOS runner or wait for one. */
const busy = ["in_progress", ...WAITING];

/** Whether a job runs on macOS, whose runners are a pool of their own. */
const onMac = (job) => (job.labels ?? []).some((label) => /^macos/i.test(label));

/**
 * What holds or waits for a macOS runner among the lane's open runs (`{ run, jobs }` each): every
 * macOS job queued or running, and a run still queued with no job listed yet, which the lane's
 * macOS jobs would make. Returns their count and the runs they belong to.
 */
export function laneWaiting(open) {
  const runs = [];
  let count = 0;
  for (const { run, jobs } of open) {
    const macos = jobs.filter((job) => busy.includes(job.status) && onMac(job)).length;
    const unlisted = jobs.length === 0 && WAITING.includes(run.status) ? 1 : 0;
    if (macos + unlisted > 0) runs.push(run.id);
    count += macos + unlisted;
  }
  return { count, runs };
}

/** The lane's runs that have not completed, each with its jobs. */
export function openLaneRuns(gh, repo) {
  const { workflow_runs: runs } = read(gh, `repos/${repo}/actions/workflows/${lane}/runs?per_page=20`);
  return runs.filter((run) => run.status !== "completed").map((run) => ({ run, jobs: listJobs((url) => read(gh, url), `repos/${repo}/actions/runs/${run.id}`) }));
}

/** The first line of an error's message, for a warning. */
const firstLine = (error) => String(error?.message ?? error).split("\n")[0];

/** Everything a failed gh call said, as ci-fail-fast.mjs reads it. */
const said = (error) => [error?.stdout, error?.stderr, error?.message].filter(Boolean).join("\n");

/**
 * Waits while the lane has a macOS job queued or running, reading every POLL_MS, and returns why it
 * let the lane start: "clear", "deadline", "rate-limited" or "errors". Never throws. `gh` runs the
 * GitHub CLI with an argument list and returns its output, or throws an error carrying it.
 */
export async function yieldToLane({ gh, repo, wait = sleep, now = Date.now, log = console.log }) {
  const start = now();
  let failures = 0;
  for (;;) {
    let found = null;
    try {
      found = laneWaiting(openLaneRuns(gh, repo));
      failures = 0;
    } catch (error) {
      if (error instanceof RateLimit || rateLimited(said(error))) {
        log(`::warning::Not yielding to main's screen-reader lane: the API is rate limiting this repository's runs (${firstLine(error)}), and the required checks need what is left.`);
        return "rate-limited";
      }
      failures += 1;
      if (failures >= ERRORS) {
        log(`::warning::Not yielding to main's screen-reader lane: ${ERRORS} reads of its runs failed in a row (${firstLine(error)}).`);
        return "errors";
      }
      log(`::warning::Could not read the screen-reader lane's runs (${firstLine(error)}); trying again.`);
    }
    const minutes = Math.round((now() - start) / 60_000);
    if (found && found.count === 0) {
      log(minutes > 0 ? `The macOS runners the screen-reader lane needs are free, so this pull request's lane starts after ${minutes} minutes.` : "No screen-reader job holds or waits for a macOS runner, so this pull request's lane starts.");
      return "clear";
    }
    if (now() - start + POLL_MS > DEADLINE_MS) {
      log(`::notice::The screen-reader lane still had jobs on the macOS runners after ${DEADLINE_MS / 60_000} minutes, so this pull request's lane starts anyway.`);
      return "deadline";
    }
    if (found) log(`${found.count} screen-reader job(s) hold or wait for a macOS runner (runs ${found.runs.join(", ")}), so this pull request's lane waits; reading again in a minute.`);
    await wait(POLL_MS);
  }
}

async function main() {
  const repo = process.env["GITHUB_REPOSITORY"];
  if (!repo) {
    console.error("Run in GitHub Actions: GITHUB_REPOSITORY is missing.");
    return 0;
  }
  const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  await yieldToLane({ gh, repo });
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main();
