// Timing-balanced shards for CI (.github/workflows/ci.yml). Each shard gets a share of the test files
// whose measured times add up to about the same as every other shard's: the longest file first, each
// to the shard with the least so far. The times are scripts/shard-timings.json, written from a CI
// run's timing reports (`refresh`); a file it does not know yet weighs the median of every time it holds.
//
//   node scripts/shard.mjs scripts <index>/<count>   the test:scripts files of one shard, one per line
//   node scripts/shard.mjs e2e <index>/<count>       the end-to-end spec files of one shard
//   node scripts/shard.mjs install <index>/<count> <app>
//                                                    the shipped Vitest test files of one install
//                                                    shard, paths in the installed app <app>
//   node scripts/shard.mjs install-e2e <index>/<count> <app>
//                                                    the shipped end-to-end spec files of one install
//                                                    shard, paths in the installed app <app>
//   node scripts/shard.mjs latency-list              every test `pnpm test:latency` runs, one key per line
//   node scripts/shard.mjs latency <index>/<count> <list>
//                                                    the latency tests of one shard, from the keys in
//                                                    <list>, as Playwright's --test-list reads them
//   node scripts/shard.mjs latency-check <dir>       fails unless the latency shards' reports under <dir>
//                                                    ran every listed test exactly once between them
//   node scripts/shard.mjs plan <kind> <count>       every shard of a kind, with its weight
//   node scripts/shard.mjs refresh <dir>             rewrites scripts/shard-timings.json from the
//                                                    timing reports under <dir> (any depth)
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const timingsFile = join(root, "scripts/shard-timings.json");

/**
 * The browser test files every shard runs, each over its own slice of the stories or pages it
 * iterates (test/slice.ts): alone, one of them took longer than a whole shard should
 * (scripts/vitest-shards.mts).
 */
export const slicedSuites = [
  "site/src/site.test.tsx",
  "site/src/voyage/voyage-presets.test.tsx",
  "test/controls.test.tsx",
  "test/controls.touch.test.tsx",
  "test/stories.test.tsx",
  "test/text-size.touch.test.tsx",
  "test/theme-tokens.test.tsx",
];

/** Whether a `<project> <path>` timing key (the project as Vitest names it, `ouro-chromium (chromium)`) is a sliced suite's. */
const isSliced = (key) => slicedSuites.some((suite) => key.endsWith(` ${suite}`));

/** `<index>/<count>`, as Vitest's and Playwright's --shard take it. */
export function parseShard(text) {
  const match = /^(\d+)\/(\d+)$/.exec(text ?? "");
  const shard = match && { index: Number(match[1]), count: Number(match[2]) };
  if (!shard || shard.count < 1 || shard.index < 1 || shard.index > shard.count) throw new Error(`A shard is <index>/<count> with 1 <= index <= count, not "${text}".`);
  return shard;
}

/** The measured times (ms) of one kind of test, by key, or {} when there are none. */
export function readTimings(kind, file = timingsFile) {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8"))[kind] ?? {}) : {};
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 1 : sorted[Math.floor(sorted.length / 2)];
};

/**
 * Splits `keys` into `count` shards whose weights add up as evenly as the longest-first greedy split
 * gets them: heaviest first (ties by key), each to the lightest shard so far (ties to the lowest
 * index). The same keys and times give the same shards on every machine.
 *
 * With `groupOf`, each group's keys are spread as evenly as the shards allow too: a key goes to the
 * shard with the least of its group so far, then the least in all (ties to the lowest index). Vitest
 * runs its projects side by side, each in its own browser, so a shard takes about as long as its
 * heaviest project, not the sum of them: a shard with twice another's WebKit files ran longest (run
 * 39773408723), and one with the heaviest touch files ran them slowest (run 39776130394).
 */
export function balance(keys, count, timings, groupOf) {
  const fallback = median(Object.values(timings).filter((value) => typeof value === "number"));
  const weightOf = (key) => (typeof timings[key] === "number" ? timings[key] : fallback);
  const shards = Array.from({ length: count }, () => ({ keys: [], weight: 0, groups: new Map() }));
  const ordered = [...new Set(keys)].sort((a, b) => weightOf(b) - weightOf(a) || (a < b ? -1 : a > b ? 1 : 0));
  for (const key of ordered) {
    const group = groupOf?.(key);
    const of = (shard) => shard.groups.get(group) ?? 0;
    const lightest = shards.reduce((best, shard) => (of(shard) < of(best) || (of(shard) === of(best) && shard.weight < best.weight) ? shard : best), shards[0]);
    lightest.keys.push(key);
    lightest.weight += weightOf(key);
    lightest.groups.set(group, of(lightest) + weightOf(key));
  }
  for (const shard of shards) delete shard.groups;
  for (const shard of shards) shard.keys.sort();
  return shards;
}

