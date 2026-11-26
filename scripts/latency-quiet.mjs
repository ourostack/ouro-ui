// The calibration probe's quiet median (site/e2e/latency.ts, LATENCY.probeQuiet), measured from CI's own
// runs: the latency shards (`latency (n/3)`, ci.yml's latency-shard) of the last N completed push runs of
// ci.yml on main. Each shard's log names its probe's median beside each control it measured
// (`latency-probe <control>: median <n> ms (quiet …)`). This reads them all, takes each run's median of
// those, and prints the median across the runs: the probe's median on a quiet runner, which probeQuiet is
// set to. Nothing is written.
//
//   node scripts/latency-quiet.mjs [--runs N]   needs GH_TOKEN; GITHUB_REPOSITORY defaults to ourostack/ouro-ui
//
// Job logs come from GitHub's logs endpoint, which redirects to the bytes, as ci-budget.mjs reads them.
import { fileURLToPath } from "node:url";
import { ApiUnavailable, get } from "./ci-budget.mjs";
import { listJobsAsync } from "./run-jobs.mjs";

/** The runs read when --runs is not given. */
export const defaultRuns = 20;

/** The latency shards' job names in ci.yml (`latency (1/3)`), not the aggregate `latency` job that only reports them. */
export function isLatencyShard(name) {
  return /^latency \(\d+\/\d+\)$/.test(name);
}

/** Each probe line a latency shard logs: its control's label (which may hold commas or parentheses) and the probe's median in ms. */
const probeLine = /latency-probe (?<label>.+?): median (?<median>\d+(?:\.\d+)?) ms\b/g;

/** The probe medians a job's log names, in the order it names them. */
export function probeMedians(log) {
  return [...log.matchAll(probeLine)].map((match) => Number(match.groups.median));
}

/** The median of a non-empty list of numbers. */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * One run's quiet reading: the median of every probe median its latency shards' logs name, with how many
 * there were. `median` is null when no log names a probe (a run whose shards did not measure).
 */
export function runQuiet(logs) {
  const probes = logs.flatMap(probeMedians);
  return { probes: probes.length, median: probes.length > 0 ? median(probes) : null };
}

/**
 * The quiet median across runs: the median of their per-run values, rounded to a whole ms, or null when
 * no run has one. Runs with no probe are left out before this is called.
 */
export function quietMedian(perRun) {
  return perRun.length > 0 ? Math.round(median(perRun)) : null;
}

/** The completed push runs of ci.yml on main, newest first: the first `count` of them. */
async function pushRuns(repository, count, token) {
  const runs = [];
  for (let page = 1; runs.length < count; page += 1) {
    const body = await get(`https://api.github.com/repos/${repository}/actions/workflows/ci.yml/runs?event=push&branch=main&status=completed&per_page=100&page=${page}`, token);
    runs.push(...body.workflow_runs);
    if (body.workflow_runs.length === 0 || runs.length >= body.total_count) break;
  }
  return runs.slice(0, count);
}

/** A run's jobs that are latency shards and have completed. */
async function latencyShards(repository, runId, token) {
  const jobs = await listJobsAsync((url) => get(`https://api.github.com/${url}`, token), `repos/${repository}/actions/runs/${runId}`);
  return jobs.filter((job) => isLatencyShard(job.name) && job.status === "completed");
}

/** The text of one job's log. A log GitHub no longer keeps is unreadable and left out; a GitHub that does not answer stops the run. */
async function logText(repository, jobId, token) {
  try {
    return (await get(`https://api.github.com/repos/${repository}/actions/jobs/${jobId}/logs`, token, { raw: true })).toString("utf8");
  } catch (error) {
    if (error instanceof ApiUnavailable) throw error;
    return null;
  }
}

/** The run count from the arguments: `--runs N`, a positive whole number. */
export function runsOf(argv) {
  const index = argv.indexOf("--runs");
  if (index === -1) return defaultRuns;
  const value = argv[index + 1];
  if (!/^[1-9]\d*$/.test(value ?? "")) throw new Error(`--runs takes a whole number of runs, not ${value ?? "nothing"}`);
  return Number(value);
}

/** Reads the runs, prints each run's quiet reading and the median across them, and returns the exit code. */
async function main(argv) {
  const token = process.env.GH_TOKEN;
  if (!token) {
    console.error("Set GH_TOKEN (and GITHUB_REPOSITORY, which defaults to ourostack/ouro-ui).");
    return 2;
  }
  const repository = process.env.GITHUB_REPOSITORY ?? "ourostack/ouro-ui";
  const count = runsOf(argv);
  const runs = await pushRuns(repository, count, token);
  if (runs.length === 0) throw new Error(`${repository} has no completed push runs of ci.yml on main`);
  const first = runs.at(-1).created_at.slice(0, 10);
  const last = runs[0].created_at.slice(0, 10);
  console.log(`latency-quiet: ${repository}, the last ${runs.length} completed push runs of ci.yml on main (created ${first} to ${last})`);
  const perRun = [];
  for (const run of runs) {
    const shards = await latencyShards(repository, run.id, token);
    const logs = [];
    let unreadable = 0;
    for (const shard of shards) {
      const log = await logText(repository, shard.id, token);
      if (log === null) unreadable += 1;
      else logs.push(log);
    }
    const { probes, median: value } = runQuiet(logs);
    const id = `run ${run.id} (#${run.run_number}, ${run.head_sha.slice(0, 8)})`;
    const unread = unreadable > 0 ? `; ${unreadable} shard log(s) no longer kept, left out` : "";
    if (value === null) console.log(`  ${id}: no latency probe in ${shards.length} latency shard(s)${unread}`);
    else {
      perRun.push(value);
      console.log(`  ${id}: median ${value} ms over ${probes} probes in ${shards.length} latency shard(s)${unread}`);
    }
  }
  const quiet = quietMedian(perRun);
  if (quiet === null) {
    console.error("No run named a latency probe, so there is no quiet median.");
    return 1;
  }
  console.log(`quiet median: ${quiet} ms, the median of ${perRun.length} runs' medians (probeQuiet)`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    return 1;
  });
}
