import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// The guardrail kits (ouro-census, ouro-source-rules) run in Node, not in a browser, so their
// tests (scripts/kits/) run under node --test with Node's own coverage, held to 100% like the
// components. The census's in-page collector runs in the page; its browser test is
// test/census-collect.test.ts, under Vitest's coverage.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the kits' tests pass and cover every line, branch and function of the kits", () => {
  const files = readdirSync(join(root, "scripts/kits"))
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => `scripts/kits/${name}`);
  assert.ok(files.length >= 4, files.join(", "));
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--experimental-test-coverage",
      "--test-coverage-include=registry/ouro/census/*.mjs",
      "--test-coverage-include=registry/ouro/source-rules/*.mjs",
      "--test-coverage-exclude=registry/ouro/census/census-collect.mjs",
      "--test-coverage-lines=100",
      "--test-coverage-branches=100",
      "--test-coverage-functions=100",
      ...files,
    ],
    // NODE_TEST_CONTEXT would make the child report to this runner instead of printing its report.
    { cwd: root, encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "NODE_TEST_CONTEXT")) },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^# all files\s+\|\s+100\.00 \|\s+100\.00 \|\s+100\.00 \|/m, result.stdout);
  for (const kit of ["census-page.mjs", "census.mjs", "source-rules.mjs"]) assert.match(result.stdout, new RegExp(`${kit.replace(".", "\\.")}\\s+\\|\\s+100\\.00`), kit);
});
