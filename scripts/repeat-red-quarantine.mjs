// The repeat-red quarantine: a test that failed main a second time in a day, whose cause lane did not
// land a green fix within an hour of that second failure (AGENTS.md's "Red-main fixes"). Distinct from
// the release-side `.github/quarantine.json` (which only lets a release retry a known-flaky test once):
// this list (`.github/repeat-red-quarantine.json`) is report-only and read on every push to main, never
// to retry or skip a test, only to say which tests are quarantined, name each one's product-bug cause, and
// warn once its 24 hour deadline has passed with no merged fix. Report-only, as every new gate must be: it
// never fails a run, raises no ceiling and blocks no release.
//
//   node scripts/repeat-red-quarantine.mjs check
//       fails when an entry lacks its test (project, file, title), its issue URL, its owner, a valid
//       quarantinedAt timestamp or its cause
//   node scripts/repeat-red-quarantine.mjs report
//       prints a step-summary line and a ::notice (or ::warning, once overdue) for every entry; always
//       exits 0
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// OURO_REPEAT_RED_QUARANTINE_FILE lets the tests hand it a list of their own.
export const quarantineFile = process.env.OURO_REPEAT_RED_QUARANTINE_FILE ?? join(root, ".github/repeat-red-quarantine.json");

const issuePattern = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/;

/** Milliseconds in the 24 hour deadline every entry gets from its `quarantinedAt`. */
export const deadlineMs = 24 * 60 * 60 * 1000;

/**
 * What is wrong with the quarantine's entries: each needs a project, a file, a title, an issue URL, an
 * owner, a valid `quarantinedAt` timestamp and a cause naming the product bug (or "infra", when the
 * repeat red is not a product bug).
 */
export function entryProblems(entries) {
  if (!Array.isArray(entries)) return ["the repeat-red quarantine must be a JSON array of entries"];
  return entries.flatMap((entry, index) => {
    const label = `entry ${index + 1}${typeof entry?.title === "string" ? ` (${entry.title})` : ""}`;
    const problems = [];
    for (const key of ["project", "file", "title", "owner", "cause"]) {
      if (typeof entry?.[key] !== "string" || entry[key].trim() === "") problems.push(`${label} has no ${key}`);
    }
    if (typeof entry?.issue !== "string" || !issuePattern.test(entry.issue)) problems.push(`${label} has no issue URL (https://github.com/<owner>/<repo>/issues/<number>)`);
    if (typeof entry?.quarantinedAt !== "string" || Number.isNaN(Date.parse(entry.quarantinedAt))) problems.push(`${label} has no quarantinedAt (an ISO timestamp of its second failure)`);
    return problems;
  });
}

/** The entry's 24 hour deadline, as a `Date`. */
export function deadline(entry) {
  return new Date(Date.parse(entry.quarantinedAt) + deadlineMs);
}

/** Whether `entry`'s 24 hour deadline has passed, as of `now`. */
export function isOverdue(entry, now) {
  return now.getTime() >= deadline(entry).getTime();
}

/**
 * One report line per entry, naming its test, issue, owner, cause and deadline, and whether that
 * deadline has passed. Entries with a problem (`entryProblems`) are left out of the per-entry lines and
 * reported once at the top instead, since their fields cannot be trusted to format.
 */
export function reportLines(entries, now) {
  const problems = entryProblems(entries);
  if (problems.length > 0) return [`The repeat-red quarantine is malformed: ${problems.join("; ")}.`];
  if (entries.length === 0) return ["The repeat-red quarantine is empty."];
  return entries.map((entry) => {
    const overdue = isOverdue(entry, now);
    const status = overdue ? "OVERDUE" : `due ${deadline(entry).toISOString()}`;
    return `${entry.project} ${entry.file} > ${entry.title}: issue ${entry.issue}, owner @${entry.owner}, cause: ${entry.cause} (${status})`;
  });
}

function report() {
  const entries = JSON.parse(readFileSync(quarantineFile, "utf8"));
  const lines = reportLines(entries, new Date());
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  const problems = entryProblems(entries);
  if (problems.length > 0) {
    for (const problem of problems) console.log(`::warning title=Repeat-red quarantine malformed::${problem}`);
  }
  for (const entry of problems.length > 0 ? [] : entries) {
    const overdue = isOverdue(entry, new Date());
    const line = reportLines([entry], new Date())[0];
    console.log(overdue ? `::warning title=Repeat-red quarantine overdue::${line}` : `::notice title=Repeat-red quarantine::${line}`);
  }
  if (summary) appendFileSync(summary, `## Repeat-red quarantine\n\n${lines.map((line) => `- ${line}`).join("\n")}\n`);
  // Report-only: never fails the run, whatever it finds, so main stays green and releases keep flowing.
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command] = process.argv.slice(2);
  if (command === "check") {
    const problems = entryProblems(JSON.parse(readFileSync(quarantineFile, "utf8")));
    for (const problem of problems) console.error(`::error::.github/repeat-red-quarantine.json: ${problem}`);
    process.exit(problems.length > 0 ? 1 : 0);
  } else if (command === "report") {
    process.exit(report());
  } else {
    console.error("usage: repeat-red-quarantine.mjs check | report");
    process.exit(2);
  }
}
