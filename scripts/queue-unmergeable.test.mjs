import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { URL } from "node:url";
import { conflictComment, conflictedPaths, logLine, mergeVerdict, pickUnmergeable } from "./queue-unmergeable.mjs";
import { scratchDir } from "./scratch.mjs";

test("pickUnmergeable takes the first UNMERGEABLE entry in queue order, and nothing when none is", () => {
  const entries = [{ state: "AWAITING_CHECKS", n: 1 }, { state: "UNMERGEABLE", n: 2 }, { state: "UNMERGEABLE", n: 3 }];
  assert.equal(pickUnmergeable(entries).n, 2);
  assert.equal(pickUnmergeable(entries.slice(0, 1)), undefined);
});

test("mergeVerdict reads git merge-tree's exit code: 0 clean, 1 conflict, else unknown", () => {
  assert.deepEqual([0, 1, 2, 128].map(mergeVerdict), ["clean", "conflict", "unknown", "unknown"]);
});

test("a real conflict is a conflict with its file named, and a disjoint change merges clean", () => {
  const dir = scratchDir("queue-unmergeable");
  const git = (...args) => execFileSync("git", ["-C", dir, "-c", "user.email=a@b.c", "-c", "user.name=t", ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.txt"), "one\n");
  writeFileSync(join(dir, "b.txt"), "one\n");
  git("add", ".");
  git("commit", "-qm", "base");
  git("checkout", "-qb", "pr");
  writeFileSync(join(dir, "a.txt"), "pr\n");
  git("commit", "-qam", "pr");
  git("checkout", "-q", "main");
  writeFileSync(join(dir, "b.txt"), "main\n");
  git("commit", "-qam", "main b");
  assert.doesNotThrow(() => git("merge-tree", "--write-tree", "main", "pr"));
  writeFileSync(join(dir, "a.txt"), "main\n");
  git("commit", "-qam", "main a");
  let out = "";
  let code = 0;
  try {
    git("merge-tree", "--write-tree", "--name-only", "main", "pr");
  } catch (error) {
    code = error.status;
    out = String(error.stdout);
  }
  assert.equal(mergeVerdict(code), "conflict");
  assert.deepEqual(conflictedPaths(out), ["a.txt"]);
  assert.equal(readFileSync(join(dir, "b.txt"), "utf8"), "main\n");
});

test("the log line and the ping say what was done and name the conflicting files", () => {
  assert.match(logLine({ number: 7, position: 1, verdict: "clean" }), /#7 \(queue position 1\).*re-armed/);
  assert.match(logLine({ number: 7, position: 1, verdict: "conflict", paths: ["a.txt"] }), /1 file\(s\): `a\.txt`/);
  assert.match(logLine({ number: 7, position: 1, verdict: "unknown" }), /could not run/);
  assert.match(conflictComment({ author: "me", paths: ["a.txt", "b.txt"] }), /^@me .*\n\n- `a\.txt`\n- `b\.txt`$/s);
});

test("the workflow runs every 10 minutes by hand or schedule, one run at a time, through the script", () => {
  const text = readFileSync(new URL("../.github/workflows/queue-unmergeable.yml", import.meta.url), "utf8");
  assert.match(text, /cron: "\*\/10 \* \* \* \*"/);
  assert.match(text, /workflow_dispatch:/);
  assert.match(text, /cancel-in-progress: false/);
  assert.match(text, /node scripts\/queue-unmergeable\.mjs run/);
  assert.doesNotMatch(text, /pull_request(_target)?:/);
  assert.doesNotMatch(text, /github\.token/);
  assert.match(text, /test -n "\$GH_TOKEN"/);
});
