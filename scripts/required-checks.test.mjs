import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checksDrift, requiredContexts } from "./required-checks.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The rules GET /repos/{owner}/{repo}/rules/branches/main answers with: each rule of every active ruleset. */
const rules = [
  { type: "deletion", ruleset_id: 1 },
  { type: "required_status_checks", ruleset_id: 24881709, parameters: { strict_required_status_checks_policy: false, required_status_checks: [{ context: "ci" }, { context: "e2e" }, { context: "conformance exemptions" }] } },
  { type: "merge_queue", ruleset_id: 24881709, parameters: {} },
  { type: "required_status_checks", ruleset_id: 2, parameters: { required_status_checks: [{ context: "ci", integration_id: 15368 }, { context: "lighthouse" }] } },
];

test("the required checks are every required_status_checks rule's contexts, from every ruleset, once each and sorted", () => {
  assert.deepEqual(requiredContexts(rules), ["ci", "conformance exemptions", "e2e", "lighthouse"]);
  assert.deepEqual(requiredContexts([]), []);
});

test("the file and the live rules differ by the checks only one of them names", () => {
  const live = requiredContexts(rules);
  assert.deepEqual(checksDrift(["e2e", "lighthouse", "ci", "conformance exemptions"], live), { missing: [], extra: [] });
  assert.deepEqual(checksDrift(["ci", "e2e", "lighthouse", "ci-budget"], live), { missing: ["conformance exemptions"], extra: ["ci-budget"] });
  // A name listed twice is a difference too: the file is one list of distinct checks.
  assert.deepEqual(checksDrift(["ci", "ci", "e2e", "lighthouse", "conformance exemptions"], live), { missing: [], extra: ["ci"] });
});

test(".github/required-checks.json lists distinct checks", () => {
  const file = JSON.parse(readFileSync(join(root, ".github/required-checks.json"), "utf8"));
  assert.ok(Array.isArray(file) && file.every((check) => typeof check === "string"));
  assert.equal(new Set(file).size, file.length);
});
