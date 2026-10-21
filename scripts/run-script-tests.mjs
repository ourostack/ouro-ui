// Runs the script tests (`node --test <arguments>`) with a temp folder of their own, and fails when
// anything is left in it afterwards, so no script test, nor anything it imports or starts, can
// leave copies in the system's temp folder. The folder is removed after the run either way.
//
//   node scripts/run-script-tests.mjs [node --test options] <test files>
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Runs `node --test` over `args` with TMPDIR set to a new folder; returns its exit status, or 1 when it left anything in that folder. */
export function runScriptTests(args, { log = console.error } = {}) {
  const temp = mkdtempSync(join(tmpdir(), "ouro-script-tests-"));
  try {
    const env = { ...process.env, TMPDIR: temp, TMP: temp, TEMP: temp };
    // This run is its own test runner, even when a test starts it.
    delete env["NODE_TEST_CONTEXT"];
    const result = spawnSync(process.execPath, ["--test", ...args], { stdio: "inherit", env });
    const left = readdirSync(temp);
    if (left.length > 0) {
      log(`The script tests left ${left.length} item(s) in their temp folder; remove each in the test that makes it (scripts/scratch.mjs):`);
      for (const name of left) log(`  ${name}`);
      return 1;
    }
    return result.status ?? 1;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = runScriptTests(process.argv.slice(2));
