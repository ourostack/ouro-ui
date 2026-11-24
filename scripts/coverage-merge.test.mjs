import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { doubledFiles, mergeCoverage, mismatchedShapes, reconcileDuplicateTails, thresholds } from "./coverage-merge.mjs";

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

test("with labels, a short file names the labelled shards behind a short share of it", async () => {
  const merged = await mergeCoverage(
    [map("/a.ts", { s: [1, 0], f: [1], b: [1, 1] }), map("/a.ts", { s: [1, 0], f: [1], b: [1, 1] }), map("/b.ts", { s: [1, 1], f: [1], b: [1, 1] })],
    ["browser-6", "browser-21", "browser-9"],
  );
  assert.deepEqual(merged.short, [{ file: "/a.ts", metrics: { lines: 50, statements: 50 }, lines: ["2"], by: [{ shard: "browser-6", metrics: { lines: 50, statements: 50 } }, { shard: "browser-21", metrics: { lines: 50, statements: 50 } }] }]);
});

test("with labels, a shard whose map lacks a short file is left out of its by-shard list", async () => {
  const merged = await mergeCoverage([map("/a.ts", { s: [1, 0], f: [1], b: [1, 0] }), map("/other.ts", { s: [1, 1], f: [1], b: [1, 1] })], ["touches-a", "untouched"]);
  assert.deepEqual(merged.short, [{ file: "/a.ts", metrics: { lines: 50, statements: 50, branches: 50 }, lines: ["2"], by: [{ shard: "touches-a", metrics: { lines: 50, statements: 50, branches: 50 } }] }]);
});

/** Issue #3082's actual recurrence on main at bc4201c: a shard reporting 0% of its own share of a file was named as 62% short alongside the genuinely doubled shard, because merging had mutated the clean shard's own map in place. */
test("merging a shard that covers a statement into one that doesn't must not change the other's own share", async () => {
  const merged = await mergeCoverage([map("/a.ts", { s: [0, 0] }), map("/a.ts", { s: [0, 1] })], ["clean", "covers-one"]);
  assert.deepEqual(merged.short, [
    { file: "/a.ts", metrics: { lines: 50, branches: 0, functions: 0, statements: 50 }, lines: ["1"], by: [
      { shard: "clean", metrics: { lines: 0, branches: 0, functions: 0, statements: 0 } },
      { shard: "covers-one", metrics: { lines: 50, branches: 0, functions: 0, statements: 50 } },
    ] },
  ]);
});

/** A file instrumented twice in the same shard run (issue #3082): the second copy's locations don't match the first's, so every map holds the original entries plus a disjoint second set under new keys. */
const doubled = (file) => ({
  [file]: {
    path: file,
    statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 9 } }, 1: { start: { line: 2, column: 0 }, end: { line: 2, column: 9 } }, 2: { start: { line: 1, column: 0 }, end: { line: 1, column: 9 } }, 3: { start: { line: 2, column: 0 }, end: { line: 2, column: 9 } } },
    fnMap: { 0: { name: "f", decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }, loc: { start: { line: 1, column: 0 }, end: { line: 2, column: 9 } }, line: 1 }, 1: { name: "f", decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }, loc: { start: { line: 1, column: 0 }, end: { line: 2, column: 9 } }, line: 1 } },
    branchMap: {},
    s: { 0: 1, 1: 0, 2: 0, 3: 0 },
    f: { 0: 1, 1: 0 },
    b: {},
  },
});

test("doubledFiles finds a file whose own map holds a source location under two different keys", () => {
  assert.deepEqual(doubledFiles(doubled("/a.ts")), [{ file: "/a.ts", duplicates: 3 }]);
});

test("doubledFiles leaves a file alone when every location is unique", () => {
  assert.deepEqual(doubledFiles(map("/a.ts")), []);
});

/** A file instrumented under two module graphs in the same shard (#3082's actual recurrence): the second copy's statement boundaries land at new, non-exact-duplicate locations, so `doubledFiles`'s exact location match can't see it — only comparing this shard's shape against the other shards measuring the same file can. */
const reshaped = (file) => ({
  [file]: {
    path: file,
    statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 9 } }, 1: { start: { line: 2, column: 0 }, end: { line: 2, column: 9 } }, 2: { start: { line: 1, column: 0 }, end: { line: 1, column: 8 } } },
    fnMap: { 0: { name: "f", decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }, loc: { start: { line: 1, column: 0 }, end: { line: 2, column: 9 } }, line: 1 } },
    branchMap: { 0: { type: "if", line: 2, loc: { start: { line: 2, column: 0 }, end: { line: 2, column: 9 } }, locations: [{ start: { line: 2, column: 0 }, end: { line: 2, column: 4 } }, { start: { line: 2, column: 5 }, end: { line: 2, column: 9 } }] } },
    s: { 0: 1, 1: 0, 2: 1 },
    f: { 0: 1 },
    b: { 0: [1, 0] },
  },
});

