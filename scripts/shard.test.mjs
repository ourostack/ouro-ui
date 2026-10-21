import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { balance, collectTimings, installFiles, installShard, parseShard, readTimings, scriptTestFiles, shardKeys, slicedSuites } from "./shard.mjs";
import { shardArgument, TimedSequencer } from "./vitest-shards.mts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const scratch = () => {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  return mkdtempSync(join(root, ".tmp/shard-"));
};

test("the longest file goes first, each to the shard with the least so far", () => {
  const shards = balance(["a", "b", "c", "d", "e"], 2, { a: 50, b: 40, c: 30, d: 20, e: 10 });
  assert.deepEqual(shards, [
    { keys: ["a", "d", "e"], weight: 80 },
    { keys: ["b", "c"], weight: 70 },
  ]);
  // Every key lands in exactly one shard, and a shard with nothing to take stays empty.
  assert.deepEqual(balance(["a"], 3, {}).map((shard) => shard.keys), [["a"], [], []]);
});

test("a file with no measured time weighs the median of the measured ones, and equal weights split by name", () => {
  const shards = balance(["slow", "new-1", "new-2", "fast"], 2, { slow: 90, fast: 10, other: 30 });
  // The median of 90, 10 and 30 is 30, so each new file weighs 30.
  assert.deepEqual(shards.map((shard) => shard.weight), [90, 70]);
  assert.deepEqual(balance(["b", "a", "c", "d"], 2, {}).map((shard) => shard.keys), [["a", "c"], ["b", "d"]]);
});

test("the same files and times give the same shards in any order", () => {
  const timings = { a: 5, b: 9, c: 1, d: 9, e: 3 };
  assert.deepEqual(balance(["e", "d", "c", "b", "a"], 3, timings), balance(["a", "b", "c", "d", "e"], 3, timings));
  const all = [1, 2, 3].flatMap((index) => shardKeys(["a", "b", "c", "d", "e"], { index, count: 3 }, timings));
  assert.deepEqual(all.sort(), ["a", "b", "c", "d", "e"]);
});

test("a shard is <index>/<count>, as Vitest and Playwright take it", () => {
  assert.deepEqual(parseShard("2/6"), { index: 2, count: 6 });
  for (const bad of ["0/3", "4/3", "3", "a/b", undefined]) assert.throws(() => parseShard(bad), /<index>\/<count>/);
  assert.equal(shardArgument(["node", "vitest", "run", "--shard=2/6"]), "2/6");
  assert.equal(shardArgument(["node", "vitest", "run", "--shard", "3/4", "test/"]), "3/4");
  assert.equal(shardArgument(["node", "vitest", "run"]), null);
});

test("refresh reads every timing report under a folder, keeping the longer time of a file two reports hold", () => {
  const dir = scratch();
  mkdirSync(join(dir, "timings-browser-1"), { recursive: true });
  mkdirSync(join(dir, "timings-browser-2"), { recursive: true });
  writeFileSync(join(dir, "timings-browser-1/vitest-1of2.json"), JSON.stringify({ "ouro-chromium a.test.tsx": 10.4, "site site.test.tsx": 5 }));
  writeFileSync(join(dir, "timings-browser-2/vitest-2of2.json"), JSON.stringify({ "site site.test.tsx": 7 }));
  writeFileSync(join(dir, "timings-browser-2/scripts-1of2.json"), JSON.stringify({ "scripts/a.test.mjs": 3 }));
  writeFileSync(join(dir, "timings-browser-2/other.json"), JSON.stringify({ ignored: 1 }));
  assert.deepEqual(collectTimings(dir), { vitest: { "ouro-chromium a.test.tsx": 10, "site site.test.tsx": 7 }, scripts: { "scripts/a.test.mjs": 3 } });
  const file = join(dir, "timings.json");
  writeFileSync(file, JSON.stringify({ vitest: { x: 1 } }));
  assert.deepEqual(readTimings("vitest", file), { x: 1 });
  assert.deepEqual(readTimings("scripts", file), {});
  assert.deepEqual(readTimings("scripts", join(dir, "missing.json")), {});
});

