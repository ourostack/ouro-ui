// Whether a pull request's change can reach the Form answer proof
// (.github/workflows/form-answer-proof.yml), so a change that cannot skips its browsers and tests:
//
//   node scripts/form-answer-impact.mjs <base> <head>   prints why, and writes `run` to $GITHUB_OUTPUT
//
// The proof runs the browser tests of the form, link and radio-group folders, and its own Node
// proof (test/form-answer.*). It leaves out the paths the proof never loads, then asks CI's plan
// (scripts/test-impact.mjs) about the rest: it runs when the plan runs everything, or selects one
// of those folders. Any other event, and a diff that cannot be read, runs it.
import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The folders whose browser tests the proof runs. */
export const proofFolders = ["form", "link", "radio-group"];

/**
 * Paths the proof never loads, though the plan runs everything for some of them: the scripts but
 * the modules vitest.config.ts imports (shard-timings.json only splits a sharded run, and the
 * proof is not sharded), the test folder but the proof's own files and the browser commands
 * vitest.config.ts imports, the site but the proof plugin it loads, the end-to-end specs, the
 * root stories, and the workflows but this one and the browser download it uses.
 */
export const unread = [
  [/^scripts\/(?!motion-reporter\.mts$|vitest-shards\.mts$|shard\.mjs$)/, "a script vitest.config.ts does not import"],
  [/^test\/(?!form-answer|conformance\/commands\.ts$)/, "a test file or fixture outside the proof"],
  [/^site\/(?!scripts\/proof\.mts$)/, "the site"],
  [/^registry\/ouro\/e2e\//, "an end-to-end spec"],
  [/^stories\//, "a story outside the registry"],
  [/^\.github\/(?!workflows\/form-answer-proof\.yml$|actions\/playwright-browsers\/)/, "another workflow"],
];

/**
 * `{ run, reasons }` for `changedFiles`. `impact` is the plan's testImpact and `folders` maps its
 * component stems to their folders (storyFolders, comma-separated).
 */
export function proofImpact(changedFiles, impact, folders) {
  if (changedFiles.length === 0) return { run: true, reasons: ["no changed file was found, so nothing can be ruled out"] };
  const reasons = [];
  const read = changedFiles.filter((path) => {
    const skip = unread.find(([pattern]) => pattern.test(path));
    if (skip) reasons.push(`${path}: ${skip[1]}, which the proof does not load`);
    return !skip;
  });
  if (read.length === 0) return { run: false, reasons };
  const plan = impact(read);
  reasons.push(...plan.reasons);
  if (plan.full) return { run: true, reasons };
  const reached = folders(plan.components).split(",").filter((folder) => proofFolders.includes(folder));
  reasons.push(reached.length > 0 ? `reaches ${reached.join(", ")}` : `reaches none of ${proofFolders.join(", ")}`);
  return { run: reached.length > 0, reasons };
}

async function main([base, head]) {
  const output = (line) => appendFileSync(process.env["GITHUB_OUTPUT"] ?? "/dev/null", `${line}\n`);
  const diff = spawnSync("git", ["diff", "--no-renames", "--name-only", base, head], { cwd: repoRoot, encoding: "utf8" });
  if (diff.status !== 0) {
    console.log(`git diff ${base} ${head} failed, so the proof runs: ${diff.stderr}`);
    output("run=true");
    return 0;
  }
  const { storyFolders, testImpact } = await import("./test-impact.mjs");
  const { run, reasons } = proofImpact(diff.stdout.split("\n").filter(Boolean), testImpact, storyFolders);
  console.log(run ? "The proof runs:" : "Nothing the proof loads changed, so it passes without running:");
  for (const reason of reasons) console.log(`- ${reason}`);
  output(`run=${run}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
