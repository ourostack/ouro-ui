// The one check main's rules require of CI (.github/workflows/ci.yml, job `gate`): it passes only
// when every job this run needs passed, or was left out by design for this kind of run.
//
//   NEEDS='<toJSON(needs)>' EVENT=… BASE_REF=… HEAD_REF=… REF=… node scripts/ci-gate.mjs
//
// A pull request into main (not from a release branch) runs the fast suite: the checks, the
// script tests, the browser tests and coverage the plan selects, mutation testing, the selected
// stories' themes and conformance, the selected end-to-end specs, the visual and registry checks,
// and, when it changes the install test, one install app (shadcn, nova). Every other run (the
// merge queue, main, a dispatched or scheduled run, a release branch) runs the full suite, and
// there each job must pass. The gate decides which suite applies from the event itself, not from
// the plan, so a plan that says `fast` in the merge queue still fails the queue entry.
//
// It fails closed: a job that failed or was cancelled fails it whatever the suite, a job it does
// not know is required, and a skipped job passes only where `policy` says the suite leaves it out.
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Whether this run is a pull request's fast suite, by the same rule as the plan's. */
export function isFast({ event, baseRef, headRef }) {
  return event === "pull_request" && baseRef === "main" && !headRef.startsWith("release/");
}

/**
 * Per ci.yml job, whether a run must pass it: `required`, or `optional` (skipped is fine, and a
 * run of it must still not fail). `ctx` is { fast, event, ref, installs }.
 */
export const policy = {
  plan: () => "required",
  checks: () => "required",
  scripts: () => "required",
  "scripts-browser": () => "required",
  // The ci job holds the browser shards, coverage and the fallback shards to account (a reduced or
  // skipped browser run passes there only with its coverage decided), so the gate reads ci for them.
  browser: () => "optional",
  coverage: () => "optional",
  "browser-fallback": () => "optional",
  ci: () => "required",
  "motion-coverage": () => "required",
  themes: () => "required",
  "conformance-shard": () => "required",
  conformance: () => "required",
  // Mutation testing mutates a pull request's changed lines; any other run has none.
  "mutation-plan": ({ event }) => (event === "pull_request" ? "required" : "optional"),
  "mutation-shard": ({ event }) => (event === "pull_request" ? "required" : "optional"),
  mutation: ({ event }) => (event === "pull_request" ? "required" : "optional"),
  visual: () => "required",
  registry: () => "required",
  "e2e-shard": () => "required",
  e2e: () => "required",
  // The full suite only: the merge queue runs them on what merges.
  "theme-install": ({ fast }) => (fast ? "optional" : "required"),
  latency: ({ fast }) => (fast ? "optional" : "required"),
  lighthouse: ({ fast }) => (fast ? "optional" : "required"),
  install: ({ fast }) => (fast ? "optional" : "required"),
  "install-upgrade": ({ fast }) => (fast ? "optional" : "required"),
  // A fast pull request runs one install app, and only when it changes the install test.
  "install-shard": ({ fast, installs }) => (fast && installs === "queue" ? "optional" : "required"),
  "install-gate": ({ fast, installs }) => (fast && installs === "queue" ? "optional" : "required"),
  "install-latest": ({ ref }) => (ref.startsWith("refs/heads/release/") ? "required" : "optional"),
  "install-github": ({ event, ref }) => (ref === "refs/heads/main" && (event === "push" || event === "workflow_dispatch") ? "required" : "optional"),
  "ci-budget": ({ event }) => (event === "pull_request" ? "required" : "optional"),
};

/**
 * The ci.yml jobs the gate does not need: fail-fast never fails the run (continue-on-error) and
 * stops once ci-budget has finished, and nightly reports the gate's own result.
 */
export const notNeeded = ["gate", "fail-fast", "nightly"];

/**
 * `{ pass, lines }`: the gate's verdict over `needs` ({ job: { result, outputs } }) for a run
 * described by `run` ({ event, baseRef, headRef, ref }), one line per job.
 */
export function judge(needs, run) {
  const fast = isFast(run);
  const plan = needs.plan;
  const lines = [];
  let pass = true;
  if (!plan) return { pass: false, lines: ["plan: not among the jobs the gate needs, so nothing can be judged"] };
  const outputs = plan.outputs ?? {};
  // A push to main whose commit the merge queue already tested runs only install-github.
  const tested = run.event === "push" && run.ref === "refs/heads/main" && outputs.tested === "true";
  const ctx = { fast, event: run.event, ref: run.ref, installs: outputs.installs ?? "" };
  lines.push(`suite: ${tested ? "tested in the merge queue" : fast ? "fast (a pull request into main)" : "full"}`);
  for (const [job, { result }] of Object.entries(needs)) {
    const rule = policy[job];
    const need = tested && job !== "plan" && job !== "install-github" ? "optional" : rule ? rule(ctx) : "required";
    let ok;
    if (result === "failure" || result === "cancelled") ok = false;
    else if (result === "success") ok = true;
    else ok = need === "optional" && result === "skipped";
    if (!ok) pass = false;
    lines.push(`${ok ? "ok" : "FAILED"} ${job}: ${result}${rule ? `, ${need}` : ", required (a job the gate's policy does not know)"}`);
  }
  for (const job of Object.keys(policy)) {
    if (!(job in needs)) lines.push(`note ${job}: in the gate's policy but not among its needs`);
  }
  return { pass, lines };
}

function main() {
  let needs;
  try {
    needs = JSON.parse(process.env["NEEDS"] ?? "");
  } catch {
    console.error("::error::ci-gate: NEEDS is not the needs context as JSON. Fix: set NEEDS: ${{ toJSON(needs) }} on the step.");
    return 1;
  }
  const run = { event: process.env["EVENT"] ?? "", baseRef: process.env["BASE_REF"] ?? "", headRef: process.env["HEAD_REF"] ?? "", ref: process.env["REF"] ?? "" };
  const { pass, lines } = judge(needs, run);
  for (const line of lines) console.log(line.startsWith("FAILED") ? `::error::${line}` : line);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary) appendFileSync(summary, `### gate: ${pass ? "passed" : "failed"}\n\n${lines.map((line) => `- ${line}`).join("\n")}\n`);
  return pass ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
