import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { balance, browserBalance, collectTimings, drivesBrowser, e2eFiles, filesWithin, installFiles, installShare, installSpecs, parseShard, ownJobs, projectOf, readTimings, shardKeys, slicedSuites } from "./shard.mjs";
import { quarantinedFiles } from "./quarantined-files.mjs";
import { scratchDir } from "./scratch.mjs";
import { scriptTestFiles } from "./script-tests.mjs";
import { treeFiles } from "./tree.mjs";
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
  assert.ok(browser.includes("scripts/agent-usability/score.test.mjs"));
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

test("CI's browser shards: every file runs exactly once, and no shard's total time is over its share by more than 30 s", () => {
  assert.equal(projectOf("ouro-touch (chromium) registry/ouro/components/ouro/sheet/sheet.touch.test.tsx"), "ouro-touch (chromium)");
  const timings = readTimings("vitest");
  const count = 10;
  const shards = browserBalance(count);
  const keys = Object.keys(timings).filter((key) => !slicedSuites.some((suite) => key.endsWith(` ${suite}`)));
  assert.deepEqual(shards.flatMap((shard) => shard.keys).sort(), keys.sort());
  const total = keys.reduce((sum, key) => sum + timings[key], 0);
  // Each shard's tests run one after another, so its total is what it takes; a new or slower file that pushes a shard over its share fails here.
  const tolerance = 30_000;
  for (const [index, shard] of shards.entries()) assert.ok(shard.weight <= total / count + tolerance, `shard ${index + 1}: ${shard.weight}ms of a ${Math.round(total / count)}ms share`);
});

