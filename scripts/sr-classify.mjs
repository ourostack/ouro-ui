// Classifies a screen-reader lane run (.github/workflows/screen-reader.yml) from its log and the
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
//   context while nothing else failed (a test body's failure always decides first). The nightly run
//   and a push to main open or update one `screen-reader-infra` issue; a release retries once.
//
// A VoiceOver start that failed and was tried once more
// (registry/ouro/e2e/screen-reader/voiceover-start.ts) logs a `[sr] start retry:` line. Those lines
// are no finding and no reason, so they are left out of the classification; the run summary says how
// many there were.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A failed assertion about what was spoken, or about the stories the lane opens. */
const assertion = /\[sr\] no utterance matched|\[sr\] these story ids|Error: expect\(/;

/** Playwright refusing its own command line, before any test ran (ourostack/ouro-ui#1848). */
const harness = /^Error: Project\(s\) .* not found\. Available projects:|^Error: No tests found|^error: unknown option/m;

/** The runner, not the components: each with the reason the summary gives. */
const infrastructure = [
  // @guidepup/guidepup's own errors (lib/errors.js), and the same in other words.
  [/VoiceOver (cannot be started|failed to start|could not be started|did not start|not running|is not running|not supported)|Timed out waiting for VoiceOver|Failed to mount Guidepup preferences/i, "VoiceOver did not start"],
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

/** A VoiceOver start retried before a test ran (registry/ouro/e2e/screen-reader/voiceover-start.ts, RETRY_PREFIX). */
const retryLine = /^\s*\[sr\] start retry:/;

/** The log without its start-retry lines: a start a retry recovered is no finding, and its error is no reason. */
const withoutRetries = (log) => log.split(/\r?\n/).filter((line) => !retryLine.test(line)).join("\n");

/** How many VoiceOver starts were retried before a test ran. */
export const startRetries = (log) => log.split(/\r?\n/).filter((line) => retryLine.test(line)).length;

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
  return findings.trim() === ""
    ? "the tests never ran"
    : onlyBrowserLifecycleFailed(findings)
      ? "the browser failed to open or close a test's context, outside any assertion"
      : (infrastructure.find(([pattern]) => pattern.test(findings))?.[1] ?? "a timeout before the first utterance");
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, code] = process.argv.slice(2);
  const log = file && existsSync(file) ? readFileSync(file, "utf8") : "";
  const exit = code === undefined || code === "" ? null : Number(code);
  const result = classify(log, log === "" ? null : exit);
  const detail = { pass: "every utterance was as expected", accessibility: "an expected utterance was missing or wrong, or a story is missing: this blocks a release", infrastructure: `${why(log)}: not a finding about the components`, harness: "Playwright refused the lane's own command, so no test ran: fix the command in the workflow, not the components" }[result];
  const retries = startRetries(log);
  const retried = retries ? `VoiceOver's start was retried ${retries} time${retries === 1 ? "" : "s"} before a test ran (the \`[sr] start retry:\` lines in the log).` : "";
  console.log(`SR_CLASS=${result}`);
  console.log(`Screen-reader lane: ${result} (${detail}).`);
  if (retried) console.log(retried);
  if (process.env["GITHUB_OUTPUT"]) appendFileSync(process.env["GITHUB_OUTPUT"], `class=${result}\n`);
  if (process.env["GITHUB_STEP_SUMMARY"]) appendFileSync(process.env["GITHUB_STEP_SUMMARY"], `Screen-reader lane: **${result}** (${detail}).\n${retried ? `\n${retried}\n` : ""}`);
  process.exitCode = result === "pass" ? 0 : 1;
}
