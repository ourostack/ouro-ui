import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { balance, checkLatencyShards, collectTimings, drivesBrowser, e2eFiles, installFiles, installShard, installSpecs, installSpecShard, parseShard, projectOf, readTimings, scriptTestFiles, shardKeys, slicedSuites } from "./shard.mjs";
import { scratchDir } from "./scratch.mjs";
import { shardArgument, TimedSequencer } from "./vitest-shards.mts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const scratch = () => scratchDir("ouro-shard-");

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

test("the script tests that drive a browser are those that import Playwright's runtime at any depth, and only they leave the scripts shards", () => {
  const dir = scratch();
  mkdirSync(join(dir, "lib"));
  writeFileSync(join(dir, "drives.test.mjs"), 'import assert from "node:assert";\nimport { run } from "./lib/run.mjs";\n');
  writeFileSync(join(dir, "lib/run.mjs"), 'import {\n  chromium,\n} from "playwright";\nexport const run = chromium;\n');
  writeFileSync(join(dir, "types.test.mjs"), 'import type { Page } from "playwright";\nimport { x } from "./lib/plain.mjs";\n');
  writeFileSync(join(dir, "lib/plain.mjs"), 'import { y } from "./types.mjs";\nexport const x = 1;\n');
  writeFileSync(join(dir, "lib/types.mjs"), 'import { x } from "./plain.mjs";\n');
  assert.equal(drivesBrowser("drives.test.mjs", dir), true);
  // A type-only import, and an import cycle, drive nothing.
  assert.equal(drivesBrowser("types.test.mjs", dir), false);
  // In this repository: the agent usability scorer's tests do, the touch kit's stand-in harness does not.
  assert.equal(drivesBrowser("scripts/agent-usability/score.test.mjs"), true);
  assert.equal(drivesBrowser("scripts/touch-kit-frames.test.mjs"), false);
  const cli = (...args) => spawnSync(process.execPath, [join(root, "scripts/shard.mjs"), ...args], { cwd: root, encoding: "utf8" }).stdout.trim().split("\n");
  const browser = cli("scripts-browser");
  const shards = [cli("scripts", "1/2"), cli("scripts", "2/2")].flat();
  assert.ok(browser.includes("scripts/agent-usability/score.test.mjs"));
  assert.deepEqual([...shards, ...browser].sort(), scriptTestFiles().sort());
  assert.equal(new Set([...shards, ...browser]).size, scriptTestFiles().length);
});

test("with groups, each group's files spread as evenly as the shards allow, then the least in all", () => {
  const timings = { "A a1": 60, "A a2": 50, "A a3": 10, "B b1": 30 };
  const keys = Object.keys(timings);
  // Without groups, A's files take 70 in one shard and 50 in the other.
  assert.deepEqual(balance(keys, 2, timings).map((shard) => shard.keys), [["A a1", "A a3"], ["A a2", "B b1"]]);
  const grouped = balance(keys, 2, timings, (key) => key.split(" ")[0]);
  assert.deepEqual(grouped, [
    { keys: ["A a1"], weight: 60 },
    { keys: ["A a2", "A a3", "B b1"], weight: 90 },
  ]);
  assert.deepEqual([1, 2].flatMap((index) => shardKeys(keys, { index, count: 2 }, timings, (key) => key.split(" ")[0])).sort(), keys.sort());
});

