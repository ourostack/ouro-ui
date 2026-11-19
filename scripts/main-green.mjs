// Posts the `main green` commit status on the open pull requests into main (.github/workflows/main-green.yml),
// so none merges onto a red main. main is red while its newest completed CI push run failed: a run still in
// progress, or cancelled or skipped, is passed over, and only a success is green. While main is red, a pull
// request that is the fix stays green: labelled red-main-fix (a label needs write access, so any repository's
// pull request may carry it), or, from this repository only, the docs pin's docs/point-at-release branch or a
// `Revert "` title, which the repository's own tools open to heal main.
//
// Usage (CI sets GITHUB_REPOSITORY and GH_TOKEN): node scripts/main-green.mjs [--pr <number>]
// mainState, exempt and statusFor are pure; the CLI reads the runs and pull requests with gh and posts the statuses.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const CONTEXT = "main green";
const FIX_LABEL = "red-main-fix";
const DOCS_PIN_BRANCH = "docs/point-at-release";
const REVERT_PREFIX = 'Revert "';

/** main's state from its CI push runs on main, newest first: `green` only when the newest decisive run succeeded. */
export function mainState(runs) {
  const run = runs.find((candidate) => candidate.status === "completed" && candidate.conclusion !== "cancelled" && candidate.conclusion !== "skipped");
  if (!run) return { green: true, sha: null, url: null };
  return { green: run.conclusion === "success", sha: run.head_sha, url: run.html_url };
}

const labelNames = (pr) => (pr.labels ?? []).map((label) => (typeof label === "string" ? label : label.name));
const fromThisRepository = (pr) => Boolean(pr.head?.repo) && pr.head.repo.full_name === pr.base?.repo?.full_name;

/** Whether the pull request may merge while main is red: the fix, or this repository's docs pin or automatic revert. */
export function exempt(pr) {
  if (labelNames(pr).includes(FIX_LABEL)) return true;
  return fromThisRepository(pr) && (pr.head?.ref === DOCS_PIN_BRANCH || String(pr.title ?? "").startsWith(REVERT_PREFIX));
}

/** The status for a pull request given main's state: { state, description, target_url }. */
export function statusFor(state, pr) {
  const target = state.url ? { target_url: state.url } : {};
  if (state.green) return { state: "success", description: "Main is green.", ...target };
  if (exempt(pr)) return { state: "success", description: "Main is red; this pull request may merge as its fix.", ...target };
  return { state: "failure", description: `Main is red at ${state.sha.slice(0, 7)}: fix main first, or label this red-main-fix if it is the fix.`, ...target };
}

/** One GitHub REST call through gh; a body is sent as JSON. */
export function ghApi(path, { method = "GET", body } = {}) {
  const args = ["api", ...(method === "GET" ? [] : ["-X", method]), path, ...(body === undefined ? [] : ["--input", "-"])];
  const output = execFileSync("gh", args, { encoding: "utf8", input: body === undefined ? undefined : JSON.stringify(body), maxBuffer: 16 << 20 });
  return output.trim() ? JSON.parse(output) : null;
}

function openPulls(api, repo) {
  const pulls = [];
  for (let page = 1; ; page += 1) {
    const batch = api(`repos/${repo}/pulls?state=open&base=main&per_page=100&page=${page}`);
    pulls.push(...batch);
    if (batch.length < 100) return pulls;
  }
}

/**
 * Posts the status on each open pull request into main, or on the one `--pr` names. Returns how many were posted.
 * Throws when GitHub cannot be read, or when a status cannot be posted (after the others are posted).
 */
export function postStatuses({ args = [], env = process.env, api = ghApi, log = console.log } = {}) {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY is not set");
  const flag = args.indexOf("--pr");
  const number = flag === -1 ? null : Number(args[flag + 1]);
  if (flag !== -1 && !Number.isInteger(number)) throw new Error("usage: main-green.mjs [--pr <number>]");
  const state = mainState(api(`repos/${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=20`).workflow_runs);
  const pulls = flag === -1 ? openPulls(api, repo) : [api(`repos/${repo}/pulls/${number}`)];
  const failed = [];
  for (const pr of pulls) {
    const status = statusFor(state, pr);
    try {
      api(`repos/${repo}/statuses/${pr.head.sha}`, { method: "POST", body: { context: CONTEXT, ...status } });
      log(`#${pr.number} ${CONTEXT}: ${status.state} (${status.description})`);
    } catch (error) {
      failed.push(pr.number);
      log(`::error::#${pr.number}: could not post the ${CONTEXT} status: ${error.message}`);
    }
  }
  if (failed.length > 0) throw new Error(`could not post the ${CONTEXT} status on #${failed.join(", #")}`);
  return pulls.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    postStatuses({ args: process.argv.slice(2) });
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
