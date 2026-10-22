// .github/required-checks.json against the checks main's rules require now (GET
// /repos/{owner}/{repo}/rules/branches/main, every active ruleset's rules), so the file the claims
// check (verify:ciJob) and scripts/workflows.test.mjs read cannot drift from the rules GitHub
// enforces. required-checks.yml runs it hourly and on a change to the file.
//
//   node scripts/required-checks.mjs   needs GITHUB_REPOSITORY; GH_TOKEN optional on a public repository
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The status checks `rules` (the API's rules for a branch) require: every required_status_checks rule's contexts, once each, sorted. */
export function requiredContexts(rules) {
  const contexts = rules.filter((rule) => rule.type === "required_status_checks").flatMap((rule) => rule.parameters?.required_status_checks ?? []).map((check) => check.context);
  return [...new Set(contexts)].sort();
}

/** The checks the rules require that the file leaves out (`missing`), and those the file lists that the rules do not require, or lists twice (`extra`). */
export function checksDrift(file, live) {
  const listed = new Set(file);
  const required = new Set(live);
  const extra = file.filter((check, index) => !required.has(check) || file.indexOf(check) !== index);
  return { missing: live.filter((check) => !listed.has(check)), extra };
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) {
    console.error("Set GITHUB_REPOSITORY (owner/name).");
    return 2;
  }
  const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) };
  const response = await globalThis.fetch(`https://api.github.com/repos/${repository}/rules/branches/main?per_page=100`, { headers });
  if (!response.ok) {
    console.error(`The rules for main could not be read: ${response.status} ${await response.text()}`);
    return 1;
  }
  const live = requiredContexts(await response.json());
  const file = JSON.parse(readFileSync(join(root, ".github/required-checks.json"), "utf8"));
  const { missing, extra } = checksDrift(file, live);
  if (missing.length === 0 && extra.length === 0) {
    console.log(`.github/required-checks.json matches main's rules: ${live.join(", ")}.`);
    return 0;
  }
  if (missing.length > 0) console.log(`::error::main's rules require ${missing.join(", ")}, which .github/required-checks.json does not list.`);
  if (extra.length > 0) console.log(`::error::.github/required-checks.json lists ${extra.join(", ")}, which main's rules do not require (or lists twice).`);
  console.log(`Main's rules require: ${live.join(", ")}. Make the file match them.`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main();
