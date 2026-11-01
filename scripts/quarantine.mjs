// The quarantine: tests known to fail now and then (.github/quarantine.json), each with the open
// issue that tracks it and an owner. Release and its rehearsal, and nothing else, retry a CI run's
// failed jobs once when every check they judge failed only because of quarantined tests: each
// failed job either failed in one step only, a test step, whose Vitest run names only listed tests
// (and the failed count it reports is exactly those), or is a gate (ci, install (variant, preset))
// whose failing step only read the result of such jobs, none of them skipped, or is a job skipped
// because a job it needs failed so. Any other failure, a listed test without an open issue, a run
// already attempted more than once, or a second failure, is not retried, so the release still
// stops on it. Each retry is written to the step summary and the log, and commented on the entry's
// issue, once its rerun has started; Release repeats its rehearsal's retries in its own summary.
// An entry whose issue is closed is stale: a warning asks to remove it.
//
//   node scripts/quarantine.mjs check
//       fails when an entry lacks its test (project, file, title), its issue URL or its owner
//   node scripts/quarantine.mjs retry [--also <check>]... <run id>...
//       after scripts/required-ci.sh failed on these runs: exits 0 once it has started the retry
//       (scripts/required-ci.sh then waits for it and judges again), 1 when nothing may be retried.
//       Needs gh with GH_TOKEN and GITHUB_REPOSITORY.
//   node scripts/quarantine.mjs plan [--also <check>]... <run id>...
//       says what retry would do for these runs, and does nothing
//   node scripts/quarantine.mjs stale
//       warns of each entry whose issue is closed (or cannot be read); never fails
//   node scripts/quarantine.mjs rehearsed <run id>
//       repeats, in the log and the step summary, the retries a rehearsal run recorded
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { jobGraph } from "./ci-budget.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const quarantineFile = join(root, ".github/quarantine.json");

const issuePattern = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/;

/** What is wrong with the quarantine's entries: each needs a project, a file, a title, an issue URL and an owner. */
export function entryProblems(entries) {
  if (!Array.isArray(entries)) return ["the quarantine must be a JSON array of entries"];
  return entries.flatMap((entry, index) => {
    const label = `entry ${index + 1}${typeof entry?.title === "string" ? ` (${entry.title})` : ""}`;
    const problems = [];
    for (const key of ["project", "file", "title", "owner"]) {
      if (typeof entry?.[key] !== "string" || entry[key].trim() === "") problems.push(`${label} has no ${key}`);
    }
    if (typeof entry?.issue !== "string" || !issuePattern.test(entry.issue)) problems.push(`${label} has no issue URL (https://github.com/<owner>/<repo>/issues/<number>)`);
    return problems;
  });
}

/** The Vitest test a `FAIL` line names: `{ project, file, title }`, or undefined for a file-level failure. */
const failLine = /^\s*FAIL\s+(\S+) \((\w+)\)\s+(\S+\.[cm]?[jt]sx?) > (.+?)\s*$/;

