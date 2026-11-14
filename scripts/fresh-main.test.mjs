import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { freshMain, parseArgs } from "./fresh-main.mjs";
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

test("a pull request and a main that each fit a size ceiling but together exceed it fail", () => {
  const { origin, work } = fixture();
  writeFileSync(join(work, "part-pr"), "x".repeat(4));
  git(work, "add", "-A");
  git(work, "commit", "-m", "pr");
  assert.equal(execFileSync(sizeCheck[0], sizeCheck.slice(1), { cwd: work }).length, 0, "the pull request alone fits");
  land(origin, "part-main", 4);
  assert.equal(freshMain({ cwd: work, commands: [sizeCheck], log: silent }).ok, false);
});

test("a pull request that fits with the newest main passes, and says which main it tested", () => {
  const { origin, work } = fixture();
  writeFileSync(join(work, "part-pr"), "xx");
  git(work, "add", "-A");
  git(work, "commit", "-m", "pr");
  land(origin, "part-main", 2);
  const result = freshMain({ cwd: work, commands: [sizeCheck], log: silent });
  assert.equal(result.ok, true);
  assert.equal(result.tested, git(origin, "rev-parse", "main"));
});

test("a main that moves while the checks run is tested again, so a stale result never passes", () => {
  const { origin, work } = fixture();
  writeFileSync(join(work, "part-pr"), "x".repeat(4));
  git(work, "add", "-A");
  git(work, "commit", "-m", "pr");
  const lands = ["node", "-e", `const {execFileSync:e}=require('child_process');const fs=require('fs');if(!fs.existsSync(${JSON.stringify(join(origin, "part-late"))})){fs.writeFileSync(${JSON.stringify(join(origin, "part-late"))},'x'.repeat(4));e('git',['add','-A'],{cwd:${JSON.stringify(origin)}});e('git',['-c','user.name=t','-c','user.email=t@example.com','commit','-m','late'],{cwd:${JSON.stringify(origin)}})}`];
  const result = freshMain({ cwd: work, commands: [lands, sizeCheck], log: silent });
  assert.equal(result.ok, false, "the late main pushes the total over the ceiling");
  assert.equal(result.attempts, 2);
});

test("a pull request that conflicts with the newest main fails at once", () => {
  const { origin, work } = fixture();
  writeFileSync(join(work, "part-base"), "changed");
  git(work, "commit", "-am", "pr");
  writeFileSync(join(origin, "part-base"), "other");
  git(origin, "commit", "-am", "main");
  assert.equal(freshMain({ cwd: work, commands: [["true"]], log: silent }).ok, false);
});

test("parseArgs splits the commands after the first --", () => {
  assert.deepEqual(parseArgs(["--attempts", "2", "--", "a", "b", "--", "c"]), { branch: "main", attempts: 2, commands: [["a", "b"], ["c"]] });
});
