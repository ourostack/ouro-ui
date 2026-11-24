import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { FETCH_RETRIES, FETCH_RETRY_MS, freshMain, parseArgs } from "./fresh-main.mjs";
import { scratchDir } from "./scratch.mjs";

// A pull request that passes alone and a main that passes alone can fail together: fresh-main.mjs
// merges the newest main into the pull request and runs the checks there, and never passes for a
// main that moved while it ran.

const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const silent = () => {};

// A size check with a ceiling of 10 bytes over the combined files of the checkout.
const sizeCheck = ["node", "-e", "const fs=require('fs');const n=fs.readdirSync('.').filter(f=>f.startsWith('part-')).reduce((s,f)=>s+fs.statSync(f).size,0);process.exit(n>10?1:0)"];

function fixture() {
  const root = scratchDir("fresh-main-");
  const origin = join(root, "origin");
  const work = join(root, "work");
  mkdirSync(origin);
  git(origin, "init", "-b", "main");
  writeFileSync(join(origin, "part-base"), "1234");
  git(origin, "add", "-A");
  git(origin, "commit", "-m", "base");
  git(root, "clone", origin, work);
  git(work, "checkout", "-b", "pr");
  return { origin, work };
}

const land = (origin, file, size) => {
  writeFileSync(join(origin, file), "x".repeat(size));
  git(origin, "add", "-A");
  git(origin, "commit", "-m", file);
};

test("a pull request and a main that each fit a size ceiling but together exceed it fail", async () => {
  const { origin, work } = fixture();
  writeFileSync(join(work, "part-pr"), "x".repeat(4));
  git(work, "add", "-A");
  git(work, "commit", "-m", "pr");
  assert.equal(execFileSync(sizeCheck[0], sizeCheck.slice(1), { cwd: work }).length, 0, "the pull request alone fits");
  land(origin, "part-main", 4);
  assert.equal((await freshMain({ cwd: work, commands: [sizeCheck], log: silent })).ok, false);
});

test("a pull request that fits with the newest main passes, and says which main it tested", async () => {
  const { origin, work } = fixture();
  writeFileSync(join(work, "part-pr"), "xx");
  git(work, "add", "-A");
  git(work, "commit", "-m", "pr");
  land(origin, "part-main", 2);
  const result = await freshMain({ cwd: work, commands: [sizeCheck], log: silent });
  assert.equal(result.ok, true);
  assert.equal(result.tested, git(origin, "rev-parse", "main"));
});

test("a main that moves while the checks run is tested again, so a stale result never passes", async () => {
  const { origin, work } = fixture();
  writeFileSync(join(work, "part-pr"), "x".repeat(4));
  git(work, "add", "-A");
  git(work, "commit", "-m", "pr");
  const lands = ["node", "-e", `const {execFileSync:e}=require('child_process');const fs=require('fs');if(!fs.existsSync(${JSON.stringify(join(origin, "part-late"))})){fs.writeFileSync(${JSON.stringify(join(origin, "part-late"))},'x'.repeat(4));e('git',['add','-A'],{cwd:${JSON.stringify(origin)}});e('git',['-c','user.name=t','-c','user.email=t@example.com','commit','-m','late'],{cwd:${JSON.stringify(origin)}})}`];
  const result = await freshMain({ cwd: work, commands: [lands, sizeCheck], log: silent });
  assert.equal(result.ok, false, "the late main pushes the total over the ceiling");
  assert.equal(result.attempts, 2);
});

test("a pull request that conflicts with the newest main fails at once", async () => {
  const { origin, work } = fixture();
  writeFileSync(join(work, "part-base"), "changed");
  git(work, "commit", "-am", "pr");
  writeFileSync(join(origin, "part-base"), "other");
  git(origin, "commit", "-am", "main");
  assert.equal((await freshMain({ cwd: work, commands: [["true"]], log: silent })).ok, false);
});

