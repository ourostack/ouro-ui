// Whether a push to main's rerun (github.run_attempt > 1) already has its cause on record (ci.yml's
// rerun-guard job). A rerun without a recorded cause gets a ::error:: annotation, a step summary line and a
// comment on #2469 (the infra flake log), asking for the cause: a comment that names this run (its id, as a
// number or inside its URL) alongside a line that files a signature, as #2469's existing comments already
// write ("Signature:", case-insensitive, with or without bold). One comment per run and attempt: a marker in
// the comment's own body stops a second run of this job from commenting again.
//
// Report-only (contributing/ci.md): this always exits 0, whatever it finds, so it joins no required check
// yet. Fail-open: an unreadable issue is not a missing cause, so it passes with a note.
//
//   node scripts/rerun-guard.mjs   needs GH_TOKEN, GITHUB_REPOSITORY, RUN_ID, RUN_ATTEMPT, RUN_URL.
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The issue this guard reads and comments on: the infra flake log. */
export const ISSUE_NUMBER = 2469;

/** A line that files a signature, as #2469's existing comments already do: "Signature:", bold or not, case-insensitive. */
const SIGNATURE_LINE_RE = /^\s*\**signature:\**/im;

/** Whether `body` names `runId`: the bare number, word-bounded (so 123 does not match inside 1234), or inside a run URL. */
export function mentionsRun(body, runId) {
  return new RegExp(`(^|[^0-9])${runId}([^0-9]|$)`).test(body);
}

/** Whether one of `bodies` (comment text, oldest first or not, order does not matter) both names `runId` and files a signature. */
export function hasFiledCause(bodies, runId) {
  return bodies.some((body) => mentionsRun(body, runId) && SIGNATURE_LINE_RE.test(body));
}

/** The marker rerun-guard's own comment carries, so a second run of this job for the same run and attempt does not comment twice. */
export function guardMarker(runId, attempt) {
  return `<!-- rerun-guard: run ${runId} attempt ${attempt} -->`;
}

/** Whether rerun-guard already commented for this exact run and attempt. */
export function alreadyFiled(bodies, runId, attempt) {
  const marker = guardMarker(runId, attempt);
  return bodies.some((body) => body.includes(marker));
}

/** The comment rerun-guard files on #2469 when this rerun has no cause on record yet. */
export function guardComment({ runId, attempt, runUrl }) {
  return [
    guardMarker(runId, attempt),
    `Rerun without a recorded cause: run ${runId} (attempt ${attempt}) on a push to main: ${runUrl}`,
    "",
    'File this run\'s signature here (a line starting `Signature:`, naming this run) before the next rerun.',
  ].join("\n");
}

/** Every comment's body on `issue` (paginated, 100 at a time, GitHub's own order). Throws when a page cannot be read. */
export async function readComments({ fetch = globalThis.fetch, repository, token, issue }) {
  const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const bodies = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(`https://api.github.com/repos/${repository}/issues/${issue}/comments?per_page=100&page=${page}`, { headers });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    const batch = await response.json();
    bodies.push(...batch.map((comment) => comment.body ?? ""));
    if (batch.length < 100) return bodies;
  }
}

/** Posts `body` as a comment on `issue`. Throws when it cannot be posted. */
export async function postComment({ fetch = globalThis.fetch, repository, token, issue, body }) {
  const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", authorization: `Bearer ${token}`, "content-type": "application/json" };
  const response = await fetch(`https://api.github.com/repos/${repository}/issues/${issue}/comments`, { method: "POST", headers, body: JSON.stringify({ body }) });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
}

/**
 * This run and attempt's verdict against `bodies` (issue #2469's comments): "first-attempt" when there is
 * nothing to check (attempt 1), "caused" when a comment already names this run alongside a signature, or
 * "uncaused" (with the comment rerun-guard should file, `null` when it already has) otherwise.
 */
export function verdict({ runId, attempt, runUrl, bodies }) {
  if (Number(attempt) <= 1) return { status: "first-attempt" };
  if (hasFiledCause(bodies, runId)) return { status: "caused" };
  return { status: "uncaused", comment: alreadyFiled(bodies, runId, attempt) ? null : guardComment({ runId, attempt, runUrl }) };
}

async function main() {
  const { RUN_ID: runId, RUN_ATTEMPT: attempt, RUN_URL: runUrl, GITHUB_REPOSITORY: repository, GH_TOKEN: token } = process.env;
  const summary = (line) => {
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  };
  if (!runId || !attempt || !runUrl || !repository) {
    console.log("::warning::rerun-guard: RUN_ID, RUN_ATTEMPT, RUN_URL and GITHUB_REPOSITORY are all needed; passing (report-only).");
    return 0;
  }
  let bodies;
  try {
    bodies = await readComments({ repository, token, issue: ISSUE_NUMBER });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::notice::rerun-guard: issue #${ISSUE_NUMBER} could not be read (${message}); passing (fail-open).`);
    return 0;
  }
  const result = verdict({ runId, attempt, runUrl, bodies });
  if (result.status === "first-attempt") {
    console.log(`rerun-guard: attempt ${attempt} is this run's first; nothing to check.`);
    return 0;
  }
  if (result.status === "caused") {
    console.log(`rerun-guard: run ${runId} (attempt ${attempt}) has a signature on #${ISSUE_NUMBER}.`);
    summary(`rerun-guard: run ${runId} (attempt ${attempt}) has a signature on #${ISSUE_NUMBER}.`);
    return 0;
  }
  console.log(`::error::rerun-guard: run ${runId} (attempt ${attempt}) reruns without a recorded cause. File this run's signature on #${ISSUE_NUMBER} (a line starting "Signature:" naming this run).`);
  summary(`**Rerun without a recorded cause**: run ${runId} (attempt ${attempt}) on a push to main.\n\nFile this run's signature on #${ISSUE_NUMBER} before the next rerun. (Report-only for now: contributing/ci.md.)`);
  if (result.comment === null) {
    console.log(`rerun-guard: already commented on #${ISSUE_NUMBER} for run ${runId} attempt ${attempt}.`);
    return 0;
  }
  try {
    await postComment({ repository, token, issue: ISSUE_NUMBER, body: result.comment });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning::rerun-guard: could not comment on #${ISSUE_NUMBER} (${message}).`);
  }
  return 0; // report-only: never fails the run (contributing/ci.md)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main();
