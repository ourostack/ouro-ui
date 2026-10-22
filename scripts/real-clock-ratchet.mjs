// The `// real clock: <reason>` escapes of timerBoundReads (scripts/source-rules.mjs) against the
// pull request's base, keyed by file, test and the statement each leads (realClockEscapeKeys) and
// counted per key: an escape the base does not have fails unless the pull request's description
// names its file, as claims.mjs ratchet does for claims.config.json's exemptions.
//
//   REAL_CLOCK_BASE_REF=origin/main PR_BODY="…" node scripts/real-clock-ratchet.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { realClockEscapeKeys, realClockEscapes, realClockProblems, timerBoundFiles } from "./source-rules.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ref = process.env.REAL_CLOCK_BASE_REF;
if (!ref) {
  process.stderr.write("real-clock-ratchet needs REAL_CLOCK_BASE_REF, the pull request's base (origin/main).\n");
  process.exit(2);
}
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
const keys = (path, text) => (realClockEscapes(text).length > 0 ? realClockEscapeKeys(path, text) : []);
const files = git("ls-files", "--", ...timerBoundFiles).split("\n").filter(Boolean);
const head = files.flatMap((path) => keys(path, readFileSync(join(root, path), "utf8")));
const atBase = new Set(git("ls-tree", "-r", "--name-only", ref).split("\n"));
const escaped = new Set(head.map((key) => key.slice(0, key.indexOf(": "))));
const base = [...escaped].filter((path) => atBase.has(path)).flatMap((path) => keys(path, git("show", `${ref}:${path}`)));
const problems = realClockProblems({ base, head, body: process.env.PR_BODY ?? "" });
for (const problem of problems) process.stderr.write(`${problem.message}\n`);
if (problems.length > 0) process.exit(1);
process.stdout.write("No real-clock escape added without a mention.\n");