// eslint-disable-next-line no-control-regex -- strips the colours in a log, as escapes or as gh prints them (^[[31m)
const colours = /\x1b\[[0-9;]*m|\^\[\[[0-9;]*m/g;

/** A job log line's text, without the job and step columns of `gh run view --log` and the timestamp. */
const text = (line) =>
  line
    .replace(colours, "")
    .replace(/^[^\t]*\t[^\t]*\t/, "")
    .replace(/^\uFEFF?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, "");

/**
 * The failed tests a job's log shows: `{ tests: [{ project, file, title }], failed, unexplained }`,
 * where `failed` adds up Vitest's "Tests  n failed" summaries, and `unexplained` lists what fails
 * without naming a test (a file that did not load, an unhandled error).
 */
export function failedTests(log) {
  const tests = new Map();
  const unexplained = [];
  let failed = 0;
  for (const line of log.split("\n").map(text)) {
    const match = failLine.exec(line);
    if (match) tests.set(`${match[1]}\t${match[3]}\t${match[4]}`, { project: match[1], file: match[3], title: match[4] });
    else if (/^\s*FAIL\s/.test(line)) unexplained.push(line.trim());
    const summary = /^\s*Tests\s+(\d+) failed\b/.exec(line);
    if (summary) failed += Number(summary[1]);
    if (/^\s*Errors\s+\d+ errors?\b/.test(line)) unexplained.push(line.trim());
  }
  return { tests: [...tests.values()], failed, unexplained };
}

/**
 * Whether a quarantine entry names this test: the same project and title, and the same file, or
 * the copy an installed app runs (registry/ouro/<path> installs to src/<path>).
 */
export function names(entry, test) {
  if (entry.project !== test.project || entry.title !== test.title) return false;
  if (entry.file === test.file) return true;
  return entry.file.startsWith("registry/ouro/") && test.file === `src/${entry.file.slice("registry/ouro/".length)}`;
}

/** Whether a check passed in one of its jobs, as scripts/required-ci.sh judges it. */
const passes = (context, conclusions) => conclusions.some((conclusion) => conclusion === "success" || (conclusion === "skipped" && (context === "install-latest" || context === "install-github")));

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The text of a job's step of this name in a workflow's job block: its `name:`, or the name GitHub
 * gives a step without one, "Run " and its script's first line, expressions expanded.
 */
export function stepBlock(block, name) {
  const steps = block.split(/\n(?= {6}- )/).filter((step) => /^ {6}- /.test(step));
  return (
    steps.find((step) => {
      const named = step.match(/^ {6}(?:- | {2})name: (.+)$/m)?.[1];
      if (named !== undefined) return named === name;
      const script = step.match(/^ {6}(?:- | {2})run: (.*)$/m)?.[1];
      const first = script === "|" ? step.split(/^ {6}(?:- | {2})run: \|\n/m)[1]?.split("\n")[0].trim() : script?.trim();
      if (!first) return false;
      const pattern = `Run ${first}`.split(/(\$\{\{[^}]*\}\})/).map((part) => (/^\$\{\{/.test(part) ? ".+" : escape(part))).join("");
      return new RegExp(`^${pattern}$`).test(name);
    }) ?? ""
  );
}

/** Whether a step runs tests: Vitest, directly or through the impact plan, or the install test. */
const runsTests = (step) => /\bvitest\b|scripts\/install-test\.sh/.test(step.replace(/^ {6}(?:- | {2})name: .*$/m, ""));

/** A job's block in a workflow's text. */
const jobBlock = (workflow, id) => workflow.split("\njobs:\n")[1]?.split(/\n(?= {2}[\w-]+:\n)/).find((candidate) => candidate.startsWith(`  ${id}:`));

/**
 * Whether the runs' failures may be retried once: `{ retry, problems, retried }`.
 *
 * runs: [{ id, attempt, workflow (its text), jobs: [{ id, name, conclusion, url, failedSteps, log }] }]
 * contexts: the checks the release judges (main's rules', and --also's). entries: the quarantine,
 * each with `open` (its issue's state). `retried` lists each quarantined failure as
 * `{ entry, test, run, job, url }`.
 */
export function retryPlan({ runs, contexts, entries }) {
  const problems = [];
  const retried = [];
  const failing = contexts.filter((context) => !passes(context, runs.flatMap((run) => run.jobs.filter((job) => job.name === context).map((job) => job.conclusion))));
  if (failing.length === 0) return { retry: false, problems: ["no check failed"], retried };
  // A job is explained when its failure is quarantined tests alone, or a gate on such jobs.
  const explained = new Map();
  const explain = (run, job, graph, seen = new Set()) => {
    const key = `${run.id}/${job.id}`;
    if (explained.has(key)) return explained.get(key);
    if (seen.has(key)) return false;
    seen.add(key);
    let ok = false;
    const found = failedTests(job.log ?? "");
    const node = graph.find((candidate) => candidate.pattern.test(job.name) || candidate.template === job.name);
    // The failed instances, in this run, of the jobs with these ids, each of which must be explained.
    const upstreamExplained = (ids, { gate = false } = {}) => {
      const upstream = run.jobs.filter((other) => graph.some((candidate) => ids.has(candidate.id) && (candidate.pattern.test(other.name) || candidate.template === other.name)));
      // A gate fails on a skipped job it reads as surely as on a failed one, and no test explains that.
      const skipped = gate ? upstream.filter((other) => other.conclusion === "skipped") : [];
      if (skipped.length > 0) {
        problems.push(...skipped.map((other) => `${job.name} (run ${run.id}) read ${other.name}, which was skipped`));
        return false;
      }
      const failedUpstream = upstream.filter((other) => other.conclusion !== "success" && other.conclusion !== "skipped");
      if (failedUpstream.length === 0) problems.push(`${job.name} (run ${run.id}) is ${job.conclusion}, but no job it needs failed`);
      return failedUpstream.length > 0 && failedUpstream.map((other) => explain(run, other, graph, seen)).every(Boolean);
    };
    if (job.conclusion === "skipped" && node && node.needs.length > 0) {
      // Skipped because a job it needs failed: a rerun of the failed jobs runs it again too.
      ok = upstreamExplained(new Set(node.needs));
    } else if (job.conclusion !== "failure") {
      problems.push(`${job.name} (run ${run.id}) is ${job.conclusion || "not finished"}, not a test failure`);
    } else if (found.tests.length > 0) {
      const block = node ? jobBlock(run.workflow, node.id) : undefined;
      const step = block && job.failedSteps.length === 1 ? stepBlock(block, job.failedSteps[0]) : "";
      const unlisted = found.tests.filter((test) => !entries.some((entry) => names(entry, test)));
      const closed = found.tests.filter((test) => entries.some((entry) => names(entry, test) && !entry.open));
      if (job.failedSteps.length !== 1) problems.push(`${job.name} (run ${run.id}) failed in ${job.failedSteps.length} steps (${job.failedSteps.join(", ")}), not in its test step alone`);
      else if (!runsTests(step)) problems.push(`${job.name} (run ${run.id}) failed in "${job.failedSteps[0]}", which is not a step that runs the tests`);
      else if (found.unexplained.length > 0) problems.push(`${job.name} (run ${run.id}) failed beyond a test: ${found.unexplained.join("; ")}`);
      else if (found.failed !== found.tests.length) problems.push(`${job.name} (run ${run.id}) reports ${found.failed} failed tests but names ${found.tests.length}`);
      else if (unlisted.length > 0) problems.push(...unlisted.map((test) => `${test.project} ${test.file} > ${test.title} failed in ${job.name} (run ${run.id}) and is not quarantined`));
      else if (closed.length > 0) problems.push(...closed.map((test) => `${test.project} ${test.file} > ${test.title} is quarantined, but its issue is not open`));
      else {
        ok = true;
        for (const test of found.tests) retried.push({ entry: entries.find((entry) => names(entry, test)), test, run: run.id, job: job.name, url: job.url });
      }
    } else {
      // A gate: each failed step reads the result of a job it needs, and every failed instance of
      // that job is explained.
      const block = node ? jobBlock(run.workflow, node.id) : undefined;
      const upstream = node && block && job.failedSteps.length > 0
        ? job.failedSteps.map((step) => node.needs.filter((need) => stepBlock(block, step).includes(`needs.${need}.result`)))
        : [];
      if (upstream.length === 0 || upstream.some((needs) => needs.length === 0)) {
        problems.push(`${job.name} (run ${run.id}) failed without a test failure in its log`);
      } else {
        ok = upstreamExplained(new Set(upstream.flat()), { gate: true });
      }
    }
    explained.set(key, ok);
    return ok;
  };
  for (const context of failing) {
    const instances = runs.flatMap((run) => run.jobs.filter((job) => job.name === context && job.conclusion !== "success").map((job) => ({ run, job })));
    if (instances.length === 0) problems.push(`${context} is not in the runs`);
    for (const { run, job } of instances) explain(run, job, jobGraph(run.workflow));
  }
  for (const run of runs) {
    if (run.attempt > 1 && retried.some((entry) => entry.run === run.id)) problems.push(`run ${run.id} is already on attempt ${run.attempt}: a quarantined test is retried only once`);
  }
  return { retry: problems.length === 0 && retried.length > 0, problems, retried };
}

/** The record of one retry, for the step summary, the log and the entry's issue. */
export const record = ({ entry, test, job, url }, by) =>
  `Retried once, as quarantined: ${test.project} ${test.file} > ${test.title} failed in ${job} (${url}). Issue ${entry.issue}, owner @${entry.owner}.${by ? ` By ${by}.` : ""}`;

/** The record of a retry whose rerun GitHub refused, for the log and the step summary. */
export const refused = ({ entry, test, job, url }, by) =>
  `Retry requested but the rerun failed: ${test.project} ${test.file} > ${test.title} failed in ${job} (${url}). Issue ${entry.issue}, owner @${entry.owner}.${by ? ` By ${by}.` : ""}`;

/** The warning for an entry whose issue is closed. */
export const staleWarning = (entry) => `::warning title=Stale quarantine entry::${entry.issue} is closed: remove the quarantine entry for ${entry.project} ${entry.file} > ${entry.title}.`;

/** Each entry's issue state: "OPEN", "CLOSED", or undefined when it cannot be read. Warns of each closed one. */
function issueStates(entries, log = console.log) {
  return entries.map((entry) => {
    const state = gh(["issue", "view", entry.issue, "--json", "state", "--jq", ".state"], { allowFail: true })?.trim() || undefined;
    if (state === "CLOSED") log(staleWarning(entry));
    else if (state === undefined) log(`::notice::Could not read the state of ${entry.issue}; its quarantine entry does not apply.`);
    return state;
  });
}

function gh(args, { allowFail = false } = {}) {
  const result = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0 && !allowFail) throw new Error(`gh ${args.slice(0, 3).join(" ")} failed: ${result.stderr.trim()}`);
  return result.status === 0 ? result.stdout : undefined;
}

async function retry(args, { dryRun = false } = {}) {
  const also = [];
  while (args[0] === "--also") {
    also.push(args[1]);
    args = args.slice(2);
  }
  const repo = process.env["GITHUB_REPOSITORY"];
  const entries = JSON.parse(readFileSync(quarantineFile, "utf8"));
  const problems = entryProblems(entries);
  if (problems.length > 0) {
    console.log(`::error::.github/quarantine.json: ${problems.join("; ")}`);
    return 1;
  }
  const contexts = [
    ...gh(["api", `repos/${repo}/rules/branches/main`, "--jq", '[.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context] | unique | .[]'])
      .split("\n")
      .filter(Boolean),
    ...also,
  ];
  const runs = args.map((id) => {
    const [attempt, path] = gh(["api", `repos/${repo}/actions/runs/${id}`, "--jq", "[.run_attempt, .path] | @tsv"]).trim().split("\t");
    const jobs = gh(["api", `repos/${repo}/actions/runs/${id}/jobs?per_page=100`, "--paginate", "--jq", ".jobs[] | {id, name, conclusion, url: .html_url, failedSteps: [.steps[] | select(.conclusion == \"failure\") | .name]} | tojson"])
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    for (const job of jobs) {
      if (job.conclusion === "failure") job.log = gh(["run", "view", "--repo", repo, "--job", String(job.id), "--log"], { allowFail: true }) ?? "";
    }
    return { id, attempt: Number(attempt), workflow: readFileSync(join(root, path), "utf8"), jobs };
  });
  // A test is quarantined only while its issue is open.
  const listed = entries.filter((entry) => runs.some((run) => run.jobs.some((job) => failedTests(job.log ?? "").tests.some((test) => names(entry, test)))));
  const states = issueStates(listed);
  for (const entry of entries) entry.open = states[listed.indexOf(entry)] === "OPEN";
  const plan = retryPlan({ runs, contexts, entries });
  if (!plan.retry) {
    console.log(`Not retried: ${plan.problems.join("; ")}`);
    return 1;
  }
  if (dryRun) {
    for (const retried of plan.retried) console.log(`Would record: ${record(retried)}`);
    return 0;
  }
  const by = process.env["GITHUB_RUN_ID"] ? `${process.env["GITHUB_SERVER_URL"]}/${repo}/actions/runs/${process.env["GITHUB_RUN_ID"]}` : undefined;
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  for (const id of new Set(plan.retried.map((retried) => retried.run))) {
    const before = runs.find((run) => run.id === id).attempt;
    const ofRun = plan.retried.filter((retried) => retried.run === id);
    // Recorded as retried only once GitHub has accepted the rerun.
    if (gh(["run", "rerun", id, "--repo", repo, "--failed"], { allowFail: true }) === undefined) {
      for (const retried of ofRun) {
        const line = refused(retried, by);
        console.log(`::error title=Quarantined test not retried::${line}`);
        if (summary) appendFileSync(summary, `- ${line}\n`);
      }
      return 1;
    }
    for (const retried of ofRun) {
      const line = record(retried, by);
      console.log(`::warning title=Quarantined test retried::${line}`);
      if (summary) appendFileSync(summary, `- ${line}\n`);
      if (gh(["issue", "comment", retried.entry.issue, "--body", line], { allowFail: true }) === undefined) console.log(`::warning::Could not comment on ${retried.entry.issue}.`);
    }
    // Until the new attempt has started, so scripts/required-ci.sh does not read the old one.
    for (let tries = 0; ; tries++) {
      const attempt = Number(gh(["api", `repos/${repo}/actions/runs/${id}`, "--jq", ".run_attempt"], { allowFail: true }) ?? 0);
      if (attempt > before) break;
      if (tries >= 60) throw new Error(`run ${id} did not start its retry`);
      await wait(Number(process.env["POLL_SECONDS"] ?? 5) * 1000);
    }
    console.log(`Retrying the failed jobs of run ${id} once.`);
  }
  return 0;
}

/**
 * Repeats a rehearsal run's retries (its jobs' "Quarantined test retried" warnings) in this run's log
 * and step summary, so the release shows what its rehearsal passed only on a retry.
 */
function rehearsed(id) {
  if (!/^\d+$/.test(id)) {
    console.log(`::warning::"${id}" is not a rehearsal run's id, so its retries are not shown here.`);
    return 0;
  }
  const repo = process.env["GITHUB_REPOSITORY"];
  const url = `${process.env["GITHUB_SERVER_URL"] ?? "https://github.com"}/${repo}/actions/runs/${id}`;
  const jobs = gh(["api", `repos/${repo}/actions/runs/${id}/jobs?per_page=100`, "--paginate", "--jq", ".jobs[].id"], { allowFail: true });
  if (jobs === undefined) {
    console.log(`::warning::Could not read the jobs of the rehearsal ${url}, so its retries are not shown here.`);
    return 0;
  }
  const lines = [];
  for (const job of jobs.split("\n").filter(Boolean)) {
    const annotations = gh(["api", `repos/${repo}/check-runs/${job}/annotations?per_page=100`, "--paginate", "--jq", '.[] | select(.title == "Quarantined test retried" or .title == "Quarantined test not retried") | "\\(.title): \\(.message)"'], { allowFail: true });
    if (annotations === undefined) console.log(`::warning::Could not read the annotations of the rehearsal's job ${job} (${url}).`);
    else lines.push(...annotations.split("\n").filter(Boolean));
  }
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (lines.length === 0) {
    if (summary) appendFileSync(summary, `The rehearsal (${url}) retried no quarantined test.\n`);
    return 0;
  }
  for (const line of lines) {
    console.log(`::warning title=Rehearsal retried a quarantined test::${line} (rehearsal ${url})`);
    if (summary) appendFileSync(summary, `- The rehearsal (${url}): ${line}\n`);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "check") {
    const problems = entryProblems(JSON.parse(readFileSync(quarantineFile, "utf8")));
    for (const problem of problems) console.error(`::error::.github/quarantine.json: ${problem}`);
    process.exit(problems.length > 0 ? 1 : 0);
  } else if (command === "stale") {
    issueStates(JSON.parse(readFileSync(quarantineFile, "utf8")));
  } else if (command === "rehearsed" && args.length === 1) {
    process.exit(rehearsed(args[0]));
  } else if ((command === "retry" || command === "plan") && args.length > 0) {
    process.exit(await retry(args, { dryRun: command === "plan" }));
  } else {
    console.error("usage: quarantine.mjs check | stale | rehearsed <run id> | retry|plan [--also <check>]... <run id>...");
    process.exit(2);
  }
}
