// A candidate "report, not fail" verdict for fresh-main's size gate (scripts/size-budget.mjs, judged with
// scripts/size-gate.mjs's judgeSizes), folded into the #3797 / #3802 gate work (ourostack/ouro-ui#3816): a
// red-main-fix pull request can deadlock behind a base already over a size ceiling, because the red-main-fix
// label exempts main-green's own status (scripts/main-green.mjs) but not fresh-main's size gate, which still
// fails a pull request whose base is over a ceiling even when the pull request itself adds no bytes (#3798
// blocked on #3789 while #3804, the ceiling's own fix, needed #3798's merge group to pass first). This never
// loosens a ceiling, and it never changes what fresh-main actually decides: it only logs, as a comment on
// #3816, which of a red-main-fix pull request's "still over its ceiling: its base was over too" failures
// would read as report-only under the candidate rule (the pull request's own growth is zero or less), so the
// coordinator can rule on the log once enough sightings have shown it right.
//
//   node scripts/ceiling-fix-exempt.mjs report
//       after a CI push run on main completes (.github/workflows/main-green.yml): for each open,
//       red-main-fix-labelled pull request whose latest completed CI run failed its fresh-main job, reads
//       that job's log for a size-gate "its base was over too" failure and logs the candidate verdict as one
//       comment per pull request's head sha on #3816 (once per sha). Needs gh with GH_TOKEN and
//       GITHUB_REPOSITORY. Always exits 0 (report-only; contributing/ci.md).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ghApi } from "./main-green.mjs";
import { postComment, readComments } from "./rerun-guard.mjs";
import { listJobs } from "./run-jobs.mjs";

/** The issue this report-only log is written to: the ceiling-fix-deadlock proposal. */
export const ISSUE_NUMBER = 3816;

/** The label main-green.mjs already exempts its own status for. */
const FIX_LABEL = "red-main-fix";

/**
 * A size-gate "its base was over too" failure line (scripts/size-gate.mjs's judgeSizes, printed by
 * scripts/size-budget.mjs as `css-size-gate ${line}`), or null when `line` is not that shape. Never matches
 * the "tips it over" failure (the base was still under its ceiling): that one is this pull request's own
 * growth, never a candidate for exemption.
 */
export function parseBaseOverFailure(line) {
  const match = /^css-size-gate (.+): (\d+) bytes, (\d+) (more|less) than its base's \d+(?: \([^)]*\))?, within the \d+ a pull request may add, but still over its ceiling of (\d+): its base was over too\./.exec(
    line.trim(),
  );
  if (!match) return null;
  const [, name, bytes, amount, direction, ceiling] = match;
  return { name, bytes: Number(bytes), grew: direction === "more" ? Number(amount) : -Number(amount), ceiling: Number(ceiling) };
}

/**
 * The candidate verdict for one base-over failure line: `{ ...parsed, verdict: "report" }` when the pull
 * request carries red-main-fix and its own growth is zero or less (it adds no bytes, or shrinks it), so the
 * candidate rule would report rather than fail it; otherwise null (not this failure shape, real growth, or
 * no red-main-fix label, so the real gate's failure stands unexempted).
 */
export function exemptCandidate({ line, labels }) {
  const parsed = parseBaseOverFailure(line);
  if (!parsed || parsed.grew > 0 || !labels.includes(FIX_LABEL)) return null;
  return { ...parsed, verdict: "report" };
}

/**
 * The candidate verdict across every base-over failure line fresh-main's log shows: `{ exemptions, allExempt
 * }`. `allExempt` is true only when at least one such failure was found and every one of them is a candidate
 * for exemption (so, under the candidate rule, the size gate would report this pull request rather than
 * fail it) — never true for an empty set, so a job with no base-over failure named is never read as exempt.
 */
export function candidateVerdict({ lines, labels }) {
  const found = lines.filter((line) => parseBaseOverFailure(line));
  const exemptions = found.map((line) => ({ line, exempt: exemptCandidate({ line, labels }) }));
  return { exemptions, allExempt: exemptions.length > 0 && exemptions.every((entry) => entry.exempt) };
}

/** The marker a candidate-verdict comment carries, so a second report of the same pull request sha does not log twice. */
export function candidateMarker(number, sha) {
  return `<!-- ceiling-fix-exempt: pr ${number} sha ${sha} -->`;
}

/** Whether the candidate verdict for this pull request's sha is already logged among `bodies` (#3816's comments). */
export function alreadyLogged(bodies, number, sha) {
  const marker = candidateMarker(number, sha);
  return bodies.some((body) => body.includes(marker));
}

