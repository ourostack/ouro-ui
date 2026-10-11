// CHANGES.md lists one release's behaviour changes; release.yml prints it at the top of the
// release notes. Two modes keep it to one release:
//
//   node scripts/changes.mjs check <CHANGES.md> <last release notes>
//
// fails (a GitHub ::error:: line, exit 1) when the file lists no change, or when a change it
// lists is already in the last release's notes, which means the PR that starts the file
// again was never merged. release.yml runs it before it pushes anything.
//
//   node scripts/changes.mjs reset <CHANGES.md>
//
// starts the file again with only its heading. release.yml runs it after a release, on a
// branch off the released main commit, and opens "Start CHANGES.md for the next release".
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The file after a reset: the heading release.yml turns into the notes' section heading. */
export const NEXT = "# Changes in this release\n";

/** The change lines: each top-level `- ` item. */
export function listed(markdown) {
  return markdown.split("\n").filter((line) => line.startsWith("- "));
}

/** Why the file cannot be released as it is, or null. */
export function changesProblem(markdown, lastNotes) {
  const lines = listed(markdown);
  if (lines.length === 0) {
    return "CHANGES.md lists no change. Add a `- ` line for each change an app will see in this release, then run Release again.";
  }
  const released = new Set(lastNotes.split("\n"));
  const stale = lines.filter((line) => released.has(line));
  if (stale.length > 0) {
    return [
      "CHANGES.md still lists the last release's changes. Merge the open \"Start CHANGES.md for the next release\" PR",
      "(or remove these lines yourself), list this release's changes, then run Release again:",
      ...stale,
    ].join(" ");
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, file, notes] = process.argv.slice(2);
  if (mode === "check" && file && notes) {
    const problem = changesProblem(readFileSync(file, "utf8"), readFileSync(notes, "utf8"));
    if (problem) {
      console.log(`::error::${problem}`);
      process.exit(1);
    }
  } else if (mode === "reset" && file) {
    writeFileSync(file, NEXT);
  } else {
    console.error("usage: changes.mjs check <CHANGES.md> <last release notes> | reset <CHANGES.md>");
    process.exit(2);
  }
}