/** The keys shard `index` (from 1) of `count` runs, each group spread across the shards with `groupOf` (balance). */
export const shardKeys = (keys, { index, count }, timings, groupOf) => balance(keys, count, timings, groupOf)[index - 1].keys;

/** A Vitest timing key's project, as Vitest names it: `ouro-touch (chromium)` of `ouro-touch (chromium) <path>`. */
export const projectOf = (key) => key.slice(0, key.indexOf(") ") + 1);

/** The files `pnpm test:scripts` runs, from package.json. */
export function scriptTestFiles(rootDir = root) {
  const script = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")).scripts["test:scripts"];
  return script.split(/\s+/).filter((word) => /\.test\.m?[jt]s$/.test(word));
}

/** The modules `file` (relative to `rootDir`) imports for their runtime, not for types only: the specifiers. */
const runtimeImports = (file, rootDir) => [...readFileSync(join(rootDir, file), "utf8").matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gms)].map((match) => match[1]);

/**
 * Whether the script test `file` drives a browser: it, or a module of this repository it imports
 * at any depth, imports Playwright's runtime ("playwright"), as the agent usability scorer does.
 * Those run in Playwright's image (CI's scripts-browser job); the other script tests need no browser.
 */
export function drivesBrowser(file, rootDir = root, seen = new Set()) {
  if (seen.has(file)) return false;
  seen.add(file);
  return runtimeImports(file, rootDir).some((spec) => {
    if (spec === "playwright" || spec === "playwright-core") return true;
    if (!spec.startsWith(".")) return false;
    const next = join(dirname(file), spec).split("\\").join("/");
    return existsSync(join(rootDir, next)) && drivesBrowser(next, rootDir, seen);
  });
}

/** Every file under `dir`, at any depth. */
const filesUnder = (dir) => readdirSync(dir, { recursive: true }).map(String).map((file) => join(dir, file));

/** The kinds of timings scripts/shard-timings.json holds, each under its own key. */
const kinds = ["vitest", "scripts", "e2e", "latency"];

/**
 * The times in the timing reports under `dir`: each `vitest-*.json` maps `<project> <file>`, each
 * `scripts-*.json` and `e2e-*.json` maps `<file>`, and each `latency-*.json` maps a test's key
 * (`testKey` in scripts/timings-playwright-reporter.mjs), to milliseconds. A key two reports both
 * hold keeps the longer time.
 */
export function collectTimings(dir) {
  const timings = Object.fromEntries(kinds.map((kind) => [kind, {}]));
  for (const file of filesUnder(dir).sort()) {
    const kind = /(?:^|\/)(vitest|scripts|e2e|latency)-[^/]*\.json$/.exec(file)?.[1];
    if (!kind) continue;
    for (const [key, ms] of Object.entries(JSON.parse(readFileSync(file, "utf8")))) timings[kind][key] = Math.max(timings[kind][key] ?? 0, Math.round(ms));
  }
  return timings;
}

/**
 * The end-to-end spec files `pnpm test:e2e` runs (playwright.config.ts): the shipped specs under
 * registry/ouro/e2e and the site's under site/e2e, without the screen-reader and latency specs,
 * which run on their own.
 */
export function e2eFiles(rootDir = root) {
  const specs = (dir) => (existsSync(join(rootDir, dir)) ? readdirSync(join(rootDir, dir), { recursive: true }).map((file) => `${dir}/${String(file).split("\\").join("/")}`) : []);
  return [...specs("registry/ouro/e2e"), ...specs("site/e2e")].filter((file) => file.endsWith(".spec.ts") && !/\.(sr|latency)\.spec\.ts$/.test(file)).sort();
}

/**
 * The Vitest test files an installed app runs from Ouro UI's shipped tests: under src/, in an ouro
 * folder, named *.test.ts or *.test.tsx (as ouroTestProjects includes them), visual tests left out.
 * Paths are relative to the app.
 */