test("CI's browser shards each take an even share of every Vitest project, which run side by side", () => {
  assert.equal(projectOf("ouro-touch (chromium) registry/ouro/components/ouro/sheet/sheet.touch.test.tsx"), "ouro-touch (chromium)");
  const timings = readTimings("vitest");
  const keys = Object.keys(timings).filter((key) => !slicedSuites.some((suite) => key.endsWith(` ${suite}`)));
  const shards = balance(keys, 4, timings, projectOf);
  for (const project of new Set(keys.map(projectOf))) {
    const files = keys.filter((key) => projectOf(key) === project);
    const shares = shards.map((shard) => shard.keys.filter((key) => projectOf(key) === project).reduce((sum, key) => sum + timings[key], 0));
    // No shard has more of a project than another by more than that project's longest file.
    assert.ok(Math.max(...shares) - Math.min(...shares) <= Math.max(...files.map((key) => timings[key])), `${project}: ${shares.join(", ")}ms`);
  }
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
  mkdirSync(join(dir, "timings-e2e-3"), { recursive: true });
  writeFileSync(join(dir, "timings-e2e-3/e2e-3of3.json"), JSON.stringify({ "site/e2e/stage.spec.ts": 2000 }));
  mkdirSync(join(dir, "timings-latency-1"), { recursive: true });
  writeFileSync(join(dir, "timings-latency-1/latency-1of3.json"), JSON.stringify({ "stage.latency.spec.ts › interaction latency › dive": 18300 }));
  writeFileSync(join(dir, "timings-latency-1/latency-tests.txt"), "stage.latency.spec.ts › interaction latency › dive\n");
  assert.deepEqual(collectTimings(dir), {
    vitest: { "ouro-chromium a.test.tsx": 10, "site site.test.tsx": 7 },
    scripts: { "scripts/a.test.mjs": 3 },
    e2e: { "site/e2e/stage.spec.ts": 2000 },
    latency: { "stage.latency.spec.ts › interaction latency › dive": 18300 },
  });
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

test("a sliced check runs each item exactly once across the shards, in each project, and its slices start at a shard of its own (test/slice.ts)", async () => {
  const { offsetOf, sliceOf } = await import("../test/slice-core.ts");
  const list = Array.from({ length: 101 }, (_, item) => item);
  // Every check named in the sliced suites, in each project that runs it (test/slice.ts's project names).
  const sources = ["test", "site/src"].flatMap((dir) => readdirSync(join(root, dir), { recursive: true }).map(String).filter((file) => /\.tsx?$/.test(file) && statSync(join(root, dir, file)).isFile()).map((file) => readFileSync(join(root, dir, file), "utf8")));
  const checks = [...new Set(sources.flatMap((source) => [...source.matchAll(/\bsliced\([^;]*?, "([^"]+)"\)/gs)].map((match) => match[1])))];
  assert.ok(checks.length >= 9, `the checks named in sliced(): ${checks.join(", ")}`);
  const keys = ["chromium", "webkit", "chromium touch"].flatMap((project) => checks.map((check) => `${project} ${check}`));
  for (const count of [1, 2, 3, 6, 12, 16, 24]) {
    for (const key of keys) {
      const runs = Array.from({ length: count }, (_, index) => sliceOf(list, index + 1, count, key)).flat();
      assert.deepEqual(runs.toSorted((a, b) => a - b), list, `${key} at ${count} shards: each item once`);
    }
    // The first item, a heavy story or not, starts in more than one shard across the checks and projects.
    if (count > 1) assert.ok(new Set(keys.map((key) => offsetOf(key, count))).size > Math.min(count, keys.length) / 2, `offsets at ${count} shards spread`);
  }
  // The same check in the same project starts at the same shard on every run.
  assert.equal(offsetOf("webkit stories: axe", 16), offsetOf("webkit stories: axe", 16));
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

test("the e2e spec files are the shipped and the site's specs, without the screen-reader and latency specs, each with a time", () => {
  const files = e2eFiles();
  assert.ok(files.includes("site/e2e/stage.spec.ts") && files.some((file) => file.startsWith("registry/ouro/e2e/ouro/")));
  assert.equal(files.filter((file) => /\.(sr|latency)\.spec\.ts$/.test(file)).length, 0);
  // A spec with no time weighs the median, which can unbalance the shards: refresh the times.
  assert.deepEqual(files.filter((file) => !(file in readTimings("e2e"))), [], "node scripts/shard.mjs refresh <the timings-* artifacts of a CI run>");
});

test("the Playwright timings reporter adds up each spec file's tests, in every project and attempt", async () => {
  const { default: Reporter } = await import("./timings-playwright-reporter.mjs");
  const out = join(scratch(), "e2e-1of3.json");
  const reporter = new Reporter({ outputFile: out });
  const spec = (file) => ({ location: { file: join(process.cwd(), file) } });
  reporter.onTestEnd(spec("site/e2e/stage.spec.ts"), { duration: 1200 });
  reporter.onTestEnd(spec("site/e2e/stage.spec.ts"), { duration: 800 });
  reporter.onTestEnd(spec("registry/ouro/e2e/ouro/menu.spec.ts"), { duration: 300.4 });
  reporter.onEnd();
  assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), { "registry/ouro/e2e/ouro/menu.spec.ts": 300, "site/e2e/stage.spec.ts": 2000 });
  assert.equal(reporter.printsToStdio(), false);
});

test("the Playwright timings reporter, by test, keys each test by its file under the config's rootDir and its titles, as --test-list reads them", async () => {
  const { default: Reporter, testKey } = await import("./timings-playwright-reporter.mjs");
  const out = join(scratch(), "latency-2of3.json");
  const reporter = new Reporter({ outputFile: out, by: "test" });
  const rootDir = join(process.cwd(), "site/e2e");
  const file = { type: "file", title: "stage.latency.spec.ts" };
  const describe = { type: "describe", title: "interaction latency", parent: file };
  const at = (title, parent = describe) => ({ title, parent, location: { file: join(rootDir, "stage.latency.spec.ts") } });
  reporter.onBegin({ rootDir });
  reporter.onTestEnd(at("dive answers within 100 ms"), { duration: 18300.4 });
  reporter.onTestEnd(at("bell answers within 100 ms"), { duration: 5600 });
  reporter.onEnd();
  assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), {
    "stage.latency.spec.ts › interaction latency › bell answers within 100 ms": 5600,
    "stage.latency.spec.ts › interaction latency › dive answers within 100 ms": 18300,
  });
  assert.equal(testKey(rootDir, at("outside any describe", file)), "stage.latency.spec.ts › outside any describe");
  // --test-list splits a line on "›" (or ">"), and trims each title.
  for (const title of ["a › b", "a > b", " padded"]) assert.throws(() => testKey(rootDir, at(title)), /test list cannot name/);
});

test("the latency check passes only when the shards ran every listed test exactly once between them", () => {
  const tests = ["a.latency.spec.ts › x › one", "a.latency.spec.ts › x › two", "b.latency.spec.ts › y › three"];
  const shardsOf = (reports, lists = reports.map(() => tests)) => {
    const dir = scratch();
    for (const [position, report] of reports.entries()) {
      const folder = join(dir, `timings-latency-${position + 1}`);
      mkdirSync(folder, { recursive: true });
      if (report) writeFileSync(join(folder, `latency-${report.index}of${report.count}.json`), JSON.stringify(Object.fromEntries(report.tests.map((name) => [name, 1000]))));
      writeFileSync(join(folder, "latency-tests.txt"), `${lists[position].join("\n")}\n`);
    }
    return checkLatencyShards(dir);
  };
  assert.deepEqual(shardsOf([{ index: 1, count: 2, tests: [tests[0], tests[2]] }, { index: 2, count: 2, tests: [tests[1]] }]), []);
  assert.match(shardsOf([{ index: 1, count: 2, tests: [tests[0], tests[2]] }, { index: 2, count: 2, tests: [tests[1], tests[2]] }]).join("\n"), /Ran in more than one shard \(1\/2, 2\/2\): b\.latency/);
  assert.match(shardsOf([{ index: 1, count: 2, tests: [tests[0]] }, { index: 2, count: 2, tests: [tests[1]] }]).join("\n"), /Ran in no shard: b\.latency/);
  assert.match(shardsOf([{ index: 1, count: 2, tests }, null]).join("\n"), /Expected one report from each shard, got 1\/2/);
  assert.match(shardsOf([{ index: 1, count: 1, tests: [...tests, "c.latency.spec.ts › z"] }]).join("\n"), /Ran but not listed: c\.latency/);
  assert.match(shardsOf([{ index: 1, count: 2, tests: [tests[0], tests[2]] }, { index: 2, count: 2, tests: [tests[1]] }], [tests, tests.slice(1)]).join("\n"), /listed different tests/);
  assert.match(checkLatencyShards(scratch()).join("\n"), /^No latency-tests\.txt under /);
});

test("an install shard takes the app's shipped specs by the time each took here, in both browsers", () => {
  const timings = { "registry/ouro/e2e/ouro/a.spec.ts": 900, "registry/ouro/e2e/ouro/b.spec.ts": 500, "registry/ouro/e2e/ouro/c.spec.ts": 300, "site/e2e/stage.spec.ts": 9000 };
  const specs = ["e2e/ouro/a.spec.ts", "e2e/ouro/b.spec.ts", "e2e/ouro/c.spec.ts"];
  assert.deepEqual(installSpecShard(specs, { index: 1, count: 2 }, timings), ["e2e/ouro/a.spec.ts"]);
  assert.deepEqual(installSpecShard(specs, { index: 2, count: 2 }, timings), ["e2e/ouro/b.spec.ts", "e2e/ouro/c.spec.ts"]);
  assert.deepEqual(installSpecs(join(root, "no-such-app")), []);
  // Every shipped spec has a time here.
  const shipped = readdirSync(join(root, "registry/ouro/e2e/ouro")).filter((file) => file.endsWith(".spec.ts"));
  assert.deepEqual(shipped.filter((file) => !(`registry/ouro/e2e/ouro/${file}` in readTimings("e2e"))), []);
});
