// changes/*.md list one release's behaviour changes, one fragment file per change (any name,
// holding `- ` lines), so pull requests that each add a change never edit the same file.
// release.yml assembles them into the "Changes in this release" section of the release notes:
//
//   node scripts/changes.mjs assemble <changes dir> [<last release notes>]
//
// prints the section: the heading, then every fragment's `- ` lines, by file name, less the
// lines the last release's notes already hold.
//
//   node scripts/changes.mjs check <changes dir> <last release notes>
//
// fails (a GitHub ::error:: line, exit 1) when a fragment holds a line that is not a top-level
// `- ` item (one line per change; anything else would not reach the notes), or when every
// change the fragments list is already in the last release's notes. Fragments stay on main
// after the release that used them: a line the last release's notes hold is not this
// release's, so no pull request has to delete them. release.yml runs it before it pushes
// anything and writes the assembled section to CHANGES.md on the release commit (so the tag
// holds it; main keeps fragments only).
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
export function assemble(dir, lastNotes = "") {
  const files = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".md")).sort() : [];
  const released = new Set(lastNotes.split("\n"));
  const lines = files.flatMap((file) => listed(readFileSync(join(dir, file), "utf8"))).filter((line) => !released.has(line));
  return lines.length === 0 ? `${HEADING}\n` : `${HEADING}\n\n${lines.join("\n")}\n`;
}

/**
 * Lines a fragment holds that are not a change: every non-blank line must be a top-level `- `
 * item, one line per change, because only those reach the release notes. As `file:line: text`.
 */
export function fragmentProblems(dir) {
  const files = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".md")).sort() : [];
  return files.flatMap((file) =>
    readFileSync(join(dir, file), "utf8")
      .split("\n")
      .flatMap((line, index) => (line.trim() === "" || line.startsWith("- ") ? [] : [`changes/${file}:${index + 1}: ${line}`])),
  );
}

/** Why the changes cannot be released as they are, or null. */
export function changesProblem(markdown, lastNotes) {
  const released = new Set(lastNotes.split("\n"));
  if (listed(markdown).filter((line) => !released.has(line)).length === 0) {
    return "changes/ lists no change that the last release's notes do not already hold. Add a changes/<name>.md file with a `- ` line for each change an app will see in this release, then run Release again.";
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, dir, notes] = process.argv.slice(2);
  if (mode === "check" && dir && notes) {
    const stray = fragmentProblems(dir);
    const problem =
      stray.length > 0
        ? `Each changes/ fragment line is one change: a top-level \`- \` line, with no wrapped lines, sub-items or other text. Fix: ${stray.join(" | ")}`
        : changesProblem(assemble(dir), readFileSync(notes, "utf8"));
    if (problem) {
      console.log(`::error::${problem}`);
      process.exit(1);
    }
  } else if (mode === "assemble" && dir) {
    process.stdout.write(assemble(dir, notes && existsSync(notes) ? readFileSync(notes, "utf8") : ""));
  } else {
    console.error("usage: changes.mjs check <changes dir> <last release notes> | assemble <changes dir> [<last release notes>]");
    process.exit(2);
  }
}