export function installFiles(app) {
  if (!existsSync(join(app, "src"))) return [];
  return filesUnder(join(app, "src"))
    .map((file) => relative(app, file).split("\\").join("/"))
    .filter((file) => /(^|\/)ouro\/.*\.test\.tsx?$/.test(file) && !/\.visual\.test\.tsx?$/.test(file))
    .sort();
}

/**
 * One install shard's share of `files` (app paths, `src/...`), balanced by the time each took here:
 * an app's `src/<path>` is this repository's `registry/ouro/<path>`, summed over the Vitest projects
 * that ran it.
 */
export function installShard(files, shard, timings = readTimings("vitest")) {
  const byFile = {};
  for (const [key, ms] of Object.entries(timings)) {
    const path = /^.+? \(\w+\) registry\/ouro\/(.+)$/.exec(key)?.[1];
    if (path) byFile[`src/${path}`] = (byFile[`src/${path}`] ?? 0) + ms;
  }
  return shardKeys(files, shard, byFile);
}

/** The end-to-end specs an installed app has from Ouro UI (e2e/ouro/*.spec.ts), relative to the app. */
export function installSpecs(app) {
  const dir = join(app, "e2e/ouro");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".spec.ts"))
    .map((file) => `e2e/ouro/${file}`)
    .sort();
}

/**
 * One install shard's share of `specs` (app paths, `e2e/ouro/...`), balanced by the time each took
 * here: an app's `e2e/ouro/<file>` is this repository's `registry/ouro/e2e/ouro/<file>`, in both
 * browsers. Playwright's own --shard, by test, gave one shard the Chromium tests and the other the
 * slower WebKit ones.
 */
export function installSpecShard(specs, shard, timings = readTimings("e2e")) {
  const byFile = Object.fromEntries(Object.entries(timings).flatMap(([key, ms]) => (key.startsWith("registry/ouro/e2e/ouro/") ? [[key.slice("registry/ouro/".length), ms]] : [])));
  return shardKeys(specs, shard, byFile);
}

/**
 * Every test `pnpm test:latency` runs (playwright.latency.config.ts), by key (`testKey`), in the
 * order Playwright runs them, as Playwright's --list finds them: it loads the specs, and starts no
 * web server and no browser.
 */
