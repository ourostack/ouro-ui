// changes/*.md list one release's behaviour changes, one fragment file per change (any name,
// holding `- ` lines), so pull requests that each add a change never edit the same file.
// release.yml assembles them into the "Changes in this release" section of the release notes:
//
//   node scripts/changes.mjs assemble <changes dir>
//
// prints the section: the heading, then every fragment's `- ` lines, by file name.
//
//   node scripts/changes.mjs check <changes dir> <last release notes>
//
// fails (a GitHub ::error:: line, exit 1) when the fragments list no change, or when a change
// they list is already in the last release's notes, which means the PR that deletes the
// released fragments was never merged. release.yml runs it before it pushes anything, and
// after a release its "Prepare main for the next release" PR deletes the fragments it used.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The section heading release.yml turns into the notes' `###` heading. */
export const HEADING = "# Changes in this release";

/** The change lines: each top-level `- ` item. */
export function listed(markdown) {
  return markdown.split("\n").filter((line) => line.startsWith("- "));
}

/** The section the release notes show: the heading and every fragment's change lines, by file name. */
export function assemble(dir) {
  const files = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".md")).sort() : [];
  const lines = files.flatMap((file) => listed(readFileSync(join(dir, file), "utf8")));
  return lines.length === 0 ? `${HEADING}\n` : `${HEADING}\n\n${lines.join("\n")}\n`;
}

/** Why the changes cannot be released as they are, or null. */
export function changesProblem(markdown, lastNotes) {
  const lines = listed(markdown);
  if (lines.length === 0) {
    return "changes/ lists no change. Add a changes/<name>.md file with a `- ` line for each change an app will see in this release, then run Release again.";
  }
  const released = new Set(lastNotes.split("\n"));
  const stale = lines.filter((line) => released.has(line));
  if (stale.length > 0) {
    return [
      "changes/ still lists the last release's changes. Merge the open \"Prepare main for the next release\" PR",
      "(or delete those fragments yourself), list this release's changes, then run Release again:",
      ...stale,
    ].join(" ");
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, dir, notes] = process.argv.slice(2);
  if (mode === "check" && dir && notes) {
    const problem = changesProblem(assemble(dir), readFileSync(notes, "utf8"));
    if (problem) {
      console.log(`::error::${problem}`);
      process.exit(1);
    }
  } else if (mode === "assemble" && dir) {
    process.stdout.write(assemble(dir));
  } else {
    console.error("usage: changes.mjs check <changes dir> <last release notes> | assemble <changes dir>");
    process.exit(2);
  }
}
