// changes/*.md list one release's behaviour changes, one fragment file per change (any name,
// holding `- ` lines), so pull requests that each add a change never edit the same file.
// release.yml assembles them into the "Changes in this release" section of the release notes:
//
//   node scripts/changes.mjs assemble <changes dir> [--since <last release tag>]
//
// prints the section: the heading, then every fragment's `- ` lines, by file name, less the
// lines the fragments at the last release's tag held, which that release or an earlier one
// published (#1485).
//
//   node scripts/changes.mjs check <changes dir> [--since <last release tag>]
//
// fails (a GitHub ::error:: line, exit 1) when a fragment holds a line that is not a top-level
// `- ` item (one line per change; anything else would not reach the notes), or when every
// change the fragments list was already at the last release's tag. Fragments stay on main
// after the release that used them, so no pull request has to delete them. The last release's
// own notes are not enough to leave them out: they hold only that release's lines, so the release
// after it listed the one before's again. release.yml runs it before it pushes anything and
// writes the assembled section to CHANGES.md on the release commit (so the tag holds it; main
// keeps fragments only).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The section heading release.yml turns into the notes' `###` heading. */
export const HEADING = "# Changes in this release";

/** The change lines: each top-level `- ` item. */
export function listed(markdown) {
  return markdown.split("\n").filter((line) => line.startsWith("- "));
}

/**
 * The change lines the fragments at a git ref (a release tag) held: every line that release, or one
 * before it, published. Reads the ref from the repository in the working directory.
 */
export function releasedAt(ref, dir = "changes", cwd = process.cwd()) {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
  } catch {
    throw new Error(`changes.mjs: ${ref} is not in this checkout. Fetch it: git fetch --no-tags --depth=1 origin refs/tags/${ref}:refs/tags/${ref}`);
  }
  let names;
  try {
    names = git("ls-tree", "--name-only", `${ref}:${dir}`);
  } catch {
    return [];
  }
  return names
    .split("\n")
    .filter((name) => name.endsWith(".md"))
    .flatMap((name) => listed(git("show", `${ref}:${dir}/${name}`)));
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
    return "changes/ lists no change that the last release did not already publish. Add a changes/<name>.md file with a `- ` line for each change an app will see in this release, then run Release again.";
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, dir, flag, ref] = process.argv.slice(2);
  const usage = "usage: changes.mjs check <changes dir> [--since <last release tag>] | assemble <changes dir> [--since <last release tag>]";
  if ((mode !== "check" && mode !== "assemble") || !dir || (flag !== undefined && (flag !== "--since" || !ref))) {
    console.error(usage);
    process.exit(2);
  }
  let released = "";
  try {
    released = ref ? releasedAt(ref).join("\n") : "";
  } catch (error) {
    console.log(`::error::${error.message}`);
    process.exit(1);
  }
  if (mode === "check") {
    const stray = fragmentProblems(dir);
    const problem =
      stray.length > 0
        ? `Each changes/ fragment line is one change: a top-level \`- \` line, with no wrapped lines, sub-items or other text. Fix: ${stray.join(" | ")}`
        : changesProblem(assemble(dir), released);
    if (problem) {
      console.log(`::error::${problem}`);
      process.exit(1);
    }
  } else {
    process.stdout.write(assemble(dir, released));
  }
}
