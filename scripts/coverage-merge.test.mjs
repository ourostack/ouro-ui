import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { mergeCoverage, thresholds } from "./coverage-merge.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** An istanbul coverage map of one file with two statements, one function and one branch with two paths. */
const map = (file, { s = [0, 0], f = [0], b = [0, 0] } = {}) => ({
  [file]: {
    path: file,
    statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 9 } }, 1: { start: { line: 2, column: 0 }, end: { line: 2, column: 9 } } },
    fnMap: { 0: { name: "f", decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }, loc: { start: { line: 1, column: 0 }, end: { line: 2, column: 9 } }, line: 1 } },
    branchMap: { 0: { type: "if", line: 2, loc: { start: { line: 2, column: 0 }, end: { line: 2, column: 9 } }, locations: [{ start: { line: 2, column: 0 }, end: { line: 2, column: 4 } }, { start: { line: 2, column: 5 }, end: { line: 2, column: 9 } }] } },
    s: { 0: s[0], 1: s[1] },
    f: { 0: f[0] },
    b: { 0: b },
  },
});

test("two shards that each reach part of a file reach all of it together", async () => {
  const merged = await mergeCoverage([map("/a.ts", { s: [1, 0], f: [1], b: [1, 0] }), map("/a.ts", { s: [0, 2], b: [0, 1] })]);
  assert.deepEqual(merged, { files: 1, totals: { lines: 100, branches: 100, functions: 100, statements: 100 }, short: [] });
});

test("a line no shard reached is named, with the metrics it lowers", async () => {
  const merged = await mergeCoverage([map("/a.ts", { s: [1, 0], f: [1], b: [1, 1] }), map("/b.ts", { s: [1, 1], f: [1], b: [1, 1] })]);
  assert.equal(merged.files, 2);
  assert.deepEqual(merged.short, [{ file: "/a.ts", metrics: { lines: 50, statements: 50 }, lines: ["2"] }]);
  assert.equal(merged.totals.statements, 75);
});

test("the merge holds the shards to the thresholds vitest.config.ts holds an unsharded run to", async () => {
  const config = (await import("../vitest.config.ts")).default;
  assert.deepEqual(config.test.coverage.thresholds, thresholds);
});

test("the command fails when a shard's coverage is missing, and when the merge is short", () => {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  const dir = mkdtempSync(join(root, ".tmp/coverage-merge-"));
  const write = (shard, coverage) => {
    mkdirSync(join(dir, `coverage-browser-${shard}`), { recursive: true });
    writeFileSync(join(dir, `coverage-browser-${shard}/coverage-final.json`), JSON.stringify(coverage));
  };
  const run = (...args) => spawnSync(process.execPath, [join(root, "scripts/coverage-merge.mjs"), dir, ...args], { encoding: "utf8" });
  write(1, map("/a.ts", { s: [1, 0], f: [1], b: [1, 1] }));
  assert.equal(run("--shards", "2").status, 3);
  write(2, map("/a.ts", { s: [0, 1] }));
  const passed = run("--shards", "2");
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /^Coverage of 1 files, merged from 2 shards: lines 100%/m);
  write(3, map("/c.ts", { s: [1, 0], f: [1], b: [1, 1] }));
  const short = run("--shards", "3");
  assert.equal(short.status, 1);
  assert.match(short.stdout, /^\/c\.ts: lines 50%, statements 50%; lines no test reached: 2$/m);
  assert.match(short.stdout, /::error::Coverage is short of 100% in 1 file/);
  assert.equal(run().status, 2);
});
