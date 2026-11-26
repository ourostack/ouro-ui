// When main is red, fresh-main fails on every pull request's CI run and ci-fail-fast then cancels the rest
// of that run to free its runners (scripts/ci-fail-fast.mjs); nothing restarts those runs once main turns
// green, so an auto-merge pull request stays blocked on a cancelled run and the merge queue stays quiet
// (ourostack/ouro-ui#3802, folded into #3797). This logs, as a comment on #3802, what it would re-trigger
// on each red-to-green transition of main: only the pull request runs ci-fail-fast cancelled for that
// cascade (fresh-main failed and finished, every other job cancelled or skipped, none failed for another
// reason), on auto-merge pull requests only, staggered to at most MAX_LIVE re-triggered runs live at once.
// Report-only like main-red-signatures.mjs: it names what it would re-trigger and defer, but re-triggers
// nothing yet, so the coordinator can rule on the log once enough transitions have shown it right.
//
//   node scripts/cascade-retrigger.mjs report
//       after a CI push run on main completes (.github/workflows/main-green.yml): while main just
//       transitioned from red to green, logs the candidate re-trigger plan as one comment on #3802 (once
//       per green sha). Needs gh with GH_TOKEN and GITHUB_REPOSITORY. Always exits 0 (report-only).
import { fileURLToPath } from "node:url";
import { ghApi, mainState } from "./main-green.mjs";
import { postComment, readComments } from "./rerun-guard.mjs";

/** The issue this report-only log is written to: the green-main-does-not-restart-runs report. */
export const ISSUE_NUMBER = 3802;

/** At most this many re-triggered pull request CI runs live (in progress or queued) at once. */
export const MAX_LIVE = 3;

const DECISIVE = (run) => run.status === "completed" && run.conclusion !== "cancelled" && run.conclusion !== "skipped";

/**
 * Whether `runs` (main's CI push runs, newest first, as mainState reads them) show a red-to-green
 * transition: the newest decisive run succeeded, and the one before it did not. False when there is no
 * prior decisive run (main's first-ever green has nothing to transition from) or the newest is not green.
 */
export function transitionedToGreen(runs) {
  const decisive = runs.filter(DECISIVE);
  if (decisive.length < 2) return false;
  return decisive[0].conclusion === "success" && decisive[1].conclusion !== "success";
}

/**
 * Whether a pull request's cancelled CI run was cancelled by the fresh-main cascade: `fresh-main` failed
 * and finished, and no other job of it failed or timed out (the rest read cancelled or skipped, as
 * ci-fail-fast leaves them, or succeeded before the cancel reached it). "not-cancelled" when the run did
 * not end cancelled at all; "other" when it was cancelled for some other reason (no fresh-main failure, or
 * a real failure alongside it); "cascade" otherwise.
 */
export function cascadeVerdict({ run, jobs }) {
  if (run.status !== "completed" || run.conclusion !== "cancelled") return "not-cancelled";
  const freshMain = jobs.find((job) => job.name === "fresh-main");
  if (!freshMain || freshMain.status !== "completed" || freshMain.conclusion !== "failure") return "other";
  const realFailure = jobs.some((job) => job.name !== "fresh-main" && job.status === "completed" && !["cancelled", "skipped", "success"].includes(job.conclusion ?? ""));
  return realFailure ? "other" : "cascade";
}

/**
 * Which of `candidates` (cascade-cancelled auto-merge pull request runs, in some stable order) to
 * re-trigger now, staggered so at most `maxLive` are live at once: `{ retrigger, deferred }`. `liveCount`
 * is how many re-triggered or otherwise live pull request runs already count toward that cap.
 */
export function retriggerPlan({ candidates, liveCount, maxLive = MAX_LIVE }) {
  const room = Math.max(0, maxLive - liveCount);
  return { retrigger: candidates.slice(0, room), deferred: candidates.slice(room) };
}

/** The marker a candidate-plan comment carries, so a second report of the same green sha does not log twice. */
export function candidateMarker(sha) {
  return `<!-- cascade-retrigger: sha ${sha} -->`;
}

/** Whether the candidate plan for this green sha is already logged among `bodies` (#3802's comments). */
export function alreadyLogged(bodies, sha) {
  const marker = candidateMarker(sha);
  return bodies.some((body) => body.includes(marker));
}

