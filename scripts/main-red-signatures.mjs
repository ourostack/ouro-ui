// A candidate "passable though red" verdict for main-green (ourostack/ouro-ui#3797), built on filed
// signatures in .github/main-red-signatures.json: an entry (a quarantine.json-shaped test plus the job it
// fails in, an open issue, an owner, and a filed/expires window of at most 24h, as the repeat-red rule
// already judges a cause's freshness) that names every test a red main's failing job shows. Unlike
// .github/quarantine.json, which lets release retry a run once, this never changes what actually merges:
// it only logs, as a comment on #3797, what the gate would decide if this went live, job by job, so the
// coordinator can rule on the log once enough red-main windows have shown it right.
//
//   node scripts/main-red-signatures.mjs check
//       fails when an entry lacks a field, its issue URL, or files a window over 24h
//   node scripts/main-red-signatures.mjs report
//       after a CI push run on main completes (.github/workflows/main-green.yml): reads main's state,
//       and while it is red, logs the candidate verdict as one comment on #3797 (once per sha). Needs gh
//       with GH_TOKEN and GITHUB_REPOSITORY. Always exits 0 (report-only; contributing/ci.md).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ghApi, mainState } from "./main-green.mjs";
import { failedTests, names } from "./quarantine.mjs";
import { postComment, readComments } from "./rerun-guard.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// OURO_MAIN_RED_SIGNATURES_FILE lets the tests hand it a file of their own.
export const signaturesFile = process.env.OURO_MAIN_RED_SIGNATURES_FILE ?? join(root, ".github/main-red-signatures.json");

/** The issue this report-only log is written to: the main-green-gate proposal. */
export const ISSUE_NUMBER = 3797;

const issuePattern = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * What is wrong with the signatures: each needs a project, file, title, job, issue URL and owner (as
 * .github/quarantine.json does), plus a filed and an expires date (ISO 8601), expires after filed and at
 * most 24h later. An entry past its window covers nothing until its owner renews it with a progress note.
 */
export function entryProblems(entries) {
  if (!Array.isArray(entries)) return ["the signatures must be a JSON array of entries"];
  return entries.flatMap((entry, index) => {
    const label = `entry ${index + 1}${typeof entry?.title === "string" ? ` (${entry.title})` : ""}`;
    const problems = [];
    for (const key of ["project", "file", "title", "job", "owner"]) {
      if (typeof entry?.[key] !== "string" || entry[key].trim() === "") problems.push(`${label} has no ${key}`);
    }
    if (typeof entry?.issue !== "string" || !issuePattern.test(entry.issue)) problems.push(`${label} has no issue URL (https://github.com/<owner>/<repo>/issues/<number>)`);
    const filed = Date.parse(entry?.filed);
    const expires = Date.parse(entry?.expires);
    if (!Number.isFinite(filed)) problems.push(`${label} has no filed date (ISO 8601)`);
    if (!Number.isFinite(expires)) problems.push(`${label} has no expires date (ISO 8601)`);
    if (Number.isFinite(filed) && Number.isFinite(expires)) {
      if (expires <= filed) problems.push(`${label} expires before it is filed`);
      else if (expires - filed > MAX_WINDOW_MS) problems.push(`${label} files a window over 24h; renew it with a progress note instead of a longer one`);
    }
    return problems;
  });
}

/** The entries still covering their failure at `now`: filed and not yet expired. */
export function activeEntries(entries, now = new Date()) {
  const time = now instanceof Date ? now.getTime() : Date.parse(now);
  return entries.filter((entry) => {
    const expires = Date.parse(entry.expires);
    return Number.isFinite(expires) && expires > time;
  });
}

/**
 * Whether a job's failure is fully covered by active signatures naming it: every test its log fails
 * names an active entry filed for this job, nothing in the log is unexplained, and the failed count
 * matches exactly (as quarantine.mjs's retryPlan requires of a quarantined job). `{ covered, reasons, tests }`.
 */
export function jobVerdict({ job, log, entries, now = new Date() }) {
  const active = activeEntries(entries, now).filter((entry) => entry.job === job);
  const found = failedTests(log ?? "");
  const reasons = [];
  if (found.tests.length === 0) reasons.push(`${job}: no test failure found in its log`);
  if (found.unexplained.length > 0) reasons.push(`${job}: failed beyond a test: ${found.unexplained.join("; ")}`);
  if (found.tests.length > 0 && found.failed !== found.tests.length) reasons.push(`${job}: reports ${found.failed} failed tests but names ${found.tests.length}`);
  const unlisted = found.tests.filter((test) => !active.some((entry) => names(entry, test)));
  if (unlisted.length > 0) reasons.push(...unlisted.map((test) => `${job}: ${test.project} ${test.file} > ${test.title} is not covered by an active signature`));
  return { covered: reasons.length === 0, reasons, tests: found.tests };
}

/**
 * The candidate verdict for main's red state: `{ passable, verdicts, reason? }`. Fails closed (not
 * passable) when `jobs` is empty or missing: a red main whose failing jobs cannot be read covers nothing,
 * so an unreadable set never reads as passable.
 */
