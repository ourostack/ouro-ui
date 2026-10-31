import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Ouro AX (registry/ouro/ax/) runs in Node, not in a browser, so its tests (*.test.mts, node:test) run under
// node --test with Node's own coverage, held to 100% like the components. The fixtures are the X-ray's test inputs.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = "registry/ouro/ax";

test("the Ouro AX tests pass and cover every line, branch and function of Ouro AX", () => {
  const files = readdirSync(join(root, dir))
    .filter((name) => name.endsWith(".test.mts"))
    .map((name) => `${dir}/${name}`);
  assert.ok(files.length >= 12, files.join(", "));
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      // One report format on every Node version (Node 24 defaults to spec even when piped).
      "--test-reporter=tap",
      "--experimental-test-coverage",
      `--test-coverage-include=${dir}/*.ts`,
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
});
