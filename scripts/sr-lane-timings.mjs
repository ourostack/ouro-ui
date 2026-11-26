// What the screen-reader lane costs a pull request (ci.yml's screen-reader job, which calls
// screen-reader-lane.yml): for each pull request given, the lane's wall time, the wall time it adds to the
// run, and the runner minutes its jobs held, macOS apart. The run's other jobs end before the lane
// unless the required ci check waits for it, and the jobs that wait for it (ci, and ci-budget and
// tree-proof after it) are not counted as the run's own time, so the added wall time is how much
// later the run ends than it would without the lane.
//
//   node scripts/sr-lane-timings.mjs <pull request number>...
//
// It needs gh with actions: read in this repository, and reads ci.yml's job graph from this checkout,
// so run it from a checkout of main, or of the pull request's head.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jobGraph } from "./ci-budget.mjs";
import { listJobs } from "./run-jobs.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** The lane's job name in a run: the caller job's id, then the called job's name. */
export const lanePrefix = "screen-reader / ";
/** The lane's caller job and the yield that waits for a runner before it (ci.yml), which are the lane's own time. */
const laneIds = new Set(["screen-reader", "sr-yield"]);

const seconds = (from, to) => (from && to ? Math.max(0, (Date.parse(to) - Date.parse(from)) / 1000) : 0);
const onMac = (job) => (job.labels ?? []).some((label) => /^macos/i.test(label));

/** The ids of every job that waits for `id` in the graph, directly or through another. */
export function dependents(graph, id) {
  const waits = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const node of graph) {
      if (!waits.has(node.id) && node.needs.some((need) => waits.has(need))) {
        waits.add(node.id);
        grew = true;
      }
    }
  }
  waits.delete(id);
  return waits;
}

/**
 * The lane's cost in one run's jobs (the latest attempt's, from the jobs API), with `graph` from ci.yml:
 * whether it ran, its wall time (first job created to last job ended, queues included), each job's
 * queue and run seconds, the seconds its macOS jobs and its other jobs ran, and `addedWallSeconds`:
 * how much later the lane ends than the run's other jobs do, the jobs that wait for the lane (ci,
 * ci-budget, tree-proof) and the lane's own yield left out. That is the wall time the lane adds.
 */
export function laneTimings(jobs, graph) {
  const waiting = dependents(graph, "screen-reader");
  const nodeOf = (job) => graph.find((node) => node.pattern.test(job.name))?.id;
  const finished = jobs.filter((job) => job.completed_at);
  const lane = finished.filter((job) => job.name.startsWith(lanePrefix));
  // The lane's own wait for a runner (sr-yield) is part of the lane's time, not the run's own.
  const own = finished.filter((job) => !job.name.startsWith(lanePrefix) && !laneIds.has(nodeOf(job)) && !waiting.has(nodeOf(job)));
  const laneStart = lane.length > 0 ? Math.min(...lane.map((job) => Date.parse(job.created_at))) : 0;
  const laneEnd = lane.length > 0 ? Math.max(...lane.map((job) => Date.parse(job.completed_at))) : 0;
  const ownEnd = own.length > 0 ? Math.max(...own.map((job) => Date.parse(job.completed_at))) : laneStart;
  const runSeconds = (job) => seconds(job.started_at, job.completed_at);
  return {
    ran: lane.length > 0,
    laneWallSeconds: lane.length > 0 ? (laneEnd - laneStart) / 1000 : 0,
    addedWallSeconds: lane.length > 0 ? Math.max(0, (laneEnd - ownEnd) / 1000) : 0,
    macosRunSeconds: lane.filter(onMac).reduce((total, job) => total + runSeconds(job), 0),
    otherRunSeconds: lane.filter((job) => !onMac(job)).reduce((total, job) => total + runSeconds(job), 0),
    laneJobs: lane.map((job) => ({ name: job.name, macos: onMac(job), queuedSeconds: seconds(job.created_at, job.started_at), runSeconds: runSeconds(job) })),
  };
}

const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const api = (url) => JSON.parse(gh(["api", url]));

const minutes = (value) => (value / 60).toFixed(1);

async function main(numbers) {
  if (numbers.length === 0) {
    console.error("Usage: node scripts/sr-lane-timings.mjs <pull request number>...");
    return 2;
  }
  const repo = gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).trim();
  const graph = jobGraph(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8"));
  console.log("| PR | CI run | lane | lane wall (min) | added wall (min) | macOS run (min) | other runners (min) |");
  console.log("|---|---|---|---|---|---|---|");
  for (const number of numbers) {
    const { head } = api(`repos/${repo}/pulls/${number}`);
    const { workflow_runs: runs } = api(`repos/${repo}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${head.sha}&per_page=5`);
    if (runs.length === 0) {
      console.log(`| #${number} | none | no CI run for ${head.sha.slice(0, 7)} | | | | |`);
      continue;
    }
    const jobs = listJobs(api, `repos/${repo}/actions/runs/${runs[0].id}`, "filter=latest&");
    const timings = laneTimings(jobs, graph);
    const laneRow = timings.ran ? "ran" : "not selected";
    console.log(`| #${number} | ${runs[0].html_url} | ${laneRow} | ${minutes(timings.laneWallSeconds)} | ${minutes(timings.addedWallSeconds)} | ${minutes(timings.macosRunSeconds)} | ${minutes(timings.otherRunSeconds)} |`);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