export function passable({ jobs, entries, now = new Date() }) {
  if (!jobs || jobs.length === 0) return { passable: false, verdicts: [], reason: "no failing job could be read; failing closed" };
  const verdicts = jobs.map((job) => ({ job: job.name, ...jobVerdict({ job: job.name, log: job.log, entries, now }) }));
  return { passable: verdicts.every((verdict) => verdict.covered), verdicts };
}

/** The marker a candidate-verdict comment carries, so a second report of the same red sha does not log twice. */
export function candidateMarker(sha) {
  return `<!-- main-red-signatures: sha ${sha} -->`;
}

/** Whether the candidate verdict for this sha is already logged among `bodies` (#3797's comments). */
export function alreadyLogged(bodies, sha) {
  const marker = candidateMarker(sha);
  return bodies.some((body) => body.includes(marker));
}

/** The comment logging the candidate verdict for a red main sha. Report-only: it changes nothing that merges. */
export function candidateComment({ state, result }) {
  const lines = [candidateMarker(state.sha), `Candidate main-red-signatures verdict for ${state.sha.slice(0, 7)} (${state.url}): **${result.passable ? "would pass" : "would still block"}**.`, ""];
  if (result.reason) lines.push(`- ${result.reason}`);
  for (const verdict of result.verdicts) lines.push(`- ${verdict.job}: ${verdict.covered ? "covered" : "not covered"}${verdict.reasons.length > 0 ? ` (${verdict.reasons.join("; ")})` : ""}`);
  lines.push("", "Report-only: this candidate verdict changes nothing that merges (contributing/ci.md).");
  return lines.join("\n");
}

/** A failed job's log, through `gh run view --job --log`; `""` when it cannot be read. */
function defaultJobLog(repo, jobId) {
  const result = spawnSync("gh", ["run", "view", "--repo", repo, "--job", String(jobId), "--log"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : "";
}

/**
 * Reads main's state and, while it is red, logs the candidate verdict on #3797 once per sha. `{ posted,
 * result? }`; never throws (fail-open and report-only), so the caller always exits 0.
 */
export async function report({ env = process.env, api = ghApi, jobLog = defaultJobLog, readIssueComments = readComments, writeIssueComment = postComment, now = new Date(), log = console.log } = {}) {
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GH_TOKEN;
  if (!repo) {
    log("::warning::main-red-signatures: GITHUB_REPOSITORY is not set; passing (report-only).");
    return { posted: false };
  }
  let runs;
  try {
    runs = api(`repos/${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=20`).workflow_runs;
  } catch (error) {
    log(`::notice::main-red-signatures: could not read main's CI runs (${error.message}); passing (fail-open).`);
    return { posted: false };
  }
  const state = mainState(runs);
  if (state.green) {
    log("main-red-signatures: main is green; nothing to report.");
    return { posted: false };
  }
  let entries;
  try {
    entries = JSON.parse(readFileSync(signaturesFile, "utf8"));
  } catch (error) {
    log(`::warning::main-red-signatures: could not read ${signaturesFile} (${error.message}); failing closed.`);
    entries = [];
  }
  const problems = entryProblems(entries);
  if (problems.length > 0) {
    log(`::warning::main-red-signatures: ${problems.join("; ")}; ignoring every entry until this is fixed.`);
    entries = [];
  }
  let jobs;
  try {
    const run = runs.find((candidate) => candidate.head_sha === state.sha);
    const allJobs = api(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`).jobs;
    jobs = allJobs.filter((job) => job.conclusion === "failure").map((job) => ({ name: job.name, log: jobLog(repo, job.id) }));
  } catch (error) {
    log(`::notice::main-red-signatures: could not read the failing jobs (${error.message}); failing closed.`);
    jobs = [];
  }
  const result = passable({ jobs, entries, now });
  log(`main-red-signatures: candidate verdict for ${state.sha} is ${result.passable ? "passable" : "not passable"}.`);
  let bodies;
  try {
    bodies = await readIssueComments({ repository: repo, token, issue: ISSUE_NUMBER });
  } catch (error) {
    log(`::notice::main-red-signatures: issue #${ISSUE_NUMBER} could not be read (${error.message}); not logged.`);
    return { posted: false, result };
  }
  if (alreadyLogged(bodies, state.sha)) {
    log(`main-red-signatures: already logged the verdict for ${state.sha}.`);
    return { posted: false, result };
  }
  try {
    await writeIssueComment({ repository: repo, token, issue: ISSUE_NUMBER, body: candidateComment({ state, result }) });
  } catch (error) {
    log(`::warning::main-red-signatures: could not comment on #${ISSUE_NUMBER} (${error.message}).`);
    return { posted: false, result };
  }
  return { posted: true, result };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command] = process.argv.slice(2);
  if (command === "check") {
    const problems = entryProblems(JSON.parse(readFileSync(signaturesFile, "utf8")));
    for (const problem of problems) console.error(`::error::.github/main-red-signatures.json: ${problem}`);
    process.exit(problems.length > 0 ? 1 : 0);
  } else if (command === "report") {
    await report(); // report-only: no exit code ever fails this run (contributing/ci.md)
  } else {
    console.error("usage: main-red-signatures.mjs check | report");
    process.exit(2);
  }
}
