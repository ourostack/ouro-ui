// A pull request that changes a file apps install and run (registry runtime code, components,
// lib, a theme stylesheet) must give Release a reason to ship it: a changes/ line, or a
// `no-release: <reason>` line in the description for a real exception. Release auto releases only
// when changes/ lists a change the newest release lacks, so a fix without a line never ships.
// A docs pin changes only version literals in those files and ships nothing, so it passes.
// CI's Release note workflow runs it on each pull request, and again when the description is
// edited: `BASE_REF=origin/main PR_BODY="…" node scripts/release-note.mjs` (head is HEAD; the base
// is the merge base, so main moving on does not count).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { onlyVersionLiterals } from "./pin-only.mjs";

const fragment = /^changes\/[^/]+\.md$/;
const testOrStory = /\.(test|test-d|stories)\.tsx?$/;

/** Whether apps install and run this path, so a change to it needs a release to carry it. */
export function shippedFile(path) {
  if (/^registry\/ouro\/theme\/[^/]+\.css$/.test(path)) return true;
  if (path.startsWith("registry/ouro/lib/ouro/testing/")) return false;
  return /^registry\/ouro\/(components|lib)\/ouro\//.test(path) && /\.(ts|tsx|css)$/.test(path) && !testOrStory.test(path);
}

/** The reason on a `no-release: <reason>` line of the description, or null when there is none or it is under three characters. */
export function noReleaseReason(body) {
  for (const [, reason] of body.matchAll(/^[ \t]*no-release:[ \t]*(.*?)[ \t]*$/gim)) {
    if (reason.replace(/\s/g, "").length >= 3) return reason;
  }
  return null;
}

const changeLines = (text) => (text ?? "").split("\n").filter((line) => line.startsWith("- "));

/** Whether this changes/ file gains a "- " line its base lacks. */
function gainsChangeLine({ path, before, after }) {
  if (!fragment.test(path)) return false;
  const known = new Set(changeLines(before));
  return changeLines(after).some((line) => !known.has(line));
}

/** The files apps install whose change is more than version literals. */
export function shippedChanges(files) {
  return files.filter(({ path, before, after }) => shippedFile(path) && !onlyVersionLiterals(before, after));
}

/** Whether a changes/ file in `files` gains a "- " line, so Release has a change to list. */
export function carriedByFragment(files) {
  return files.some(gainsChangeLine);
}

/**
 * What is wrong with a pull request's change, one line each; none when it is fine. `files` is
 * `[{ path, before, after }]` with the text on each side and `null` where the file is absent.
 */
export function releaseNoteProblems({ files, body = "" }) {
  const shipped = shippedChanges(files);
  if (shipped.length === 0 || carriedByFragment(files) || noReleaseReason(body) !== null) return [];
  const paths = shipped.map(({ path }) => path).join(", ");
  return [
    `${paths} change what apps install, but changes/ gains no line, so no release will carry them. Fix: add changes/<name>.md with a "- " line saying what apps see, or put "no-release: <why>" on its own line in the pull request's description.`,
  ];
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** The text of `path` at `rev`, or null when the commit has no such file. */
function contentAt(rev, path) {
  try {
    return git(["show", `${rev}:${path}`]);
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const baseRef = process.env["BASE_REF"];
  if (!baseRef) {
    console.error('usage: BASE_REF=origin/main PR_BODY="…" node scripts/release-note.mjs');
    process.exit(2);
  }
  const base = git(["merge-base", baseRef, "HEAD"]).trim();
  const paths = git(["diff", "--no-renames", "--name-only", "-z", base, "HEAD"]).split("\0").filter(Boolean);
  const files = paths.map((path) => ({ path, before: contentAt(base, path), after: contentAt("HEAD", path) }));
  const body = process.env["PR_BODY"] ?? "";
  const problems = releaseNoteProblems({ files, body });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`release note: ${problem}`);
    process.exit(1);
  }
  const shipped = shippedChanges(files);
  if (shipped.length === 0) console.log("release note: no shipped file changes, so none is needed.");
  else if (carriedByFragment(files)) console.log("release note: changes/ gains a line, so a release will carry the shipped change.");
  else console.log(`::notice title=no release::${noReleaseReason(body)}`);
}
