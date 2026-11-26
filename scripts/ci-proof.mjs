// Has this push to main's tree already passed CI? (.github/workflows/ci.yml, the plan job's "Has this tree
// already passed?" step, on a push to main only; and release.yml, which passes the proving run to
// scripts/required-ci.sh beside main's own.) Then main's run tests nothing a second time.
//
// Two kinds of run prove a main commit:
//   - the merge queue's run on that very commit (merge_group, or a dispatch on a gh-readonly-queue/main/ branch),
//     passed: the queue tests the commit main then fast-forwards to;
//   - a pull request's run whose job named PREFIX + <tree> passed, where <tree> is the main commit's tree and the
//     run as a whole concluded success. ci.yml's tree-proof job reports that name only when the plan ran the full
//     suite (no test left out by the change's impact, no tier skipped) and every job it waits on passed. The tree
//     is `git rev-parse HEAD^{tree}` of the merge GitHub tested: equal trees are equal files, so the workflow, the
//     tests and the code that passed are the ones on main.
// For the pull request, only the newest run of ci.yml on its head counts, as a reopen or re-run that failed after a
// green run takes the proof back. The pull request is the one GitHub merged as this commit (its merge_commit_sha).
//
// A pull request merges as soon as its required checks pass, while tree-proof, which runs beside ci-budget, may
// still be finishing, so it waits up to `wait` seconds for that run to end. A tree-proof job that names another
// tree ends the wait at once: the pull request tested a main that has moved since.
//
// It fails closed: anything it cannot read, an unfinished run, a red run or a skipped tree-proof job proves
// nothing, and the full suite runs.
//
//   node scripts/ci-proof.mjs <main commit> [--wait <seconds>]
//       in GitHub Actions: GITHUB_REPOSITORY, and GH_TOKEN with actions: read and contents: read. Writes
//       tested=true, proof=<run url> and proof-run=<run id> to $GITHUB_OUTPUT when a run proves the commit, and
//       nothing otherwise; exits 0 either way, unless its arguments are wrong.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { JOBS_PER_PAGE } from "./run-jobs.mjs";

/** The start of the name of ci.yml's tree-proof job; the tree it passed follows. */
export const PREFIX = "Full suite passed on tree ";
/** How often it reads an unfinished pull request run while it waits. */
export const POLL_MS = 15_000;

const queueBranch = (branch) => typeof branch === "string" && branch.startsWith("gh-readonly-queue/main/");

/** Whether a run is the merge queue's own (which tests the very commit main fast-forwards to). */
export const isQueueRun = (run) => run.event === "merge_group" || (run.event === "workflow_dispatch" && queueBranch(run.head_branch));

/**
 * The run that proves main commit `sha`, or null, with the lines that say why. `api` answers
 * tree(sha), mergedHeads(sha) (heads of pull requests merged as sha), runs(headSha) (ci.yml's runs on a
 * commit), jobs(runId) (a run's latest jobs). It throws when GitHub cannot be read; the caller fails closed.
 */