export function latencyTests(rootDir = root) {
  const result = spawnSync(join(rootDir, "node_modules/.bin/playwright"), ["test", "--config", "playwright.latency.config.ts", "--list", "--reporter=./scripts/list-playwright-reporter.mjs"], { cwd: rootDir, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Could not list the latency tests (status ${result.status}):\n${result.stdout}${result.stderr}${result.error ?? ""}`);
  const tests = result.stdout.split("\n").flatMap((line) => (line.startsWith("test: ") ? [line.slice("test: ".length)] : []));
  if (tests.length === 0) throw new Error(`Playwright listed no latency tests:\n${result.stdout}${result.stderr}`);
  return tests;
}

/**
 * Whether the latency shards' reports under `dir` ran every listed test exactly once between them:
 * each shard's artifact holds the list it was given (`latency-tests.txt`, every test) and the time of
 * each test it ran (`latency-<index>of<count>.json`). Returns what is wrong, or nothing.
 */
export function checkLatencyShards(dir) {
  const files = filesUnder(dir).sort();
  const lists = files.filter((file) => /(?:^|\/)latency-tests\.txt$/.test(file)).map((file) => readFileSync(file, "utf8").split("\n").filter(Boolean));
  const reports = files.flatMap((file) => {
    const match = /(?:^|\/)latency-(\d+)of(\d+)\.json$/.exec(file);
    return match ? [{ index: Number(match[1]), count: Number(match[2]), tests: Object.keys(JSON.parse(readFileSync(file, "utf8"))) }] : [];
  });
  const problems = [];
  if (lists.length === 0) return [`No latency-tests.txt under ${dir}.`];
  const all = lists[0];
  if (lists.some((list) => list.join("\n") !== all.join("\n"))) problems.push("The shards listed different tests.");
  if (new Set(all).size !== all.length) problems.push("A test is listed twice.");
  const count = reports[0]?.count ?? 0;
  const indexes = reports.map((report) => report.index).sort((a, b) => a - b);
  if (count === 0 || reports.some((report) => report.count !== count) || indexes.join() !== Array.from({ length: count }, (_, index) => index + 1).join()) problems.push(`Expected one report from each shard, got ${reports.map((report) => `${report.index}/${report.count}`).join(", ") || "none"}.`);
  const ranBy = new Map();
  for (const report of reports) for (const test of report.tests) ranBy.set(test, [...(ranBy.get(test) ?? []), `${report.index}/${report.count}`]);
  for (const [test, shards] of ranBy) if (shards.length > 1) problems.push(`Ran in more than one shard (${shards.join(", ")}): ${test}`);
  for (const test of all) if (!ranBy.has(test)) problems.push(`Ran in no shard: ${test}`);
  for (const test of ranBy.keys()) if (!all.includes(test)) problems.push(`Ran but not listed: ${test}`);
  return problems;
}

const sortedObject = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : 1)));

function main([command, ...args]) {
  if (command === "scripts-browser") {
    console.log(scriptTestFiles().filter((file) => drivesBrowser(file)).join("\n"));
    return 0;
  }
  if (command === "scripts") {
    const files = scriptTestFiles().filter((file) => !drivesBrowser(file));
    console.log(shardKeys(files, parseShard(args[0]), readTimings("scripts")).join("\n"));
    return 0;
  }
  if (command === "e2e") {
    console.log(shardKeys(e2eFiles(), parseShard(args[0]), readTimings("e2e")).join("\n"));
    return 0;
  }
  if (command === "install-e2e") {
    console.log(installSpecShard(installSpecs(args[1] ?? "."), parseShard(args[0])).join("\n"));
    return 0;
  }
  if (command === "install") {
    console.log(installShard(installFiles(args[1] ?? "."), parseShard(args[0])).join("\n"));
    return 0;
  }
  if (command === "latency-list") {
    console.log(latencyTests().join("\n"));
    return 0;
  }
  if (command === "latency") {
    const tests = readFileSync(args[1], "utf8").split("\n").filter(Boolean);
    console.log(shardKeys(tests, parseShard(args[0]), readTimings("latency")).join("\n"));
    return 0;
  }
  if (command === "latency-check") {
    const problems = checkLatencyShards(args[0]);
    for (const problem of problems) console.error(`::error::${problem}`);
    if (problems.length === 0) console.log("The latency shards ran every listed test exactly once between them.");
    return problems.length === 0 ? 0 : 1;
  }
  if (command === "plan") {
    const [kind, count] = args;
    const timings = readTimings(kind);
    const keys = kind === "scripts" ? scriptTestFiles() : kind === "e2e" ? e2eFiles() : kind === "latency" ? latencyTests() : Object.keys(timings).filter((key) => !isSliced(key));
    // Every browser shard also runs its slice of each sliced suite; a shard's report holds its slice's time.
    const sliced = kind === "vitest" ? Object.keys(timings).filter(isSliced).reduce((sum, key) => sum + timings[key], 0) : 0;
    for (const [position, shard] of balance(keys, Number(count), timings).entries()) console.log(`${position + 1}/${count}: ${((shard.weight + sliced) / 1000).toFixed(0)} s of test files, ${shard.keys.length} files${sliced ? " and a slice of each sliced suite" : ""}`);
    return 0;
  }
  if (command === "refresh") {
    const found = collectTimings(args[0]);
    const counts = Object.entries(found).map(([kind, times]) => `${Object.keys(times).length} ${kind}`);
    if (Object.values(found).every((times) => Object.keys(times).length === 0)) {
      console.error(`No timing reports under ${args[0]}: download a CI run's timings-* artifacts there first.`);
      return 1;
    }
    const previous = existsSync(timingsFile) ? JSON.parse(readFileSync(timingsFile, "utf8")) : {};
    const next = Object.fromEntries(kinds.map((kind) => [kind, sortedObject(Object.keys(found[kind]).length > 0 ? found[kind] : (previous[kind] ?? {}))]));
    writeFileSync(timingsFile, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Wrote ${relative(root, timingsFile)}: ${counts.join(", ")} timings.`);
    return 0;
  }
  console.error("Usage: node scripts/shard.mjs scripts <index>/<count> | scripts-browser | e2e <index>/<count> | install <index>/<count> <app> | install-e2e <index>/<count> <app> | latency-list | latency <index>/<count> <list> | latency-check <dir> | plan <kind> <count> | refresh <dir>");
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