/** The comment logging a red-main-fix pull request's candidate verdict. Report-only: it changes nothing that merges. */
export function candidateComment({ number, sha, url, verdict }) {
  const lines = [
    candidateMarker(number, sha),
    `Candidate ceiling-fix-exempt verdict for #${number} at ${sha.slice(0, 7)} (${url}): **${verdict.allExempt ? "would report, not fail" : "would still fail"}**.`,
    "",
  ];
  for (const { line, exempt } of verdict.exemptions) lines.push(`- ${line.replace(/^css-size-gate /, "")}: ${exempt ? "exempt (red-main-fix, adds no bytes)" : "not exempt"}`);
  lines.push("", "Report-only: this candidate verdict changes nothing that merges (contributing/ci.md).");
  return lines.join("\n");
}

/** A failed job's log, through `gh run view --job --log`; `""` when it cannot be read. */
function defaultJobLog(repo, jobId) {
  const result = spawnSync("gh", ["run", "view", "--repo", repo, "--job", String(jobId), "--log"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : "";
}

/** The open pull requests into main carrying the red-main-fix label, paginated. */
function redMainFixPulls(api, repo) {
  const pulls = [];
  for (let page = 1; ; page += 1) {
    const batch = api(`repos/${repo}/pulls?state=open&base=main&per_page=100&page=${page}`);
    pulls.push(...batch.filter((pr) => (pr.labels ?? []).some((label) => (typeof label === "string" ? label : label.name) === FIX_LABEL)));
    if (batch.length < 100) return pulls;
  }
}

/**
 * For each open, red-main-fix-labelled pull request whose latest completed CI run failed its fresh-main job
 * on a size-gate "its base was over too" failure, logs the candidate verdict on #3816 once per pull request
 * sha. `{ posted }`: how many new comments were logged; never throws (fail-open and report-only), so the
 * caller always exits 0.
 */
export async function report({ env = process.env, api = ghApi, jobLog = defaultJobLog, readIssueComments = readComments, writeIssueComment = postComment, log = console.log } = {}) {
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GH_TOKEN;
  if (!repo) {
    log("::warning::ceiling-fix-exempt: GITHUB_REPOSITORY is not set; passing (report-only).");
    return { posted: 0 };
  }
  let pulls;
  try {
    pulls = redMainFixPulls(api, repo);
  } catch (error) {
    log(`::notice::ceiling-fix-exempt: could not read the open pull requests (${error.message}); failing closed.`);
    pulls = [];
  }
  let bodies;
  try {
    bodies = await readIssueComments({ repository: repo, token, issue: ISSUE_NUMBER });
  } catch (error) {
    log(`::notice::ceiling-fix-exempt: issue #${ISSUE_NUMBER} could not be read (${error.message}); not logged.`);
    return { posted: 0 };
  }
  let posted = 0;
  for (const pr of pulls) {
    try {
      const runs = api(`repos/${repo}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=1`).workflow_runs;
      const run = runs[0];
      if (!run || run.status !== "completed") continue;
      const jobs = listJobs(api, `repos/${repo}/actions/runs/${run.id}`);
      const freshMain = jobs.find((job) => job.name === "fresh-main");
      if (!freshMain || freshMain.conclusion !== "failure") continue;
      const lines = jobLog(repo, freshMain.id)
        .split("\n")
        .map((line) => line.slice(Math.max(0, line.indexOf("css-size-gate "))));
      const labels = (pr.labels ?? []).map((label) => (typeof label === "string" ? label : label.name));
      const verdict = candidateVerdict({ lines, labels });
      if (verdict.exemptions.length === 0) continue;
      if (alreadyLogged(bodies, pr.number, pr.head.sha)) {
        log(`ceiling-fix-exempt: already logged the verdict for #${pr.number} at ${pr.head.sha}.`);
        continue;
      }
      await writeIssueComment({ repository: repo, token, issue: ISSUE_NUMBER, body: candidateComment({ number: pr.number, sha: pr.head.sha, url: run.html_url, verdict }) });
      posted += 1;
    } catch (error) {
      log(`::notice::ceiling-fix-exempt: could not read #${pr.number}'s fresh-main result (${error.message}); skipping it.`);
    }
  }
  log(`ceiling-fix-exempt: logged ${posted} candidate verdict(s).`);
  return { posted };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command] = process.argv.slice(2);
  if (command === "report") {
    await report(); // report-only: no exit code ever fails this run (contributing/ci.md)
  } else {
    console.error("usage: ceiling-fix-exempt.mjs report");
    process.exit(2);
  }
}
