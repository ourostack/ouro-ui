// Timing-balanced shards for CI (.github/workflows/ci.yml). Each shard gets a share of the test files
// whose measured times add up to about the same as every other shard's: the longest file first, each
// to the shard with the least so far. The times are scripts/shard-timings.json, written from a CI
// run's timing reports (`refresh`); a file it does not know yet weighs the median of every time it holds.
//
//   node scripts/shard.mjs scripts <index>/<count>   the test:scripts files of one shard, one per line
//   node scripts/shard.mjs install <index>/<count> <app>
//                                                    the shipped Vitest test files of one install
//                                                    shard, paths in the installed app <app>
//   node scripts/shard.mjs plan <kind> <count>       every shard of a kind, with its weight
//   node scripts/shard.mjs refresh <dir>             rewrites scripts/shard-timings.json from the
//                                                    timing reports under <dir> (any depth)
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
 */
export function balance(keys, count, timings) {
  const fallback = median(Object.values(timings).filter((value) => typeof value === "number"));
  const weightOf = (key) => (typeof timings[key] === "number" ? timings[key] : fallback);
  const shards = Array.from({ length: count }, () => ({ keys: [], weight: 0 }));
  const ordered = [...new Set(keys)].sort((a, b) => weightOf(b) - weightOf(a) || (a < b ? -1 : a > b ? 1 : 0));
  for (const key of ordered) {
    const lightest = shards.reduce((best, shard) => (shard.weight < best.weight ? shard : best), shards[0]);
    lightest.keys.push(key);
    lightest.weight += weightOf(key);
  }
  for (const shard of shards) shard.keys.sort();
  return shards;
}

/** The keys shard `index` (from 1) of `count` runs. */
export const shardKeys = (keys, { index, count }, timings) => balance(keys, count, timings)[index - 1].keys;

/** The files `pnpm test:scripts` runs, from package.json. */
export function scriptTestFiles(rootDir = root) {
  const script = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")).scripts["test:scripts"];
  return script.split(/\s+/).filter((word) => /\.test\.m?[jt]s$/.test(word));
}

/** Every file under `dir`, at any depth. */
const filesUnder = (dir) => readdirSync(dir, { recursive: true }).map(String).map((file) => join(dir, file));

/**
 * The times in the timing reports under `dir`: each `vitest-*.json` maps `<project> <file>` and each
 * `scripts-*.json` maps `<file>` to milliseconds. A key two reports both hold keeps the longer time.
 */
export function collectTimings(dir) {
  const timings = { vitest: {}, scripts: {} };
  for (const file of filesUnder(dir).sort()) {
    const kind = /(?:^|\/)(vitest|scripts)-[^/]*\.json$/.exec(file)?.[1];
    if (!kind) continue;
    for (const [key, ms] of Object.entries(JSON.parse(readFileSync(file, "utf8")))) timings[kind][key] = Math.max(timings[kind][key] ?? 0, Math.round(ms));
  }
  return timings;
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

const sortedObject = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : 1)));

function main([command, ...args]) {
  if (command === "scripts") {
    const files = scriptTestFiles();
    console.log(shardKeys(files, parseShard(args[0]), readTimings("scripts")).join("\n"));
    return 0;
  }
  if (command === "install") {
    console.log(installShard(installFiles(args[1] ?? "."), parseShard(args[0])).join("\n"));
    return 0;
  }
  if (command === "plan") {
    const [kind, count] = args;
    const timings = readTimings(kind);
    const keys = kind === "scripts" ? scriptTestFiles() : Object.keys(timings).filter((key) => !isSliced(key));
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
    const next = Object.fromEntries(["vitest", "scripts"].map((kind) => [kind, sortedObject(Object.keys(found[kind]).length > 0 ? found[kind] : (previous[kind] ?? {}))]));
    writeFileSync(timingsFile, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Wrote ${relative(root, timingsFile)}: ${counts.join(", ")} timings.`);
    return 0;
  }
  console.error("Usage: node scripts/shard.mjs scripts <index>/<count> | install <index>/<count> <app> | plan <kind> <count> | refresh <dir>");
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