export async function prove(api, sha, { wait = 0, pollMs = POLL_MS, now = () => Date.now(), pause = sleep } = {}) {
  const lines = [];
  const own = await api.runs(sha);
  const queue = own.find((run) => isQueueRun(run) && run.status === "completed" && run.conclusion === "success");
  if (queue) {
    lines.push(`The merge queue's run ${queue.id} passed on ${sha} itself.`);
    return { run: queue, lines };
  }
  const tree = await api.tree(sha);
  const want = PREFIX + tree;
  const heads = (await api.mergedHeads(sha)).filter((head) => head !== sha);
  lines.push(`Main commit ${sha.slice(0, 7)} has tree ${tree}; a pull request's run proves it with a passed job named "${want}".`);
  if (heads.length === 0) lines.push("No pull request was merged as this commit (a direct push?).");
  // One deadline for every head, so the whole wait stays within `wait`.
  const until = now() + wait * 1000;
  for (const head of [sha, ...heads]) {
    for (let first = true; ; first = false) {
      const runs = (head === sha && first ? own : await api.runs(head)).filter((run) => run.event === "pull_request");
      const run = runs.sort((a, b) => b.id - a.id)[0];
      if (!run) {
        if (head !== sha) lines.push(`Head ${head.slice(0, 7)} has no pull request run.`);
        break;
      }
      const where = `Run ${run.id} (the newest pull request run on ${head.slice(0, 7)})`;
      const jobs = await api.jobs(run.id);
      // A job GitHub has not started yet, or skipped, can be listed under its name's unevaluated expression.
      const proofs = jobs.filter((job) => typeof job.name === "string" && job.name.startsWith(PREFIX) && !job.name.includes("${{"));
      const other = proofs.find((job) => job.name !== want);
      if (other) {
        lines.push(`${where} reports tree ${other.name.slice(PREFIX.length)} (${other.conclusion ?? other.status}), not this one: main moved after it ran.`);
        break;
      }
      if (run.status !== "completed") {
        if (now() < until) {
          await pause(pollMs);
          continue;
        }
        lines.push(`${where} is still ${run.status} after ${wait}s: it proves nothing yet.`);
        break;
      }
      const job = proofs.find((entry) => entry.name === want);
      if (run.conclusion !== "success") lines.push(`${where} concluded ${run.conclusion}: it proves nothing.`);
      else if (!job) lines.push(`${where} passed without a tree-proof job: its plan left tests out or skipped a tier.`);
      else if (job.conclusion !== "success") lines.push(`${where}'s tree-proof job ended ${job.conclusion}: the plan left tests out or skipped a tier.`);
      else {
        lines.push(`${where} passed the full suite on this tree: ${run.html_url ?? run.id}`);
        return { run, lines };
      }
      break;
    }
  }
  lines.push("No run proves this tree: everything runs.");
  return { run: null, lines };
}

/** gh with fixed arguments, never through a shell: the API's JSON for `path`, every page of a list. */
export function ghApi(repo, gh = (args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })) {
  const get = (path, ...extra) => JSON.parse(gh(["api", ...extra, `repos/${repo}/${path}`]));
  const pages = (path, key) => {
    const out = gh(["api", "--paginate", "--slurp", `repos/${repo}/${path}`]);
    return JSON.parse(out).flatMap((page) => page[key] ?? []);
  };
  return {
    tree: (sha) => get(`commits/${sha}`).commit.tree.sha,
    mergedHeads: (sha) =>
      get(`commits/${sha}/pulls?per_page=100`)
        .filter((pull) => pull.merged_at && pull.merge_commit_sha === sha)
        .map((pull) => pull.head.sha),
    runs: (sha) => pages(`actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`, "workflow_runs"),
    jobs: (id) => pages(`actions/runs/${id}/jobs?filter=latest&per_page=${JOBS_PER_PAGE}`, "jobs"),
  };
}

async function main(argv) {
  const sha = argv[0];
  const at = argv.indexOf("--wait");
  const wait = at === -1 ? 0 : Number(argv[at + 1]);
  const repo = process.env.GITHUB_REPOSITORY;
  if (!/^[0-9a-f]{40}$/.test(sha ?? "") || !Number.isFinite(wait) || wait < 0 || !repo) {
    console.error("usage: node scripts/ci-proof.mjs <40-character main commit> [--wait <seconds>], with GITHUB_REPOSITORY and GH_TOKEN set");
    return 2;
  }
  let result;
  try {
    result = await prove(ghApi(repo), sha, { wait });
  } catch (error) {
    console.log(`::warning title=Tree proof::Could not read GitHub (${String(error.message ?? error).split("\n")[0]}), so everything runs.`);
    return 0;
  }
  console.log(result.lines.join("\n"));
  if (result.run) {
    const url = result.run.html_url ?? `https://github.com/${repo}/actions/runs/${result.run.id}`;
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tested=true\nproof=${url}\nproof-run=${result.run.id}\n`);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
