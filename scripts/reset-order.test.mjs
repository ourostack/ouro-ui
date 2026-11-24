import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "registry/ouro/lib/ouro/testing/reset-order.leaves-state.test.ts",
  "registry/ouro/lib/ouro/testing/reset-order.starts-clean.test.ts",
];

// The two files that prove the kit's cross-file reset (ourostack/ouro-ui#3300, #3319): the first
// resizes the real viewport and emulates media directly, the way a file's own cleanup bug once
// could, and the second asserts neither followed it in. A shard puts files from one worker's queue
// into one browser session in the order it reads them, which is what `--maxWorkers=1` with these
// two names, in this order, gives on every host: this is the shape of a pull request's and main's
// shards landing two such files beside each other, not a fixed pair of shard positions.
test("the kit resets the real viewport and media between files sharing a worker, not just between tests", () => {
  const result = spawnSync(
    join(root, "node_modules/.bin/vitest"),
    ["run", "--project=ouro-chromium", "--maxWorkers=1", ...files],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
}, { timeout: 120_000 });
