import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// The Ouro AX census (scripts/ouro-census/), which a product vendors to count its agent doors in its own CI. Its tests
// are .node-test.mts files that import its TypeScript directly, so they run here under node --test with Node's
// coverage, after its own type check. Its walkers' tests over a real harness run when OURO_CENSUS_HARNESS names a
// built ourostack/ouroboros checkout, and are skipped otherwise.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// NODE_TEST_CONTEXT would make the child report to this runner instead of printing its report.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "NODE_TEST_CONTEXT"));

test("the census type-checks on its own", () => {
  const result = spawnSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "scripts/ouro-census"], { cwd: root, encoding: "utf8", env });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("the census's tests pass and cover every line and function of the census", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      // One report format on every Node version (Node 24 defaults to spec even when piped).
      "--test-reporter=tap",
      "--experimental-test-coverage",
      "--test-coverage-include=scripts/ouro-census/**/*.m[tj]s",
      "--test-coverage-exclude=scripts/ouro-census/**/*.node-test.mts",
      "--test-coverage-exclude=scripts/ouro-census/**/fixtures/**",
      "--test-coverage-lines=100",
      "--test-coverage-functions=100",
      "--test-coverage-branches=90",
      "scripts/ouro-census/**/*.node-test.mts",
    ],
    { cwd: root, encoding: "utf8", env, timeout: 300_000 },
  );
  assert.equal(result.status, 0, result.stdout.slice(-6000) + result.stderr);
  assert.match(result.stdout, /^# all files\s+\|\s+100\.00 \|\s+\d+\.\d+ \|\s+100\.00 \|/m, result.stdout.slice(-4000));
});
