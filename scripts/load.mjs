// The one CPU-load harness for a test that proves its own timing holds under real contention (a sibling
// browser project starving this one's host process, #3314/#3785/#3788): every lane uses this instead of
// hand-rolling spin loops. Every worker is its own process group (so one signal reaches both the `timeout`
// wrapper and the busy loop beneath it, which `timeout`'s own SIGKILL cannot forward), reaped on every exit
// path: a normal return, a thrown error, this process receiving SIGTERM/SIGINT, or this process's own exit.
import { cpus } from "node:os";
import { spawnSync, spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

// A plain alphanumeric marker on each worker's own command line, so a pgrep can find them by substring
// alone, with no regex metacharacters of its own to escape (the busy-loop source itself has parentheses,
// which pgrep's own extended-regex matching would otherwise take as grouping).
const loadWorkerMarker = "ouro-load-worker";

/** At most this many workers run at once, so the process under test and this one both still get a core. */
export const maxLoadWorkers = () => Math.max(1, cpus().length - 2);

// Every process group this call started, so every exit path (including a synchronous 'exit' handler, where
// nothing async can run) can kill each one by its negative pgid in one signal.
const liveGroups = new Set();

function killGroupSync(pgid) {
  try {
    process.kill(-pgid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

function killAllLiveGroupsSync() {
  for (const pgid of liveGroups) killGroupSync(pgid);
  liveGroups.clear();
}

// Registered once per process, not per withLoad call, so a signal or exit during ANY call still reaches
// every group that call started. 'exit' handlers must be synchronous; process.kill is.
let trapsInstalled = false;
function installTrapsOnce() {
  if (trapsInstalled) return;
  trapsInstalled = true;
  process.on("exit", killAllLiveGroupsSync);
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
      killAllLiveGroupsSync();
      process.exit(1);
    });
  }
}

/**
 * Runs `fn` while CPU-busy worker processes compete for every other core, so a test can prove it still
 * passes (or, for a failing-first proof, still fails the same way) under genuine contention instead of a
 * mock. At most `maxLoadWorkers()` workers, never more. Each worker is spawned as its own process group
 * (`detached: true` sets the group; it is still this process's tracked, waited-on child, never `unref()`'d
 * or left to run unsupervised) wrapping a `timeout <seconds>` command, itself wrapping the busy loop, so one
 * `SIGKILL` to the negative group ID reaches both — unlike signalling the `timeout` process alone, which
 * cannot forward `SIGKILL` to the child it is monitoring (its own man page) and would orphan the busy loop.
 * Cleans up on every exit path: a normal return, a thrown `fn`, this process receiving SIGTERM/SIGINT, or
 * this process's own exit — so no child outlives `withLoad`, however it ends. Call `loadWorkersRemain`
 * after to independently confirm none outlived this call.
 */
export async function withLoad(fn, { workers = maxLoadWorkers(), seconds = 120 } = {}) {
  if (workers < 1) throw new Error("withLoad(): workers must be at least 1");
  if (seconds < 1) throw new Error("withLoad(): seconds must be at least 1");
  installTrapsOnce();
  const children = Array.from({ length: workers }, () =>
    spawn("timeout", [String(seconds), "node", "-e", "while (true);", loadWorkerMarker], {
      stdio: "ignore",
      detached: true,
    }),
  );
  for (const child of children) liveGroups.add(child.pid);
  try {
    return await fn();
  } finally {
    for (const child of children) {
      killGroupSync(child.pid);
      liveGroups.delete(child.pid);
    }
    await Promise.all(
      children.map((child) => (child.exitCode !== null || child.signalCode !== null ? undefined : new Promise((resolve) => child.once("exit", resolve)))),
    );
    // Independent, process-table-level backstop beyond the group kill above: sweep by marker in case any
    // worker's own `timeout`/node pairing ever fell outside its own group (should not happen, but this is
    // the same check a lane runs by hand, and it is cheap insurance against a platform-specific surprise).
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const pids = await markedWorkerPids();
      if (pids.length === 0) break;
      for (const pid of pids) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Already gone between the pgrep snapshot and this kill.
        }
      }
      await sleep(200);
    }
  }
}

/** PIDs of every still-running process carrying this file's load-worker marker on its command line. */
function markedWorkerPids() {
  const result = spawn("pgrep", ["-f", loadWorkerMarker], { stdio: ["ignore", "pipe", "ignore"] });
  return new Promise((resolve, reject) => {
    let out = "";
    result.stdout.on("data", (chunk) => void (out += chunk));
    result.on("error", reject);
    result.on("exit", (code) => {
      if (code !== 0 && code !== 1) {
        reject(new Error(`pgrep exited with code ${code}`));
        return;
      }
      resolve(
        out
          .split("\n")
          .map((line) => Number.parseInt(line, 10))
          .filter((pid) => Number.isInteger(pid)),
      );
    });
  });
}

/**
 * Whether any load worker is still alive anywhere on this machine, checked the way a lane checks it by
 * hand: an empty `pgrep` for each worker's own marker argument. `withLoad` already cleans up its own
 * children on every exit path; this is the independent, process-table-level confirmation that none
 * outlived it, which a lane or a test runs as the final word.
 */
export async function loadWorkersRemain() {
  return (await markedWorkerPids()).length > 0;
}

/**
 * Synchronous, out-of-process check used only by tests that kill a harness subprocess and must confirm
 * immediately afterward, with no async gap in which something new could spawn. Equivalent to
 * `loadWorkersRemain`, blocking.
 */
export function loadWorkersRemainSync() {
  const result = spawnSync("pgrep", ["-f", loadWorkerMarker], { encoding: "utf8" });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`pgrep exited with code ${result.status}`);
  }
  return result.stdout.trim().length > 0;
}
