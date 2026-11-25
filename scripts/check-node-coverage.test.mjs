import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

import { checkAlone, groups, included, onlyIncluded, pagesA, selectionFlags } from "./check-node-coverage.mjs";
import { scratchDir } from "./scratch.mjs";

const tool = fileURLToPath(new URL("./check-node-coverage.mjs", import.meta.url));
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

test("onlyIncluded keeps the scripts of the included files and drops the rest", () => {
  const url = (file) => pathToFileURL(join(root, file)).href;
  const kept = { url: url(included[0]), functions: [] };
  const report = onlyIncluded({ timestamp: 1, result: [{ url: "node:fs", functions: [] }, kept, { url: url("scripts/check/kit.mts"), functions: [] }], "source-map-cache": {} });
  assert.deepEqual(report, { timestamp: 1, result: [kept], "source-map-cache": {} });
});

test("merge fails, naming the group, when a group's coverage is missing", () => {
  const dir = scratchDir("check-coverage");
  mkdirSync(join(dir, "pages-a"));
  const merged = spawnSync(process.execPath, [tool, "merge", dir], { encoding: "utf8" });
  assert.equal(merged.status, 1);
  assert.match(merged.stderr, /No coverage from group pages-b, rules-command, watch-small, check-rules, check-shards, check/);
});

test("merge holds the groups' raw coverage to 100%: a run that leaves included files unloaded or uncovered fails", () => {
  const dir = scratchDir("check-coverage-gate");
  for (const name of Object.keys(groups)) mkdirSync(join(dir, name));
  writeFileSync(join(dir, "check/coverage-1-1-1.json"), JSON.stringify({ result: [{ scriptId: "1", url: pathToFileURL(join(root, included[0])).href, functions: [] }] }));
  const merged = spawnSync(process.execPath, [tool, "merge", dir], { encoding: "utf8" });
  assert.equal(merged.status, 1);
  assert.match(merged.stdout, /no test loaded registry\/ouro\/check\/serve\.ts/);
});

test("the groups run every file scripts/check.test.mjs runs, and every check-pages test falls in exactly one of the two page groups", () => {
  const single = readFileSync(new URL("./check.test.mjs", import.meta.url), "utf8");
  const files = [...single.matchAll(/"scripts\/check\/([\w-]+\.test\.mts)"/g)].map((match) => match[1]).sort();
  assert.deepEqual([...new Set(Object.values(groups).flatMap((group) => group.files))].map((file) => file.slice("scripts/check/".length)).sort(), files);
  const titles = [...readFileSync(new URL("./check/check-pages.test.mts", import.meta.url), "utf8").matchAll(/^ {2}test\((["`])(.*?)\1, /gm)].map((match) => match[2]);
  assert.ok(titles.length >= 20);
  const inA = (title) => new RegExp(groups["pages-a"].pattern).test(`Ouro check > ${title}`);
  const inB = (title) => !new RegExp(groups["pages-b"].skip).test(`Ouro check > ${title}`);
  for (const title of titles) assert.notEqual(inA(title), inB(title), title);
  assert.equal(titles.filter(inA).length, pagesA.length);
});

test("every check.test.mts test falls in exactly one of its three groups", () => {
  const titles = [...readFileSync(new URL("./check/check.test.mts", import.meta.url), "utf8").matchAll(/^ {2}test\((["`])(.*?)\1, /gm)].map((match) => match[2]);
  assert.ok(titles.length >= 16);
  const names = ["check-rules", "check-shards", "check"];
  const runs = (name, title) => { const g = groups[name]; const full = `Ouro check > ${title}`; return g.pattern ? new RegExp(g.pattern).test(full) : !new RegExp(g.skip).test(full); };
  for (const title of titles) assert.equal(names.filter((name) => runs(name, title)).length, 1, title);
  for (const [index, name] of checkAlone.entries()) assert.equal(titles.filter((title) => runs(names[index], title)).length, 1, name);
});

test("run by Node itself, each check test runs in exactly one group", () => {
  const dir = scratchDir("check-groups-run");
  const ran = new Map();
  const real = new Map();
  for (const file of ["check", "check-pages"]) {
    const titles = [...readFileSync(join(root, `scripts/check/${file}.test.mts`), "utf8").matchAll(/^ {2}test\((["`])(.*?)\1, /gm)].map((match) => match[2]);
    assert.ok(titles.length >= 16);
    real.set(file, titles);
    writeFileSync(join(dir, `${file}.test.mjs`), `import { describe, test } from "node:test";\ndescribe("Ouro check", () => {\n${titles.map((title) => `test(${JSON.stringify(title)}, () => {});`).join("\n")}\n});\n`);
  }
  for (const [name, group] of Object.entries(groups)) {
    const stubs = group.files.map((file) => join(dir, file.split("/").pop().replace(".mts", ".mjs")));
    const out = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...selectionFlags(group), ...stubs], { encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT")) }).stdout;
    for (const match of out.matchAll(/^ {4}ok \d+ - (.*)$/gm)) {
      ran.set(match[1], [...new Set([...(ran.get(match[1]) ?? []), name])]);
    }
  }
  for (const [file, titles] of real) {
    for (const title of titles) {
      const names = (ran.get(title) ?? []).filter((name) => groups[name].files.some((f) => f.endsWith(`${file}.test.mts`)));
      assert.equal(names.length, 1, `${title} ran in: ${names.join(", ") || "no group"}`);
    }
  }
});
