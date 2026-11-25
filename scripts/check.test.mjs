import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Ouro check's Node side (registry/ouro/check/run.ts and serve.ts, which drive headless Chromium, fades.ts, which reads
// source, base-check.ts, which reads the app's stylesheet against ouro-base, and the first-run harness) has node:test tests (the files in scripts/check/) that run under node --test with
// Node's own coverage, held to 100% like the components, in the scripts (browser) job. Its in-page side is covered by
// test/check-in-page.test.ts in Vitest.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// The first-run harness: Node, driving an installed app through first-run-ax-tree.swift on a Mac and first-run-uia-tree.cs on Windows.
const harness = ["first-run-judges.ts", "first-run-eyes.ts", "first-run-machine.ts", "first-run-network.ts", "first-run-session.ts", "first-run-detours.ts", "first-run-system.ts", "first-run-windows.ts", "first-run-sso.ts"];

test("the Ouro check tests pass and cover every line, branch and function of its Node side", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      "--experimental-test-coverage",
      "--test-coverage-include=registry/ouro/check/run.ts",
      "--test-coverage-include=registry/ouro/check/serve.ts",
      "--test-coverage-include=registry/ouro/check/fades.ts",
      "--test-coverage-include=registry/ouro/check/base-check.ts",
      "--test-coverage-include=registry/ouro/check/watch.ts",
      ...harness.map((file) => `--test-coverage-include=registry/ouro/check/${file}`),
      "--test-coverage-lines=100",
      "--test-coverage-branches=100",
      "--test-coverage-functions=100",
      "scripts/check/check.test.mts",
      "scripts/check/check-pages.test.mts",
      "scripts/check/check-command.test.mts",
      "scripts/check/check-watch.test.mts",
      "scripts/check/check-rules.test.mts",
      "scripts/check/fades.test.mts",
      "scripts/check/base-check.test.mts",
      "scripts/check/ax-hooks.test.mts",
      "scripts/check/first-run-units.test.mts",
      "scripts/check/first-run-session.test.mts",
      "scripts/check/first-run-windows.test.mts",
      "scripts/check/first-run-sso.test.mts",
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