// A fake git that never touches a real repository: `merge` fails as a promisor fetch would
// (`mergeFailures` times, or every time with `conflict: false`) or as a real conflict would
// (`conflict: true`, which leaves `MERGE_HEAD` set and fails every merge). Records every call.
function fakeGit({ mergeFailures = 0, conflict = false } = {}) {
  const calls = [];
  let mergeAttempts = 0;
  const git = (cwd, ...args) => {
    calls.push(args);
    const [command, ...rest] = args;
    if (command === "rev-parse" && rest[0] === "HEAD") return "head-sha";
    if (command === "reset" || command === "fetch") return "";
    if (command === "rev-parse" && rest[0] === "FETCH_HEAD") return "main-sha";
    if (command === "merge" && rest[0] === "--abort") return "";
    if (command === "merge") {
      mergeAttempts++;
      if (conflict) throw new Error("fatal: conflict");
      if (mergeAttempts <= mergeFailures) throw new Error("fatal: could not fetch deadbeef from promisor remote");
      return "";
    }
    if (command === "rev-parse" && rest[0] === "-q") {
      if (conflict) return "merge-head-sha";
      throw new Error("fatal: no MERGE_HEAD");
    }
    throw new Error(`fakeGit: unexpected call ${args.join(" ")}`);
  };
  return { git, calls };
}

const noWait = async () => {};

test("a merge that fails to fetch from the promisor remote retries instead of aborting, and succeeds once the fetch does", async () => {
  const { git, calls } = fakeGit({ mergeFailures: 2 });
  const logs = [];
  const result = await freshMain({ cwd: process.cwd(), commands: [["true"]], git, wait: noWait, log: (message) => logs.push(message) });
  assert.equal(result.ok, true);
  assert.equal(calls.filter((call) => call[0] === "merge" && call[1] === "--abort").length, 0, "a fetch failure never aborts a merge that was never in progress");
  assert.equal(logs.filter((message) => message.includes("retrying")).length, 2);
  assert.ok(!logs.some((message) => message.includes("rebase it")), "a fetch failure is not reported as a conflict");
});

test("a merge that fails to fetch from the promisor remote waits longer between each retry, and logs each try", async () => {
  const { git } = fakeGit({ mergeFailures: FETCH_RETRIES });
  const waits = [];
  const logs = [];
  const result = await freshMain({ cwd: process.cwd(), commands: [["true"]], git, wait: async (ms) => waits.push(ms), log: (message) => logs.push(message) });
  assert.equal(result.ok, true, "the last retry, within the budget, succeeds");
  assert.deepEqual(waits, Array.from({ length: FETCH_RETRIES }, (_, i) => FETCH_RETRY_MS * 2 ** i));
  for (let i = 1; i <= FETCH_RETRIES; i++) assert.ok(logs.some((message) => message.includes(`retrying (${i}/${FETCH_RETRIES})`)), `logs retry ${i}`);
});

test("a promisor fetch that never recovers fails as the fetch error it is, never as a conflict", async () => {
  const { git, calls } = fakeGit({ mergeFailures: FETCH_RETRIES + 1 });
  const logs = [];
  await assert.rejects(
    freshMain({ cwd: process.cwd(), commands: [["true"]], git, wait: noWait, log: (message) => logs.push(message) }),
    /could not fetch deadbeef from promisor remote/,
  );
  assert.equal(calls.filter((call) => call[0] === "merge" && call[1] === "--abort").length, 0, "no merge was ever in progress, so nothing is aborted");
  assert.ok(!logs.some((message) => message.includes("rebase it")), "an exhausted fetch failure is not reported as a conflict");
});

test("a real conflict aborts the merge in progress and reports it, without retrying", async () => {
  const { git, calls } = fakeGit({ conflict: true });
  const logs = [];
  const result = await freshMain({ cwd: process.cwd(), commands: [["true"]], git, wait: noWait, log: (message) => logs.push(message) });
  assert.equal(result.ok, false);
  assert.equal(calls.filter((call) => call[0] === "merge" && call[1] === "--abort").length, 1, "a real conflict is aborted");
  assert.ok(logs.some((message) => message.includes("rebase it")));
  assert.ok(!logs.some((message) => message.includes("retrying")), "a real conflict is not retried as a fetch failure");
});

test("parseArgs splits the commands after the first --", () => {
  assert.deepEqual(parseArgs(["--attempts", "2", "--", "a", "b", "--", "c"]), { branch: "main", attempts: 2, commands: [["a", "b"], ["c"]] });
});
