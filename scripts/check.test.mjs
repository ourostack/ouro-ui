import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Ouro check's Node side (registry/ouro/check/check.ts and serve.ts, which drive headless Chromium, and fades.ts, which
// reads source) has node:test tests (scripts/check/check.test.mts and fades.test.mts) that run under node --test with
// Node's own coverage, held to 100% like the components, in the scripts (browser) job. Its in-page side is covered by
// test/check-in-page.test.ts in Vitest.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the Ouro check tests pass and cover every line, branch and function of its Node side", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      "--experimental-test-coverage",
      "--test-coverage-include=registry/ouro/check/check.ts",
      "--test-coverage-include=registry/ouro/check/serve.ts",
      "--test-coverage-include=registry/ouro/check/fades.ts",
      "--test-coverage-lines=100",
      "--test-coverage-branches=100",
      "--test-coverage-functions=100",
      "scripts/check/check.test.mts",
      "scripts/check/fades.test.mts",
    ],
    {
      cwd: root,
      encoding: "utf8",
      // NODE_TEST_CONTEXT would make the child report to this runner instead of printing its report.
      env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "NODE_TEST_CONTEXT")),
    },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^# all files\s+\|\s+100\.00 \|\s+100\.00 \|\s+100\.00 \|/m, result.stdout);
  assert.ok(chromium.executablePath());
});
