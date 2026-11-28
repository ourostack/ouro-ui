// withLoad: spawns bounded CPU-load workers for a test, and cleans them all up — the one harness every
// lane uses instead of hand-rolling spin loops (coordinator order, 2026-11-25: 16 detached spin loops left
// running 17 minutes on the shared machine after one lane rolled its own; recurred a second time, 2 more
// orphans, 13 minutes, when the harness process that spawned them was itself killed mid-run rather than
// exiting on its own — the gap these two forceful-kill tests exist to close).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { loadWorkersRemain, maxLoadWorkers, withLoad } from "./load.mjs";

const loadMjsUrl = pathToFileURL(fileURLToPath(new URL("./load.mjs", import.meta.url))).href;

/** Code for a disposable harness-under-test subprocess: starts load workers, then just sits busy. */
function harnessSubprocessCode(workers, seconds) {
  return `
    import("${loadMjsUrl}").then(({ withLoad }) => {
      withLoad(() => new Promise(() => {}), { workers: ${workers}, seconds: ${seconds} });
    });
  `;
}

/** Waits for workers to have actually spawned, by polling the harness's own check. */
async function waitForWorkers(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await loadWorkersRemain()) return;
    await sleep(50);
  }
  throw new Error("workers never appeared");
}

describe("maxLoadWorkers", () => {
  it("leaves at least two cores free, and never goes below one worker", () => {
    assert.equal(maxLoadWorkers(), Math.max(1, cpus().length - 2));
  });
});

describe("withLoad", () => {
  it("runs fn while workers are alive, and leaves none running once it returns", async () => {
    let sawWorkers = false;
    const result = await withLoad(
      async () => {
        sawWorkers = await loadWorkersRemain();
        return "done";
      },
      { workers: 2, seconds: 10 },
    );
    assert.equal(result, "done");
    assert.equal(sawWorkers, true, "a worker should be alive while fn runs");
    assert.equal(await loadWorkersRemain(), false, "no worker should outlive withLoad");
  });

  it("still cleans up every worker when fn throws", async () => {
    await assert.rejects(
      withLoad(
        async () => {
          throw new Error("fn failed");
        },
        { workers: 2, seconds: 10 },
      ),
      /fn failed/,
    );
    assert.equal(await loadWorkersRemain(), false, "no worker should outlive a thrown fn");
  });

  it("rejects a workers count under 1, spawning nothing", async () => {
    await assert.rejects(withLoad(async () => {}, { workers: 0 }), /workers must be at least 1/);
    assert.equal(await loadWorkersRemain(), false);
  });

  it("rejects a seconds bound under 1, spawning nothing", async () => {
    await assert.rejects(withLoad(async () => {}, { seconds: 0 }), /seconds must be at least 1/);
    assert.equal(await loadWorkersRemain(), false);
  });

  it("leaves no worker running when the harness process itself is killed with SIGTERM mid-run", async () => {
    const child = spawn("node", ["--input-type=module", "-e", harnessSubprocessCode(2, 30)], { stdio: "ignore" });
    try {
      await waitForWorkers();
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
      assert.equal(await loadWorkersRemain(), false, "a worker outlived the harness being SIGTERMed");
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  });

  it("leaves no worker running when the harness process times out externally", async () => {
    // `timeout`'s default signal is SIGTERM, delivered to the harness itself (never one of its workers),
    // so this proves the same cleanup trap fires for an externally-imposed deadline, not just a direct
    // SIGTERM sent by a caller that knows the pid.
    const child = spawn("timeout", ["1", "node", "--input-type=module", "-e", harnessSubprocessCode(2, 30)], {
      stdio: "ignore",
    });
    try {
      await waitForWorkers();
      await new Promise((resolve) => child.once("exit", resolve));
      assert.equal(await loadWorkersRemain(), false, "a worker outlived the harness timing out");
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  });

  it("reaps its workers at its own deadline while the caller blocks the process on a synchronous child", async () => {
    const code = `
      import("${loadMjsUrl}").then(({ withLoad }) => {
        withLoad(async () => {
          (await import("node:child_process")).spawnSync("sleep", ["30"]);
        }, { workers: 2, seconds: 2 });
      });
    `;
    const child = spawn("node", ["--input-type=module", "-e", code], { stdio: "ignore" });
    try {
      await waitForWorkers();
      await sleep(3500);
      assert.equal(child.exitCode, null, "the caller was meant to still be blocked");
      assert.equal(await loadWorkersRemain(), false, "a worker outlived the deadline while its caller was blocked");
    } finally {
      child.kill("SIGKILL");
    }
  });
});
