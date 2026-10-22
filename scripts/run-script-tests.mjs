// Runs the script tests (`node --test <arguments>`) with a temp folder of their own, which is removed
// after the run whatever happens, so no script test, nor anything it imports or starts, can leave
// copies in the system's temp folder. What was left in it is reported as a warning, so the test that
// left it can be fixed; the run's result is the tests' own. OURO_STRICT_TMPDIR=1 fails the run on it
// instead, to hunt a leak locally.
//
//   node scripts/run-script-tests.mjs [node --test options] <test files>
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * What the tools under test leave in a temp folder of their own accord, which this removes with the
 * folder: Node's compile cache, and the folders Chromium leaves on Linux for each browser launched.
 */
export const toolLeftovers = (name) => name === "node-compile-cache" || name.startsWith(".org.chromium.Chromium.");

/**
 * Runs `node --test` over `args` with TMPDIR set to a new folder, and returns its exit status; with
 * `strict` (OURO_STRICT_TMPDIR=1), 1 when it left anything in that folder.
 */
export function runScriptTests(args, { log = console.error, strict = process.env["OURO_STRICT_TMPDIR"] === "1" } = {}) {
  const temp = mkdtempSync(join(tmpdir(), "ouro-script-tests-"));
  try {
    const env = { ...process.env, TMPDIR: temp, TMP: temp, TEMP: temp };
    // This run is its own test runner, even when a test starts it.
    delete env["NODE_TEST_CONTEXT"];
    const result = spawnSync(process.execPath, ["--test", ...args], { stdio: "inherit", env });
    const left = readdirSync(temp).filter((name) => !toolLeftovers(name));
    if (left.length > 0) {
      log(`::warning::The script tests left ${left.length} item(s) in their temp folder, removed with it: ${left.join(", ")}. Make each in its test with scratchDir (scripts/scratch.mjs), which removes it.`);
      if (strict) return 1;
    }
    return result.status ?? 1;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = runScriptTests(process.argv.slice(2));
