// Classifies a screen-reader lane run (.github/workflows/screen-reader-lane.yml) from its log and the
// exit code of `pnpm test:sr`, so the lane and the release gate can tell a real accessibility
// failure from a runner that could not drive its screen reader.
//
//   node scripts/sr-classify.mjs <log file> <exit code>
//
// Prints SR_CLASS=<class> (release.yml reads it from the failed run's log), writes `class` to
// $GITHUB_OUTPUT and exits 0 only for "pass". A missing log or exit code means the tests never
// ran: infrastructure.
//
// - pass: the tests passed.
// - accessibility: an expected utterance was missing or wrong (an assertion failed), a story the
//   lane opens is not in Storybook, or anything this cannot attribute to the runner. It fails the
//   run and blocks a release.
// - harness: Playwright refused the lane's own command line or found nothing to run (`Project(s) …
//   not found`, `No tests found`, an unknown option), so no test started: the lane's command is
//   wrong. It fails the run, a release does not retry it, and it opens no infrastructure issue.
// - infrastructure: VoiceOver or NVDA did not start or could not be controlled, a TCC prompt
//   appeared, a test timed out before the screen reader said anything, the Storybook server never
//   became ready, the runner image was broken, or the browser failed to open or close a test's
//   context while nothing else failed (a test body's failure always decides first). Its reason
//   separates "VoiceOver did not start" (a start that failed before the page was reached) from
//   "VoiceOver stopped answering while it reached the page" (a navigation that hung on every try, or
//   VoiceOver not running once a test had reached the page). The nightly run and a push to main open
//   or update one `screen-reader-infra` issue; a release retries once.
//
// A VoiceOver navigation that hung and was retried logs a `[sr] navigation retry:` line
// (registry/ouro/e2e/screen-reader/navigation.ts), and a VoiceOver start that could not start and was
// retried logs a `[sr] start retry:` line with its `[sr] start diagnostics:` lines
// (start-retry.ts). Those lines are no finding and no reason, so they are left out of the
// classification; the run summary counts them against the VoiceOver tests that ran.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A failed assertion about what was spoken, or about the stories the lane opens. */
const assertion = /\[sr\] no utterance matched|\[sr\] these story ids|Error: expect\(/;

/** Playwright refusing its own command line, before any test ran (ourostack/ouro-ui#1848). */
const harness = /^Error: Project\(s\) .* not found\. Available projects:|^Error: No tests found|^error: unknown option/m;

/** The reasons the summary gives for an infrastructure failure of VoiceOver. */
const DID_NOT_START = "VoiceOver did not start";
const STOPPED = "VoiceOver stopped answering while it reached the page";

/** Whether a test reached the page: an utterance was logged, a test passed, or a navigation was on the stack. */
const reachedPage = (findings) => /\[sr\] first utterance:|^\s*✓\s|at startReading /m.test(findings);

/** The runner, not the components: each with the reason the summary gives (a function of the log, when it depends on the log). */
const infrastructure = [
  // @guidepup/guidepup's errors for VoiceOver's start (lib/errors.js), and the same in other words.
  [/VoiceOver (cannot be started|failed to start|could not be started|did not start|is not supported)|Timed out waiting for VoiceOver to be running|Failed to mount Guidepup preferences/i, DID_NOT_START],
  // The navigation hung on every try (navigation.ts): VoiceOver stopped answering on the page.
  [/VoiceOver stopped answering while it reached the page/, STOPPED],
  // The navigation finished on every try with VoiceOver still outside the page's web area (navigation.ts).
  [/VoiceOver never entered the page's web area/, "VoiceOver never entered the page's web area"],
  // VoiceOver's "not running": from a stop, or a call on a VoiceOver that is no longer started. Before the page was reached, a start that did not finish.
  [/VoiceOver (not running|is not running)|Timed out waiting for VoiceOver to not be running/i, (findings) => (reachedPage(findings) ? STOPPED : DID_NOT_START)],
  [/NVDA (cannot be started|failed to start|could not be started|did not start|is not running|is not installed|is not supported)|Cannot connect to NVDA|Timed out waiting for NVDA|Failed to create Guidepup preferences/i, "NVDA did not start"],
  [/Not authorized to send Apple events|\(-1743\)|\(-1719\)|assistive access|AppleEvent timed out|Unable to activate application|Unable to send keys|VoiceOver unable to/i, "AppleScript could not control VoiceOver"],
  [/would like to control|kTCCService|TCC\.db/i, "a TCC prompt or database error"],
  [/config\.webServer/, "the Storybook server never became ready"],
  [/\[sr\] infrastructure:/, "the lane reported an infrastructure failure"],
  [/Executable doesn't exist|browserType\.launch|Host system is missing dependencies/, "the browser could not start"],
  [/ENOSPC|no space left on device/i, "the runner ran out of disk"],
  [/received a shutdown signal|lost communication with the server/i, "the runner went away"],
];

/**
 * The browser opening or closing a test's context, or closing itself: only the fixtures around a
 * test do that, never a spec's body.
 */
const browserLifecycleError = /^\s*Error: (browserContext\.(close|newPage)|browser\.(close|newContext)): /;

/**
 * Whether every error the run reports is the browser failing to open or close a test's context,
 * with no test timeout: the test bodies did not fail, so the runner did. Recorded: NVDA's Select
 * test passed, then `browserContext.close: Test ended.`; and NVDA's quit took the browser with it,
 * so the next test's `browser.newContext` failed.
 */
function onlyBrowserLifecycleFailed(log) {
  const errors = log.split(/\r?\n/).filter((line) => /^\s*[A-Za-z]*Error: /.test(line));
  return errors.length > 0 && errors.every((line) => browserLifecycleError.test(line)) && !/Test timeout of \d+ms exceeded/.test(log);
}

/** A VoiceOver navigation retried after it hung or quit (navigation.ts), or a VoiceOver start retried (start-retry.ts): no finding and no reason. */
const retryLine = /^\s*\[sr\] (navigation|start) retry:/;

/** The diagnostics a start retry logs under its line (start-retry.ts): no finding either. */
const diagnosticsLine = /^\s*\[sr\] start diagnostics:/;

/** The log without its retry lines: a navigation or a start a retry recovered is no finding and no reason. */
const withoutRetries = (log) => log.split(/\r?\n/).filter((line) => !retryLine.test(line) && !diagnosticsLine.test(line)).join("\n");

/** How many VoiceOver navigations were retried after a hang. */
export const navigationRetries = (log) => log.split(/\r?\n/).filter((line) => /^\s*\[sr\] navigation retry:/.test(line)).length;

/** How many VoiceOver starts were retried after VoiceOver could not be started (start-retry.ts, START_RETRY_PREFIX). */
export const startRetries = (log) => log.split(/\r?\n/).filter((line) => /^\s*\[sr\] start retry:/.test(line)).length;

/** How many VoiceOver tests ran (passed or failed): the denominator of the retry rate. */
export const voiceOverTestsRan = (log) => log.split(/\r?\n/).filter((line) => /^\s*(✓|✘)\s+\d+\s+\[voiceover\]/.test(line)).length;

/** How many VoiceOver steps were judged from a description of the focus after VoiceOver said only hints (screen-reader.ts's heard). */
export const hintOnlyFallbacks = (log) => log.split(/\r?\n/).filter((line) => /^\s*\[sr\] finding: hint-only /.test(line)).length;

/** How many VoiceOver steps heard their utterance, or were judged from a description after only hints: the fallbacks' denominator. */
export const voiceOverSteps = (log) => log.split(/\r?\n/).filter((line) => /^\s*\[sr\] heard /.test(line) && !/, described: "/.test(line)).length + hintOnlyFallbacks(log);

/**
 * The run summary's line on VoiceOver's hint-only fallbacks (ourostack/ouro-ui#2085), against its steps: above 1 in 50 it says
 * so, a cause to find rather than noise. Empty when no step fell back.
 */
export function hintOnlySummary(log) {
  const fallbacks = hintOnlyFallbacks(log);
  if (fallbacks === 0) return "";
  const steps = voiceOverSteps(log);
  const flag = fallbacks * 50 > steps ? " Above 1 in 50 steps: a cause to find, not noise." : "";
  return `VoiceOver hint-only fallbacks: ${fallbacks} in ${steps} steps (1 in ${Math.round(steps / fallbacks)}), each judged from a description of the focus (ourostack/ouro-ui#2085).${flag}`;
}

/**
 * The run summary's line on VoiceOver's retries, against the VoiceOver tests that ran: navigations
 * retried, and starts retried (`; VoiceOver start: …`). Above 1 in 50 tests the navigations say so: a
 * cause to find, not noise (#2014). A job that ran fewer than 50 tests is too few to judge that rate, so
 * a retry there points to #2014, which counts across runs. Empty when no VoiceOver test ran and no start
 * was retried.
 */
export function navigationSummary(log) {
  const tests = voiceOverTestsRan(log);
  const starts = startRetries(log);
  const startClause = starts ? `; VoiceOver start: ${starts} ${starts === 1 ? "retry" : "retries"}` : "";
  if (tests === 0) return starts ? `VoiceOver start: ${starts} ${starts === 1 ? "retry" : "retries"}.` : "";
  const retries = navigationRetries(log);
  const rate = retries ? ` (1 in ${Math.round(tests / retries)})` : "";
  const cause = !retries
    ? ""
    : tests < 50
      ? " Too few tests to judge against 1 in 50 alone: #2014 counts the rate across runs."
      : retries * 50 > tests
        ? " Above 1 in 50 tests: a cause to find, not noise."
        : "";
  return `VoiceOver navigation: ${retries} ${retries === 1 ? "retry" : "retries"} in ${tests} tests that ran${rate}${startClause}.${cause}`;
}

/** The lane's class for a log and `pnpm test:sr`'s exit code (null when it never ran). */
export function classify(log, exitCode) {
  if (exitCode === 0) return "pass";
  if (exitCode === null || exitCode === undefined || log.trim() === "") return "infrastructure";
  const findings = withoutRetries(log);
  if (findings.trim() === "") return "infrastructure";
  if (assertion.test(findings)) return "accessibility";
  if (harness.test(findings)) return "harness";
  if (onlyBrowserLifecycleFailed(findings)) return "infrastructure";
  if (infrastructure.some(([pattern]) => pattern.test(findings))) return "infrastructure";
  // A timeout before the screen reader said anything: it never started speaking.
  if (/Test timeout of \d+ms exceeded/.test(findings) && !/\[sr\] first utterance:/.test(findings)) return "infrastructure";
  return "accessibility";
}

/** Why a log is infrastructure, for the summary. */
export const why = (log) => {
  const findings = withoutRetries(log);
  if (findings.trim() === "") return "the tests never ran";
  if (onlyBrowserLifecycleFailed(findings)) return "the browser failed to open or close a test's context, outside any assertion";
  const match = infrastructure.find(([pattern]) => pattern.test(findings));
  if (!match) return "a timeout before the first utterance";
  const [, label] = match;
  return typeof label === "function" ? label(findings) : label;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, code] = process.argv.slice(2);
  const log = file && existsSync(file) ? readFileSync(file, "utf8") : "";
  const exit = code === undefined || code === "" ? null : Number(code);
  const result = classify(log, log === "" ? null : exit);
  const detail = { pass: "every utterance was as expected", accessibility: "an expected utterance was missing or wrong, or a story is missing: this blocks a release", infrastructure: `${why(log)}: not a finding about the components`, harness: "Playwright refused the lane's own command, so no test ran: fix the command in the workflow, not the components" }[result];
  const navigation = [navigationSummary(log), hintOnlySummary(log)].filter(Boolean).join("\n\n");
  console.log(`SR_CLASS=${result}`);
  console.log(`Screen-reader lane: ${result} (${detail}).`);
  if (navigation) console.log(navigation);
  if (process.env["GITHUB_OUTPUT"]) appendFileSync(process.env["GITHUB_OUTPUT"], `class=${result}\n`);
  if (process.env["GITHUB_STEP_SUMMARY"]) appendFileSync(process.env["GITHUB_STEP_SUMMARY"], `Screen-reader lane: **${result}** (${detail}).\n${navigation ? `\n${navigation}\n` : ""}`);
  process.exitCode = result === "pass" ? 0 : 1;
}
