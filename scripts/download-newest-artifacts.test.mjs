import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { downloadNewest, newestPerName } from "./download-newest-artifacts.mjs";

// A rerun of a run uploads each shard's artifact again under the same name, so the run lists
// `coverage-browser-14` twice (#3933).

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const yml = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const artifact = (id, name, created_at, expired = false) => ({ id, name, created_at, expired });
const rerun = [
  artifact(1, "coverage-browser-14", "2026-11-26T10:00:00Z"),
  artifact(2, "coverage-browser-13", "2026-11-26T10:00:00Z"),
  artifact(3, "coverage-browser-14", "2026-11-26T11:00:00Z"),
  artifact(4, "motion-browser-14", "2026-11-26T11:00:00Z"),
  artifact(5, "coverage-browser-12", "2026-11-26T09:00:00Z", true),
];

test("a name listed twice by a rerun is downloaded once, from its latest copy", async () => {
  const fetched = [];
  const unzipped = [];
  const names = await downloadNewest(
    { list: async () => rerun, fetchZip: async (id) => (fetched.push(id), Buffer.from(String(id))), unzip: (zip, to) => unzipped.push([String(zip), to]) },
    "coverage-browser-",
    "/c",
  );
  assert.deepEqual(names, ["coverage-browser-13", "coverage-browser-14"]);
  assert.deepEqual(fetched, [2, 3]);
  assert.deepEqual(unzipped, [["2", "/c/coverage-browser-13"], ["3", "/c/coverage-browser-14"]]);
});

test("a copy that cannot be read falls back to the one before it, and a name with none fails", async () => {
  const unzipped = [];
  const io = (readable) => ({ list: async () => rerun, fetchZip: async (id) => (readable.includes(id) ? Buffer.from(String(id)) : null), unzip: (zip, to) => unzipped.push([String(zip), to]) });
  await downloadNewest(io([1, 2]), "coverage-browser-", "/c");
  assert.deepEqual(unzipped, [["2", "/c/coverage-browser-13"], ["1", "/c/coverage-browser-14"]]);
  await assert.rejects(downloadNewest(io([2]), "coverage-browser-", "/c"), /no copy of coverage-browser-14 can be downloaded/);
});

test("newestPerName keeps the prefix's names only, newest first, and drops expired copies", () => {
  const found = newestPerName(rerun, "coverage-browser-");
  assert.deepEqual([...found.keys()], ["coverage-browser-14", "coverage-browser-13"]);
  assert.deepEqual(found.get("coverage-browser-14").map((copy) => copy.id), [3, 1]);
});

test("the coverage job reads the browser shards' coverage and motion through it, not through download-artifact", () => {
  const job = yml.split("\njobs:\n")[1].split(/\n(?= {2}[\w-]+:\n)/).find((block) => block.startsWith("  coverage:"));
  assert.match(job, /^ {4}permissions:\n {6}contents: read\n {6}actions: read\n/m);
  for (const prefix of ["coverage-browser-", "motion-browser-"]) {
    assert.match(job, new RegExp(`node scripts/download-newest-artifacts\\.mjs ${prefix} "\\$RUNNER_TEMP/`));
  }
  assert.doesNotMatch(job, /pattern: (coverage|motion)-browser-/);
});