test("mismatchedShapes finds a shard whose map disagrees in shape with the other shards measuring the same file", () => {
  assert.deepEqual(mismatchedShapes([map("/a.ts"), reshaped("/a.ts"), map("/a.ts")], ["browser-1", "browser-6", "browser-11"]), [{ file: "/a.ts", shard: "browser-6" }]);
});

test("mismatchedShapes leaves a file alone when every shard that measured it agrees on its shape", () => {
  assert.deepEqual(mismatchedShapes([map("/a.ts"), map("/a.ts")], ["browser-1", "browser-6"]), []);
});

test("mismatchedShapes leaves a file alone when only one shard measured it, with nothing to compare it against", () => {
  assert.deepEqual(mismatchedShapes([reshaped("/a.ts")], ["browser-6"]), []);
});

/**
 * Shard 17's actual recurrence (CI run 45293019910, flake log #2469): `@vitest/coverage-istanbul`'s
 * "uncovered files" pass instruments a file none of that shard's projects executed through one
 * shared, non-reentrant instrumenter; when two of the shard's projects raced to do that for the
 * same never-executed file, the second landed its own copy at new locations with zero hits
 * throughout, appended after the first copy's locations (which exactly repeat the healthy shards').
 */
const duplicateTail = (file, { s = [0, 0], f = [0], b = [0, 0] } = {}) => ({
  [file]: {
    path: file,
    statementMap: {
      0: { start: { line: 1, column: 0 }, end: { line: 1, column: 9 } },
      1: { start: { line: 2, column: 0 }, end: { line: 2, column: 9 } },
      2: { start: { line: 1, column: 0 }, end: { line: 1, column: 8 } },
    },
    fnMap: {
      0: { name: "f", decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }, loc: { start: { line: 1, column: 0 }, end: { line: 2, column: 9 } }, line: 1 },
      1: { name: "f", decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }, loc: { start: { line: 1, column: 0 }, end: { line: 2, column: 8 } }, line: 1 },
    },
    branchMap: {
      0: { type: "if", line: 2, loc: { start: { line: 2, column: 0 }, end: { line: 2, column: 9 } }, locations: [{ start: { line: 2, column: 0 }, end: { line: 2, column: 4 } }, { start: { line: 2, column: 5 }, end: { line: 2, column: 9 } }] },
      1: { type: "if", line: 2, loc: { start: { line: 2, column: 0 }, end: { line: 2, column: 8 } }, locations: [{ start: { line: 2, column: 0 }, end: { line: 2, column: 3 } }, { start: { line: 2, column: 4 }, end: { line: 2, column: 8 } }] },
    },
    s: { 0: s[0], 1: s[1], 2: 0 },
    f: { 0: f[0], 1: 0 },
    b: { 0: b, 1: [0, 0] },
  },
});

test("reconcileDuplicateTails trims a shard's own zero-hit duplicate tail back to the majority shape", () => {
  const { maps, notes } = reconcileDuplicateTails([map("/people-cache.ts"), map("/people-cache.ts"), duplicateTail("/people-cache.ts")], ["browser-6", "browser-21", "browser-17"]);
  assert.deepEqual(notes, [{ file: "/people-cache.ts", shard: "browser-17" }]);
  assert.deepEqual(maps[2], map("/people-cache.ts"));
  assert.deepEqual(mismatchedShapes(maps, ["browser-6", "browser-21", "browser-17"]), []);
});

test("reconcileDuplicateTails leaves a shard alone when its extra entries hold even one hit", () => {
  const withAHit = duplicateTail("/people-cache.ts", { s: [0, 0] });
  withAHit["/people-cache.ts"].s[2] = 1;
  const { maps, notes } = reconcileDuplicateTails([map("/people-cache.ts"), map("/people-cache.ts"), withAHit], ["browser-6", "browser-21", "browser-17"]);
  assert.deepEqual(notes, []);
  assert.deepEqual(maps[2], withAHit);
});

test("reconcileDuplicateTails leaves a shard alone when it disagrees with the majority on a location they both claim to share", () => {
  const disagreeing = duplicateTail("/people-cache.ts");
  disagreeing["/people-cache.ts"].statementMap[1] = { start: { line: 2, column: 0 }, end: { line: 2, column: 11 } };
  const { maps, notes } = reconcileDuplicateTails([map("/people-cache.ts"), map("/people-cache.ts"), disagreeing], ["browser-6", "browser-21", "browser-17"]);
  assert.deepEqual(notes, []);
  assert.deepEqual(maps[2], disagreeing);
});

