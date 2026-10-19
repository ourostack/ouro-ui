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
// - infrastructure: VoiceOver or NVDA did not start or could not be controlled, a TCC prompt
//   appeared, a test timed out before the screen reader said anything, the Storybook server never
//   became ready, or the runner image was broken. The nightly run opens or updates one
//   `screen-reader-infra` issue; a release retries once.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A failed assertion about what was spoken, or about the stories the lane opens. */
const assertion = /\[sr\] no utterance matched|\[sr\] these story ids|Error: expect\(/;

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

/** The lane's class for a log and `pnpm test:sr`'s exit code (null when it never ran). */
export function classify(log, exitCode) {
  if (exitCode === 0) return "pass";
  if (exitCode === null || exitCode === undefined || log.trim() === "") return "infrastructure";
  if (assertion.test(log)) return "accessibility";
  if (infrastructure.some(([pattern]) => pattern.test(log))) return "infrastructure";
  // A timeout before the screen reader said anything: it never started speaking.
  if (/Test timeout of \d+ms exceeded/.test(log) && !/\[sr\] first utterance:/.test(log)) return "infrastructure";
  return "accessibility";
}

/** Why a log is infrastructure, for the summary. */
const why = (log) => infrastructure.find(([pattern]) => pattern.test(log))?.[1] ?? (log.trim() === "" ? "the tests never ran" : "a timeout before the first utterance");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, code] = process.argv.slice(2);
  const log = file && existsSync(file) ? readFileSync(file, "utf8") : "";
  const exit = code === undefined || code === "" ? null : Number(code);
  const result = classify(log, log === "" ? null : exit);
  const detail = { pass: "every utterance was as expected", accessibility: "an expected utterance was missing or wrong, or a story is missing: this blocks a release", infrastructure: `${why(log)}: not a finding about the components` }[result];
  console.log(`SR_CLASS=${result}`);
  console.log(`Screen-reader lane: ${result} (${detail}).`);
  if (process.env["GITHUB_OUTPUT"]) appendFileSync(process.env["GITHUB_OUTPUT"], `class=${result}\n`);
  if (process.env["GITHUB_STEP_SUMMARY"]) appendFileSync(process.env["GITHUB_STEP_SUMMARY"], `Screen-reader lane: **${result}** (${detail}).\n`);
  process.exitCode = result === "pass" ? 0 : 1;
}