/** The comment logging the candidate re-trigger plan for a red-to-green sha. Report-only: it re-triggers nothing. */
export function candidateComment({ state, plan }) {
  const lines = [candidateMarker(state.sha), `Candidate cascade re-trigger plan for ${state.sha.slice(0, 7)} turning green (${state.url}):`, ""];
  if (plan.retrigger.length === 0 && plan.deferred.length === 0) {
    lines.push("- no pull request run was cancelled by the fresh-main cascade.");
  } else {
    for (const candidate of plan.retrigger) lines.push(`- would re-trigger #${candidate.number} (run ${candidate.runId}).`);
    for (const candidate of plan.deferred) lines.push(`- would defer #${candidate.number} (run ${candidate.runId}): already ${MAX_LIVE} live.`);
  }
  lines.push("", "Report-only: this candidate plan re-triggers nothing yet (contributing/ci.md).");
  return lines.join("\n");
}

/** The open, auto-merge-enabled pull requests into main, paginated. Shared with scripts/fail-fast-fresh-main.mjs (#3820). */
export function autoMergePulls(api, repo) {
  const pulls = [];
  for (let page = 1; ; page += 1) {
    const batch = api(`repos/${repo}/pulls?state=open&base=main&per_page=100&page=${page}`);
    pulls.push(...batch.filter((pr) => pr.auto_merge != null));
    if (batch.length < 100) return pulls;
  }
}

/**
 * Reads main's CI push runs and, on a red-to-green transition, logs the candidate cascade re-trigger plan
 * on #3802 once per green sha. `{ posted, result? }`; never throws (fail-open and report-only), so the
 * caller always exits 0.
 */
export async function report({ env = process.env, api = ghApi, readIssueComments = readComments, writeIssueComment = postComment, log = console.log } = {}) {
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GH_TOKEN;
  if (!repo) {
    log("::warning::cascade-retrigger: GITHUB_REPOSITORY is not set; passing (report-only).");
    return { posted: false };
  }
  let runs;
  try {
    runs = api(`repos/${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=20`).workflow_runs;
  } catch (error) {
    log(`::notice::cascade-retrigger: could not read main's CI runs (${error.message}); passing (fail-open).`);
    return { posted: false };
  }
  if (!transitionedToGreen(runs)) {
    log("cascade-retrigger: main did not just turn green; nothing to report.");
    return { posted: false };
  }
  const state = mainState(runs);
  let pulls;
  try {
    pulls = autoMergePulls(api, repo);
  } catch (error) {
    log(`::notice::cascade-retrigger: could not read the open pull requests (${error.message}); failing closed.`);
    pulls = [];
  }
  const candidates = [];
  let liveCount = 0;
  for (const pr of pulls) {
    try {
      const runsForSha = api(`repos/${repo}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=1`).workflow_runs;
      const run = runsForSha[0];
      if (!run) continue;
      if (run.status !== "completed") {
        liveCount += 1;
        continue;
      }
      const jobs = api(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`).jobs;
      if (cascadeVerdict({ run, jobs }) === "cascade") candidates.push({ number: pr.number, runId: run.id });
    } catch (error) {
      log(`::notice::cascade-retrigger: could not read #${pr.number}'s CI run (${error.message}); skipping it.`);
    }
  }
  const plan = retriggerPlan({ candidates, liveCount });
  log(`cascade-retrigger: candidate plan for ${state.sha} would re-trigger ${plan.retrigger.length}, defer ${plan.deferred.length}.`);
  let bodies;
  try {
    bodies = await readIssueComments({ repository: repo, token, issue: ISSUE_NUMBER });
  } catch (error) {
    log(`::notice::cascade-retrigger: issue #${ISSUE_NUMBER} could not be read (${error.message}); not logged.`);
    return { posted: false, result: { plan } };
  }
  if (alreadyLogged(bodies, state.sha)) {
    log(`cascade-retrigger: already logged the plan for ${state.sha}.`);
    return { posted: false, result: { plan } };
  }
  try {
    await writeIssueComment({ repository: repo, token, issue: ISSUE_NUMBER, body: candidateComment({ state, plan }) });
  } catch (error) {
    log(`::warning::cascade-retrigger: could not comment on #${ISSUE_NUMBER} (${error.message}).`);
    return { posted: false, result: { plan } };
  }
  return { posted: true, result: { plan } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command] = process.argv.slice(2);
  if (command === "report") {
    await report(); // report-only: no exit code ever fails this run (contributing/ci.md)
  } else {
    console.error("usage: cascade-retrigger.mjs report");
    process.exit(2);
  }
}