test("reconcileDuplicateTails leaves a file alone when no shard majority exists to reconcile it against", () => {
  const { maps, notes } = reconcileDuplicateTails([duplicateTail("/people-cache.ts")], ["browser-17"]);
  assert.deepEqual(notes, []);
  assert.deepEqual(maps[0], duplicateTail("/people-cache.ts"));
});

/** The exact shard-17 symptom reconciled before merging: the zero-hit duplicate never changes a healthy merge's result, so coverage still reports whatever the shards that actually executed the file measured. */
test("the command merges cleanly, noting the reconciliation, when a shard's extra shape is only an unexecuted, zero-hit duplicate", () => {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  const dir = mkdtempSync(join(root, ".tmp/coverage-merge-"));
  const write = (shard, coverage) => {
    mkdirSync(join(dir, `coverage-browser-${shard}`), { recursive: true });
    writeFileSync(join(dir, `coverage-browser-${shard}/coverage-final.json`), JSON.stringify(coverage));
  };
  write(6, map("/people-cache.ts", { s: [1, 1], f: [1], b: [1, 1] }));
  write(17, duplicateTail("/people-cache.ts"));
  write(21, map("/people-cache.ts", { s: [1, 1], f: [1], b: [1, 1] }));
  const run = (...args) => spawnSync(process.execPath, [join(root, "scripts/coverage-merge.mjs"), dir, ...args], { encoding: "utf8" });
  const result = run("--shards", "3");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^coverage-browser-17's own coverage-final\.json instrumented \/people-cache\.ts twice \(an unexecuted file instrumented once per project that raced to do so, flake log #2469\); kept only the measured copy\.$/m);
  assert.match(result.stdout, /^Coverage of 1 files, merged from 3 shards: lines 100%/m);
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
  assert.match(short.stdout, /^\/c\.ts: lines 50%, statements 50%; lines no test reached: 2; by shard: coverage-browser-3 \(lines 50%, statements 50%\)$/m);
  assert.match(short.stdout, /::error::Coverage is short of 100% in 1 file/);
  assert.equal(run().status, 2);
});

test("the command fails loudly, naming the shard, when a shard's own file was instrumented twice", () => {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  const dir = mkdtempSync(join(root, ".tmp/coverage-merge-"));
  const write = (shard, coverage) => {
    mkdirSync(join(dir, `coverage-browser-${shard}`), { recursive: true });
    writeFileSync(join(dir, `coverage-browser-${shard}/coverage-final.json`), JSON.stringify(coverage));
  };
  write(6, map("/people-cache.ts", { s: [1, 1], f: [1], b: [1, 1] }));
  write(15, doubled("/people-cache.ts"));
  const run = (...args) => spawnSync(process.execPath, [join(root, "scripts/coverage-merge.mjs"), dir, ...args], { encoding: "utf8" });
  const result = run("--shards", "2");
  assert.equal(result.status, 4);
  assert.match(result.stderr, /::error::coverage-browser-15's own coverage-final\.json instruments \/people-cache\.ts twice \(3 duplicate locations\): merging it would make a fully covered file look short\. Rerun that shard instead of chasing the file\./);
  assert.equal(result.stdout, "", "a doubled shard stops before reporting a misleading merged percentage");
});

/** Issue #3082's actual recurrence: a shard's own map had more statement entries for a file than every other shard measuring it, at locations that didn't exactly repeat the others', so `doubledFiles` found nothing and the merge reported the wrong shard short. */
test("the command fails loudly, naming the shard, when a shard's own file disagrees in shape with the other shards measuring it", () => {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  const dir = mkdtempSync(join(root, ".tmp/coverage-merge-"));
  const write = (shard, coverage) => {
    mkdirSync(join(dir, `coverage-browser-${shard}`), { recursive: true });
    writeFileSync(join(dir, `coverage-browser-${shard}/coverage-final.json`), JSON.stringify(coverage));
  };
  write(1, map("/people-cache.ts", { s: [1, 1], f: [1], b: [1, 1] }));
  write(6, reshaped("/people-cache.ts"));
  write(11, map("/people-cache.ts", { s: [1, 1], f: [1], b: [1, 1] }));
  const run = (...args) => spawnSync(process.execPath, [join(root, "scripts/coverage-merge.mjs"), dir, ...args], { encoding: "utf8" });
  const result = run("--shards", "3");
  assert.equal(result.status, 4);
  assert.match(
    result.stderr,
    /::error::coverage-browser-6's own coverage-final\.json instruments \/people-cache\.ts differently from the other shards that measured it \(a different number of statement, function or branch map entries\): merging it would make a fully covered file look short\. Rerun that shard instead of chasing the file\./,
  );
  assert.equal(result.stdout, "", "a mismatched shard stops before reporting a misleading merged percentage");
});