test("CI's 22 browser shards never put a site suite over a minute beside a windowing test, which reads frames and times out on a loaded runner", () => {
  const timings = readTimings("vitest");
  for (const [index, shard] of browserBalance(22).entries()) {
    if (!shard.keys.some((key) => key.includes(".windowing.test"))) continue;
    const heavy = shard.keys.filter((key) => key.startsWith("site ") && timings[key] > 60_000);
    assert.deepEqual(heavy, [], `shard ${index + 1} runs a windowing test beside a heavy site suite`);
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
  assert.deepEqual(collectTimings(dir), { vitest: { "ouro-chromium a.test.tsx": 10, "site site.test.tsx": 7 }, scripts: { "scripts/a.test.mjs": 3 }, e2e: { "site/e2e/stage.spec.ts": 2000 }, subset: {} });
  const file = join(dir, "timings.json");
  writeFileSync(file, JSON.stringify({ vitest: { x: 1 } }));
  assert.deepEqual(readTimings("vitest", file), { x: 1 });
  assert.deepEqual(readTimings("scripts", file), {});
  assert.deepEqual(readTimings("scripts", join(dir, "missing.json")), {});
});

test("every script test file the runner finds runs in exactly one scripts shard, and the shards run nothing else", () => {
  const found = scriptTestFiles();
  const cli = (...args) => spawnSync(process.execPath, [join(root, "scripts/shard.mjs"), ...args], { cwd: root, encoding: "utf8" }).stdout.trim().split("\n");
  // CI runs three script shards side by side; scripts-browser runs the files that drive a browser.
  const ran = [cli("scripts", "1/3"), cli("scripts", "2/3"), cli("scripts", "3/3"), cli("scripts-browser")].flat();
  // Sorted and compared whole, so a file in two shards, or a file no shard runs, fails. The files that run as their own jobs are the only ones left out.
  assert.deepEqual([...ran, ...ownJobs].sort(), found);
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

test("files with no recorded time spread over the shards by name, each in exactly one", async () => {
  const files = ["a", "b", "c", "d", "e", "f"].map((name) => spec("themes (chromium)", `test/themes/${name}.test.ts`));
  const shards = await Promise.all([1, 2, 3].map((index) => new TimedSequencer({ config: { root, shard: { index, count: 3 } } }).shard(files)));
  assert.deepEqual(shards.map((shard) => shard.length), [2, 2, 2]);
  assert.equal(new Set(shards.flat().map((entry) => entry.moduleId)).size, 6);
});

test("the sliced suites are exactly the browser tests that slice what they iterate (test/slice.ts)", () => {
  const sources = ["test", "site/src"].flatMap((dir) =>
    treeFiles(join(root, dir))
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => `${dir}/${file}`),
  );
  const slicing = sources.filter((file) => /\bsliced\(/.test(readFileSync(join(root, file), "utf8")) && file !== "test/slice.ts");
  // control-suite.tsx is the controls suites' shared body.
  // theme-axe.ts is the theme fixtures' shared body, one file per fixture and scheme.
  const themeFiles = ["cookbook", "nova", "vega"].flatMap((name) => ["dark", "light"].map((scheme) => `test/themes/${name}-${scheme}.test.ts`));
  const suites = slicing.flatMap((file) => (file === "test/control-suite.tsx" ? ["test/controls.test.tsx", "test/controls.touch.test.tsx"] : file === "test/themes/theme-axe.ts" ? themeFiles : [file]));
  assert.deepEqual([...new Set(suites)].sort(), [...slicedSuites].sort());
  for (const suite of slicedSuites) assert.match(suite, /\.test\.tsx?$/);
});

test("a sliced check runs each item exactly once across the shards, in each project, and its slices start at a shard of its own (test/slice.ts)", async () => {
  const { offsetOf, sliceOf } = await import("../test/slice-core.ts");
  const list = Array.from({ length: 101 }, (_, item) => item);
  // Every check named in the sliced suites, in each project that runs it (test/slice.ts's project names).
  const sources = ["test", "site/src"].flatMap((dir) =>
    treeFiles(join(root, dir))
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => readFileSync(join(root, dir, file), "utf8")),
  );
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

test("the themes shards scan each story under each fixture and scheme in exactly one shard, and every pair has a file", async () => {
  const { sliceOf } = await import("../test/slice-core.ts");
  const costs = JSON.parse(readFileSync(join(root, "test/story-costs.json"), "utf8"));
  const stories = Object.keys(costs).map((id) => ({ id }));
  const pairs = ["cookbook", "nova", "vega"].flatMap((name) => ["dark", "light"].map((scheme) => ({ name, scheme })));
  for (const { name, scheme } of pairs) {
    const source = readFileSync(join(root, `test/themes/${name}-${scheme}.test.ts`), "utf8");
    assert.match(source, new RegExp(`describeThemeAxe\\("${name}", "${scheme}"\\)`), `${name} ${scheme} has its file`);
    for (const count of [3, 6, 8]) {
      const ids = Array.from({ length: count }, (_, index) => sliceOf(stories, index + 1, count, `chromium ${name} ${scheme}: axe`)).flat().map((story) => story.id);
      assert.deepEqual(ids.toSorted(), stories.map((story) => story.id).toSorted(), `${name} ${scheme} at ${count} shards: each story once`);
    }
  }
  assert.match(readFileSync(join(root, "test/themes/theme-axe.ts"), "utf8"), /sliced\(selectedStories, `\$\{name\} \$\{scheme\}: axe`\)/);
});

test("a sliced check gives every shard its share of the measured cost, longest items first, the same on every shard (test/story-costs.json)", async () => {
  const { sliceOf } = await import("../test/slice-core.ts");
  const costs = JSON.parse(readFileSync(join(root, "test/story-costs.json"), "utf8"));
  const items = Object.entries(costs).map(([id, ms]) => ({ id, ms }));
  assert.ok(items.length > 500, "the table covers the stories and pages");
  for (const count of [4, 6, 12]) {
    const loads = Array.from({ length: count }, (_, index) => sliceOf(items, index + 1, count, "chromium stories: axe").reduce((sum, item) => sum + item.ms, 0));
    const total = loads.reduce((sum, load) => sum + load, 0);
    const heaviest = Math.max(...items.map((item) => item.ms));
    assert.ok(Math.max(...loads) <= total / count + heaviest, `${count} shards: the heaviest slice stays within one item of an even share (${loads.join(", ")})`);
  }
  // An item the table doesn't know still runs once.
  const unknown = ["a", "b", "c", "d", "e"];
  assert.deepEqual([1, 2, 3].flatMap((index) => sliceOf(unknown, index, 3, "k")).toSorted(), unknown);
});

test("an install shard takes its share of the app's shipped files and specs in one split by the time each took here, so a heavy spec takes fewer files", () => {
  // Over every Vitest project that ran a file; the site's own suites are no shipped file.
  const vitest = { "ouro-chromium (chromium) registry/ouro/components/ouro/a/a.test.tsx": 30_000, "ouro-webkit (webkit) registry/ouro/components/ouro/a/a.test.tsx": 30_000, "site (chromium) site/src/site.test.tsx": 900_000 };
  for (const name of ["b", "c", "d"]) vitest[`ouro-chromium (chromium) registry/ouro/components/ouro/${name}/${name}.test.tsx`] = 60_000;
  const e2e = { "registry/ouro/e2e/ouro/a.spec.ts": 100_000, "registry/ouro/e2e/ouro/b.spec.ts": 20_000, "registry/ouro/e2e/ouro/c.spec.ts": 20_000, "site/e2e/stage.spec.ts": 900_000 };
  const file = (name) => `src/components/ouro/${name}/${name}.test.tsx`;
  const files = ["a", "b", "c", "d"].map(file);
  const specs = ["e2e/ouro/a.spec.ts", "e2e/ouro/b.spec.ts", "e2e/ouro/c.spec.ts"];
  // Split by kind, shard 1 took two files and a's spec (220 s) and shard 2 two files and the light specs (160 s).
  // In one split, a's spec goes with one file (180 s), and the other shard runs three (200 s); each gets both kinds.
  assert.deepEqual(installShare(files, specs, { index: 1, count: 2 }, vitest, e2e), { files: [file("c")], specs: ["e2e/ouro/a.spec.ts", "e2e/ouro/c.spec.ts"] });
  assert.deepEqual(installShare(files, specs, { index: 2, count: 2 }, vitest, e2e), { files: [file("a"), file("b"), file("d")], specs: ["e2e/ouro/b.spec.ts"] });
  assert.deepEqual(installFiles(join(root, "no-such-app")), []);
  assert.deepEqual(installSpecs(join(root, "no-such-app")), []);
  // Every shipped spec has a time here.
  const shipped = readdirSync(join(root, "registry/ouro/e2e/ouro")).filter((file) => file.endsWith(".spec.ts"));
  assert.deepEqual(shipped.filter((file) => !(`registry/ouro/e2e/ouro/${file}` in readTimings("e2e"))), []);
});

test("the e2e spec files are the shipped and the site's specs, without the screen-reader and latency specs, each with a time", () => {
  const files = e2eFiles();
  assert.ok(files.includes("site/e2e/stage.spec.ts") && files.some((file) => file.startsWith("registry/ouro/e2e/ouro/")));
  assert.equal(files.filter((file) => /\.(sr|latency)\.spec\.ts$/.test(file)).length, 0);
  // A spec with no time weighs the median, which can unbalance the shards: refresh the times.
  assert.deepEqual(files.filter((file) => !(file in readTimings("e2e"))), [], "node scripts/shard.mjs refresh <the timings-* artifacts of a CI run>");
});

test("given paths, the e2e shards split by measured time only the spec files that are one of them or under one, each file in exactly one shard", () => {
  const files = ["registry/ouro/e2e/ouro/a.spec.ts", "registry/ouro/e2e/ouro/b.spec.ts", "site/e2e/c.spec.ts", "site/e2e/deep/d.spec.ts", "site/e2e2/e.spec.ts"];
  // A directory path, with or without its slash, selects every file under it, and only under it.
  assert.deepEqual(filesWithin(files, ["registry/ouro/e2e/ouro/b.spec.ts", "site/e2e/"]), ["registry/ouro/e2e/ouro/b.spec.ts", "site/e2e/c.spec.ts", "site/e2e/deep/d.spec.ts"]);
  assert.deepEqual(filesWithin(files, ["site/e2e"]), ["site/e2e/c.spec.ts", "site/e2e/deep/d.spec.ts"]);
  assert.deepEqual(filesWithin(files, ["registry/ouro/e2e/ouro/a.spec"]), []);
  // In this repository, as CI's reduced run calls it: a few components' specs and the site's.
  const cli = (...args) => spawnSync(process.execPath, [join(root, "scripts/shard.mjs"), "e2e", ...args], { cwd: root, encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  const paths = ["registry/ouro/e2e/ouro/checkbox.spec.ts", "registry/ouro/e2e/ouro/dialog.spec.ts", "site/e2e/"];
  const selected = e2eFiles().filter((file) => file === paths[0] || file === paths[1] || file.startsWith("site/e2e/"));
  assert.ok(selected.length > paths.length);
  const shares = [1, 2, 3, 4].map((index) => cli(`${index}/4`, ...paths));
  assert.deepEqual(shares.flat().sort(), selected);
  assert.equal(new Set(shares.flat()).size, selected.length);
  assert.deepEqual(shares, [1, 2, 3, 4].map((index) => shardKeys(selected, { index, count: 4 }, readTimings("e2e"))));
  // Without paths, a shard takes its share of every spec file, as before.
  assert.deepEqual(cli("2/4"), shardKeys(e2eFiles(), { index: 2, count: 4 }, readTimings("e2e")));
});

test("the Playwright timings reporter adds up each spec file's tests, in every project and attempt", async () => {
  const { default: Reporter } = await import("./timings-playwright-reporter.mjs");
  const out = join(scratch(), "e2e-1of3.json");
  const reporter = new Reporter({ outputFile: out });
  const spec = (file) => ({ location: { file: join(process.cwd(), file) } });
  reporter.onTestEnd(spec("site/e2e/stage.spec.ts"), { duration: 1200 });
  reporter.onTestEnd(spec("site/e2e/stage.spec.ts"), { duration: 800 });
  reporter.onTestEnd(spec("registry/ouro/e2e/ouro/menu.spec.ts"), { duration: 300.4 });
  const swept = { location: { file: join(process.cwd(), "site/e2e/states-sweep.ts") }, parent: { type: "describe", parent: { type: "file", location: { file: join(process.cwd(), "site/e2e/states-dark-1.spec.ts") } } } };
  reporter.onTestEnd(swept, { duration: 50 });
  reporter.onEnd();
  assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), { "registry/ouro/e2e/ouro/menu.spec.ts": 300, "site/e2e/stage.spec.ts": 2000, "site/e2e/states-dark-1.spec.ts": 50 });
  assert.equal(reporter.printsToStdio(), false);
});

test("a live whole-file quarantine entry's file is left out of every blocking shard and runs only in the non-blocking step, and an expired or removed entry lifts that", () => {
  const file = "registry/ouro/components/ouro/message/message-list.windowing.test.tsx";
  const entry = (title, expiry) => ({ project: "ouro-chromium", file, title, expiry });
  const now = new Date("2026-11-20T00:00:00Z");
  assert.deepEqual(quarantinedFiles([entry("*", "2026-11-27T00:00:00Z"), { ...entry("*", "2026-11-27T00:00:00Z"), project: "ouro-webkit" }], now), [file]);
  assert.deepEqual(quarantinedFiles([entry("one test", "2026-11-27T00:00:00Z")], now), []);
  assert.deepEqual(quarantinedFiles([entry("*", "2026-11-19T00:00:00Z")], now), []);
  assert.deepEqual(quarantinedFiles([], now), []);

  const app = scratch();
  const apart = join(app, "src/components/ouro/message");
  mkdirSync(apart, { recursive: true });
  for (const name of ["message-list.windowing.test.tsx", "message.test.tsx"]) writeFileSync(join(apart, name), "");
  assert.deepEqual(installFiles(app, [file]), ["src/components/ouro/message/message.test.tsx"]);
  assert.deepEqual(installFiles(app, []), ["src/components/ouro/message/message-list.windowing.test.tsx", "src/components/ouro/message/message.test.tsx"]);

  const config = readFileSync(join(root, "vitest.config.ts"), "utf8");
  assert.match(config, /\.\.\.\(quarantinedOnly \? \{ include: quarantinedList \} : \{\}\)/);
  assert.match(config, /\.\.\.\(quarantinedOnly \? \[\] : quarantinedList\)/);
  const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const step = /- name: Quarantined whole-file tests[^\n]*\n[\s\S]*?run: pnpm exec vitest run\n/.exec(ci)?.[0] ?? "";
  assert.match(step, /continue-on-error: true/);
  assert.match(step, /OURO_QUARANTINED_ONLY: "1"/);
});
