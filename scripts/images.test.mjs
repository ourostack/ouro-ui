import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Ouro images (registry/ouro/images/images.ts) runs in Node, so its node:test tests (scripts/images/images.test.mts)
// run under node --test with Node's own coverage, held to 100% like the components.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the Ouro images tests pass and cover every line, branch and function of images.ts", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      "--experimental-test-coverage",
      "--test-coverage-include=registry/ouro/images/images.ts",
      "--test-coverage-lines=100",
      "--test-coverage-branches=100",
      "--test-coverage-functions=100",
      "scripts/images/images.test.mts",
    ],
    // NODE_TEST_CONTEXT would make the child report to this runner instead of printing its report.
    { cwd: root, encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "NODE_TEST_CONTEXT")) },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^# all files\s+\|\s+100\.00 \|\s+100\.00 \|\s+100\.00 \|/m, result.stdout);
});
