import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// GitHub answers a 502 to a page of 100 jobs of a CI run, which has about 150 jobs: a script that
// reads those jobs in pages that size cannot read them, and a release, a yield or a budget that
// depends on them fails or is skipped. Each of these reads the jobs of a CI run in pages of 30.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readers = [
  "scripts/ci-budget.mjs",
  "scripts/ci-fail-fast.mjs",
  "scripts/ci-proof.mjs",
  "scripts/ci-yield.mjs",
  "scripts/current/current.mjs",
  "scripts/latency-quiet.mjs",
  "scripts/quarantine.mjs",
  "scripts/required-ci.sh",
  ".github/workflows/release.yml",
];

test("every reader of a CI run's jobs asks for pages of 30, never 100", () => {
  for (const file of readers) {
    const lines = readFileSync(join(root, file), "utf8").split("\n").filter((line) => /\/jobs\?/.test(line));
    assert.ok(lines.length > 0, `${file} reads a run's jobs`);
    for (const line of lines) {
      assert.match(line, /per_page=(30|\$\{jobsPerPage\})/, `${file}: ${line.trim()}`);
      assert.doesNotMatch(line, /per_page=100/, `${file}: ${line.trim()}`);
    }
  }
});

test("the screen-reader timings read a run's pages 30 at a time", () => {
  const source = readFileSync(join(root, "scripts/sr-lane-timings.mjs"), "utf8");
  assert.match(source, /per_page=30&page=/);
  assert.doesNotMatch(source, /per_page=100/);
});
