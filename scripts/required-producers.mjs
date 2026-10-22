// The workflows that report main's required checks: for each context (one per line on stdin, as
// release.yml reads them from main's live rules), the workflow in .github/workflows whose job
// reports a check of that name (scripts/ci-budget.mjs jobGraph reads the names, matrix values
// included). Prints each such workflow once. A workflow GITHUB_TOKEN opened or queued a pull
// request with starts no run, so Release dispatches each one; it fails when a context has no
// workflow, or its workflow has no workflow_dispatch trigger.
//
//   printf '%s\n' ci "conformance exemptions" | node scripts/required-producers.mjs
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jobGraph } from "./ci-budget.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The workflows of `dir` (file names and text) that can report on a pull request or in the merge queue. */
export function readWorkflows(dir = join(root, ".github/workflows")) {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".yml"))
    .map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") }))
    .filter(({ text }) => /^ {2}(pull_request|merge_group):/m.test(text));
}

/** Each context's workflow, `{ producers: [file], problems: [message] }`. */
export function requiredProducers(contexts, workflows) {
  const producers = new Set();
  const problems = [];
  for (const context of contexts) {
    const found = workflows.filter(({ text }) => jobGraph(text).some((node) => node.pattern.test(context)));
    if (found.length === 0) problems.push(`no workflow reports the required check "${context}"`);
    for (const { file, text } of found) {
      if (!/^ {2}workflow_dispatch:/m.test(text)) problems.push(`${file} reports the required check "${context}" but has no workflow_dispatch trigger, so Release cannot start it`);
      producers.add(file);
    }
  }
  return { producers: [...producers].sort((a, b) => (a === "ci.yml" ? -1 : b === "ci.yml" ? 1 : a.localeCompare(b))), problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const contexts = readFileSync(0, "utf8").split("\n").map((line) => line.trim()).filter(Boolean);
  const { producers, problems } = requiredProducers(contexts, readWorkflows());
  for (const problem of problems) console.error(`::error::${problem}.`);
  if (problems.length > 0) process.exit(1);
  console.log(producers.join("\n"));
}
