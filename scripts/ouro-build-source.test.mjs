import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

// ouroBuildSource() is a Vite plugin, so it needs node:child_process and runs outside any browser project;
// like Ouro AX, its test (ouro-build-source.test.mts, node:test) runs under node --test with full coverage.

const file = "registry/ouro/lib/ouro/ouro-build-source.test.mts";

test("the ouroBuildSource plugin's tests pass and cover every line, branch and function of its own file", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      // One report format on every Node version (Node 24 defaults to spec even when piped).
      "--test-reporter=tap",
      "--experimental-test-coverage",
      "--test-coverage-include=registry/ouro/lib/ouro/ouro-build-source.ts",
      "--test-coverage-lines=100",
      "--test-coverage-branches=100",
      "--test-coverage-functions=100",
      file,
    ],
    // NODE_TEST_CONTEXT would make the child report to this runner instead of printing its report.
    { encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "NODE_TEST_CONTEXT")) },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^# all files\s+\|\s+100\.00 \|\s+100\.00 \|\s+100\.00 \|/m, result.stdout);
});
