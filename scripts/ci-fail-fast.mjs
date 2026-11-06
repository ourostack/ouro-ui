// Fail fast for a pull request's CI (.github/workflows/ci.yml). GitHub has no switch that stops a
// run's other jobs when one fails, and each matrix keeps its own off so every shard reports. So each
// job that does the run's work (WATCHED) has a notifier job, `fail-fast-<job>`, that needs it and
// runs only when it failed on a pull request: it cancels the rest of the run, so a red job frees the
// runners of the rest rather than when the slowest of them ends.
//
// A notifier holds no runner until its job has failed: a green run skips every notifier, so no
// runner sits waiting for a failure. It starts once its job has finished, so that job keeps its
// failure conclusion, its log and its artifacts (a cancel that reaches a job before its last step
// ends marks it cancelled, which is why no job cancels its own run); for a matrix, once every shard
// of it has. A job that timed out counts as failed: the run was not cancelled, so a cancelled job timed out. The jobs the run had not finished report
// cancelled, and ci-budget, a required check, does not run in a cancelled run, so the pull request
// stays blocked until a push or a re-run passes.
//
// Only a notifier may write to Actions, and it runs nothing from the repository and installs
// nothing: one `gh api` call. No job that installs dependencies or runs the repository's code holds
// a token that can start, cancel or change a workflow. The plan's failure is tolerated (TOLERATED:
// every job then runs everything), latency's is left to a re-run of it alone (RERUN_ALONE: a slow
// runner can fail it with the change sound), and a gate (GATES) only reads what the jobs it waits on
// did, so it fails only after one of them failed, whose notifier has already cancelled the run. The
// jobs that check something of their own after the jobs they wait on passed (coverage's 100%, the
// motion maps) are watched.
//
//   node scripts/ci-fail-fast.mjs   prints the notifier jobs, as ci.yml holds them
import { fileURLToPath } from "node:url";

/** The job that waits on every other job: it does not run in a cancelled run. */
export const LAST = "ci-budget";
/** Jobs whose failure the run tolerates: when the plan fails, every job that reads it runs everything. */
export const TOLERATED = ["plan"];
/** Jobs that a slow runner can fail with the change sound: their failure is left to a re-run of that job, not a cancelled run. */
export const RERUN_ALONE = ["latency"];
/** Jobs that only read what the jobs they wait on did (their results and markers): their failure follows a watched job's. */
export const GATES = ["conformance", "mutation", "e2e", "install-gate"];
/** Jobs that never run on a pull request (main's and a release branch's installs). */
export const NOT_ON_PULL_REQUESTS = ["install-latest", "install-github"];
/** The jobs whose failure cancels the rest of a pull request's run: every other job in ci.yml. */
export const WATCHED = [
  "checks",
  "attribution",
  "browser",
  "scripts",
  "scripts-browser",
  "coverage",
  "browser-fallback",
  "ci",
  "motion-coverage",
  "themes",
  "conformance-shard",
  "mutation-plan",
  "mutation-shard",
  "visual",
  "registry",
  "e2e-shard",
  "theme-install",
  "lighthouse",
  "install-shard",
  "install",
  "install-upgrade",
];

/** Whether what the API said means this token is rate limited: a 403 or a 429, or a header that says so (scripts/ci-yield.mjs reads it too). */
export const rateLimited = (text) => /\bHTTP (?:403|429)\b|^HTTP\/[\d.]+ (?:403|429)\b|^x-ratelimit-remaining:\s*0\s*$|^retry-after:/im.test(text);

/** The requests left this hour, from `gh api --include` headers, or null (scripts/ci-yield.mjs reads it too). */
export const requestsLeft = (headers) => {
  const match = /^x-ratelimit-remaining:\s*(\d+)/im.exec(headers);
  return match ? Number(match[1]) : null;
};

/** A watched job's notifier's job id. */
export const notifierId = (job) => `fail-fast-${job}`;

/** The notice a notifier prints once it has cancelled the run. */
export const cancelNote = (job) => `${job} failed, so fail fast cancelled the rest of this pull request's run to free its runners. The failed job's own log says why.`;

/** A watched job's notifier, as ci.yml holds it. */
export const notifierJob = (job) =>
  [
    `  ${notifierId(job)}:`,
    `    needs: [${job}]`,
    `    if: \${{ !cancelled() && github.event_name == 'pull_request' && (needs.${job}.result == 'failure' || needs.${job}.result == 'cancelled') }}`,
    `    name: fail fast (${job})`,
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 10",
    "    permissions:",
    "      actions: write",
    "    steps:",
    "      - name: Cancel the rest of the run",
    "        env:",
    "          GH_TOKEN: ${{ github.token }}",
    "        run: |",
    '          if gh api -X POST "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/cancel" > /dev/null; then',
    `            echo "::notice::${cancelNote(job)}"`,
    "          else",
    `            echo "::warning::${job} failed, but cancelling the rest of the run did not work."`,
    "          fi",
  ].join("\n");

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(WATCHED.map(notifierJob).join("\n"));
