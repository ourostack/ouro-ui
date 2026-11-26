// ci-fail-fast (scripts/ci-fail-fast.mjs) cancels a pull request's whole CI run once fresh-main fails,
// the same as any other failed job, even though fresh-main failing says nothing about that pull
// request: it means main itself is over a size ceiling (ourostack/ouro-ui#3816) or otherwise red, and
// every pull request's fresh-main fails alike until main is fixed. ci-fail-fast already tolerates a
// failed plan the same way (TOLERATED); fresh-main is not in that list yet (ourostack/ouro-ui#3820).
// This logs, as a comment on #3820, which of the cascade-cancelled runs cascade-retrigger.mjs already
// finds (#3802, folded into #3797) are cascade cases: cascadeVerdict's "cascade" verdict means fresh-main
// was the only job that genuinely failed, and every other job's cancellation was ci-fail-fast's own
// doing, so a candidate watcher that tolerated fresh-main would not have cancelled that run at all.
// Report-only: it changes no job's TOLERATED list, so ci-fail-fast keeps cancelling those runs until
// the coordinator rules on the log.
//
//   node scripts/fail-fast-fresh-main.mjs report
//       after a CI push run on main completes (.github/workflows/main-green.yml): while main just
//       transitioned from red to green, logs which cascade-cancelled auto-merge pull request runs a
//       fresh-main-tolerant watcher would have kept running, as one comment on #3820 (once per green sha).
//       Needs gh with GH_TOKEN and GITHUB_REPOSITORY. Always exits 0 (report-only).
import { fileURLToPath } from "node:url";
import { cascadeVerdict, autoMergePulls, transitionedToGreen } from "./cascade-retrigger.mjs";
import { ghApi, mainState } from "./main-green.mjs";
import { postComment, readComments } from "./rerun-guard.mjs";

/** The issue this report-only log is written to: the fail-fast-ignores-a-failed-fresh-main request. */
export const ISSUE_NUMBER = 3820;

/** The marker a candidate-log comment carries, so a second report of the same green sha does not log twice. */
export function candidateMarker(sha) {
  return `<!-- fail-fast-fresh-main: sha ${sha} -->`;
}

/** Whether the candidate log for this green sha is already posted among `bodies` (#3820's comments). */
export function alreadyLogged(bodies, sha) {
  return bodies.some((body) => body.includes(candidateMarker(sha)));
}

/** The comment logging which cascade-cancelled runs a fresh-main-tolerant watcher would have kept going, for a red-to-green sha. */
export function candidateComment({ state, prevented }) {
  const lines = [candidateMarker(state.sha), `Candidate fail-fast tolerance for ${state.sha.slice(0, 7)} turning green (${state.url}):`, ""];
  if (prevented.length === 0) {
    lines.push("- no pull request run was cancelled by the fresh-main cascade.");
  } else {
    for (const candidate of prevented) lines.push(`- would NOT have cancelled #${candidate.number} (run ${candidate.runId}): fresh-main was the only job that failed.`);
  }
  lines.push("", "Report-only: ci-fail-fast's own TOLERATED list is unchanged, so it still cancels these runs (contributing/ci.md).");
  return lines.join("\n");
}

/**
 * Reads main's CI push runs and, on a red-to-green transition, logs which cascade-cancelled auto-merge
 * pull request runs a fresh-main-tolerant watcher would have kept going, once per green sha, on #3820.
 * A run counts only when cascadeVerdict calls it "cascade": fresh-main failed and every other job that
 * finished was cancelled, skipped or succeeded, so nothing else actually failed. `{ posted, result? }`;
 * never throws (fail-open and report-only), so the caller always exits 0.
 */
export async function report({ env = process.env, api = ghApi, readIssueComments = readComments, writeIssueComment = postComment, log = console.log } = {}) {
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GH_TOKEN;
  if (!repo) {
    log("::warning::fail-fast-fresh-main: GITHUB_REPOSITORY is not set; passing (report-only).");
    return { posted: false };
  }
  let runs;
  try {
    runs = api(`repos/${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=20`).workflow_runs;
  } catch (error) {
    log(`::notice::fail-fast-fresh-main: could not read main's CI runs (${error.message}); passing (fail-open).`);
    return { posted: false };
  }
  if (!transitionedToGreen(runs)) {
    log("fail-fast-fresh-main: main did not just turn green; nothing to report.");
    return { posted: false };
  }
  const state = mainState(runs);
  let pulls;
  try {
    pulls = autoMergePulls(api, repo);
  } catch (error) {
    log(`::notice::fail-fast-fresh-main: could not read the open pull requests (${error.message}); failing closed.`);
    pulls = [];
  }
  const prevented = [];
  for (const pr of pulls) {
    try {
      const runsForSha = api(`repos/${repo}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=1`).workflow_runs;
      const run = runsForSha[0];
      if (!run || run.status !== "completed") continue;
      const jobs = api(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`).jobs;
      if (cascadeVerdict({ run, jobs }) !== "cascade") continue;
      prevented.push({ number: pr.number, runId: run.id });
    } catch (error) {
      log(`::notice::fail-fast-fresh-main: could not read #${pr.number}'s CI run (${error.message}); skipping it.`);
    }
  }
  log(`fail-fast-fresh-main: for ${state.sha}, a fresh-main-tolerant watcher would have kept ${prevented.length} run(s) going.`);
  let bodies;
  try {
    bodies = await readIssueComments({ repository: repo, token, issue: ISSUE_NUMBER });
  } catch (error) {
    log(`::notice::fail-fast-fresh-main: issue #${ISSUE_NUMBER} could not be read (${error.message}); not logged.`);
    return { posted: false, result: { prevented } };
  }
  if (alreadyLogged(bodies, state.sha)) {
    log(`fail-fast-fresh-main: already logged the candidate verdict for ${state.sha}.`);
    return { posted: false, result: { prevented } };
  }
  try {
    await writeIssueComment({ repository: repo, token, issue: ISSUE_NUMBER, body: candidateComment({ state, prevented }) });
  } catch (error) {
    log(`::warning::fail-fast-fresh-main: could not comment on #${ISSUE_NUMBER} (${error.message}).`);
    return { posted: false, result: { prevented } };
  }
  return { posted: true, result: { prevented } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command] = process.argv.slice(2);
  if (command === "report") {
    await report(); // report-only: no exit code ever fails this run (contributing/ci.md)
  } else {
    console.error("usage: fail-fast-fresh-main.mjs report");
    process.exit(2);
  }
}