test("every script test file is in pnpm test:scripts, so one of the script test shards runs it", () => {
  const listed = scriptTestFiles();
  const found = ["scripts", "site/scripts"].flatMap((dir) =>
    readdirSync(join(root, dir), { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".test.mjs") && !file.split("/").includes("node_modules"))
      .map((file) => `${dir}/${file}`)
      // The kits' tests run inside scripts/kits.test.mjs, under Node's coverage.
      .filter((file) => !file.startsWith("scripts/kits/")),
  );
  assert.deepEqual([...listed].sort(), [...new Set(found)].sort());
  // CI's two shards each take some of them.
  for (const index of [1, 2]) assert.ok(shardKeys(listed, { index, count: 2 }, readTimings("scripts")).length > 0);
});

/** A test file as Vitest's sequencer sees it. */
const spec = (project, path) => ({ project: { name: project }, moduleId: join(root, path) });

test("a browser shard runs its share of the files, by measured time, and every sliced suite", async () => {
  const files = [spec("ouro-chromium", "test/stories.test.tsx"), spec("site", "site/src/site.test.tsx"), ...["a", "b", "c", "d", "e"].map((name) => spec("ouro-webkit", `registry/${name}.test.tsx`))];
  const shards = await Promise.all([1, 2, 3].map((index) => new TimedSequencer({ config: { root, shard: { index, count: 3 } } }).shard(files)));
  const paths = (list) => list.map((entry) => entry.moduleId.slice(root.length + 1));
  for (const shard of shards) assert.deepEqual(paths(shard).slice(0, 2), ["test/stories.test.tsx", "site/src/site.test.tsx"]);
  const rest = shards.flatMap((shard) => paths(shard).slice(2));
  assert.deepEqual(rest.sort(), ["a", "b", "c", "d", "e"].map((name) => `registry/${name}.test.tsx`));
});

test("the sliced suites are exactly the browser tests that slice what they iterate (test/slice.ts)", () => {
  const sources = ["test", "site/src"].flatMap((dir) =>
    readdirSync(join(root, dir), { recursive: true })
      .map(String)
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => `${dir}/${file}`)
      .filter((file) => statSync(join(root, file)).isFile()),
  );
  const slicing = sources.filter((file) => /\bsliced\(/.test(readFileSync(join(root, file), "utf8")) && file !== "test/slice.ts");
  // control-suite.tsx is the controls suites' shared body.
  const suites = slicing.flatMap((file) => (file === "test/control-suite.tsx" ? ["test/controls.test.tsx", "test/controls.touch.test.tsx"] : [file]));
  assert.deepEqual([...new Set(suites)].sort(), [...slicedSuites].sort());
  for (const suite of slicedSuites) assert.match(suite, /\.test\.tsx$/);
});

test("an install shard takes the app's shipped files by the time each took here, over every Vitest project", () => {
  const timings = {
    "ouro-chromium (chromium) registry/ouro/components/ouro/a/a.test.tsx": 300,
    "ouro-webkit (webkit) registry/ouro/components/ouro/a/a.test.tsx": 300,
    "ouro-chromium (chromium) registry/ouro/components/ouro/b/b.test.tsx": 500,
    "ouro-touch (chromium) registry/ouro/components/ouro/c/c.touch.test.tsx": 400,
    "site (chromium) site/src/site.test.tsx": 9000,
  };
  const files = ["src/components/ouro/a/a.test.tsx", "src/components/ouro/b/b.test.tsx", "src/components/ouro/c/c.touch.test.tsx"];
  // a weighs 600 (two projects): alone in one shard, b and c (900) in the other.
  assert.deepEqual(installShard(files, { index: 1, count: 2 }, timings), ["src/components/ouro/a/a.test.tsx"]);
  assert.deepEqual(installShard(files, { index: 2, count: 2 }, timings), ["src/components/ouro/b/b.test.tsx", "src/components/ouro/c/c.touch.test.tsx"]);
  assert.deepEqual(installFiles(join(root, "no-such-app")), []);
});
