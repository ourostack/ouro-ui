// The `// real clock: <reason>` escapes of timerBoundReads (scripts/source-rules.mjs) against the
// pull request's base: a file that gains one fails unless the pull request's description names
// it, as claims.mjs ratchet does for claims.config.json's exemptions.
//
//   REAL_CLOCK_BASE_REF=origin/main PR_BODY="…" node scripts/real-clock-ratchet.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { realClockEscapes, realClockProblems, timerBoundFiles } from "./source-rules.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ref = process.env.REAL_CLOCK_BASE_REF;
if (!ref) {
  process.stderr.write("real-clock-ratchet needs REAL_CLOCK_BASE_REF, the pull request's base (origin/main).\n");
  process.exit(2);
}
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
const count = (text) => realClockEscapes(text).length;
const head = new Map(git("ls-files", "--", ...timerBoundFiles).split("\n").filter(Boolean).map((path) => [path, count(readFileSync(join(root, path), "utf8"))]));
const atBase = new Set(git("ls-tree", "-r", "--name-only", ref).split("\n"));
const base = new Map([...head].filter(([path, n]) => n > 0 && atBase.has(path)).map(([path]) => [path, count(git("show", `${ref}:${path}`))]));
const problems = realClockProblems({ base, head, body: process.env.PR_BODY ?? "" });
for (const problem of problems) process.stderr.write(`${problem.message}\n`);
if (problems.length > 0) process.exit(1);
process.stdout.write("No real-clock escape added without a mention.\n");
