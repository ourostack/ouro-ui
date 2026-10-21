// What CI's mutation jobs plan with before they install anything, so only Node's own modules:
// how long each test file takes (for splitting the changed files across shards), which files a
// change's mutants depend on (for the key of the results kept between runs), and how the shards'
// results become one file again.
//
//   node scripts/mutation/cache.mjs seconds <vitest log>        rewrites test-seconds.json from a CI `ci` job's log
//   node scripts/mutation/cache.mjs key <base>                  the dependency hash of the change against <base>
//   node scripts/mutation/cache.mjs merge <out> <report>...     one incremental report from the shards'
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const componentsDir = "registry/ouro/components/ouro/";
export const libDir = "registry/ouro/lib/ouro/";
const secondsFile = "scripts/mutation/test-seconds.json";

/** Whether a path is runtime source the mutation run mutates: component and lib code, not tests, stories, types or the test kit. */
export function runtimeSource(path) {
  if (!/\.(ts|tsx)$/.test(path) || /\.(test|test-d|stories)\.tsx?$|\.d\.ts$|\.touch\.test\./.test(path)) return false;
  if (path.startsWith(componentsDir)) return true;
  return path.startsWith(libDir) && !path.startsWith(`${libDir}testing/`);
}

/**
 * Each test file's time in the `ouro-chromium` project, in seconds, from a Vitest run's output (a
 * CI `ci` job's log: colour codes and timestamps are dropped). The mutation runner runs that project.
 */
export function parseTestSeconds(log) {
  const seconds = {};
  const plain = log.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");
  for (const [, file, ms] of plain.matchAll(/ ouro-chromium \(chromium\) +(\S+\.test\.tsx?) \([^)]*\) +(\d+)ms/g)) seconds[file] = Math.round(Number(ms)) / 1000;
  return Object.fromEntries(Object.entries(seconds).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The committed test times, `{}` when there are none. */
export function testSeconds(rootDir = root) {
  const path = join(rootDir, secondsFile);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

/** A test file with no measured time (new since the last measurement) counts as this many seconds. */
export const unmeasuredSeconds = 5;
/** What re-running the tests for one mutant costs before any test runs, in seconds. */
export const mutantOverhead = 1;
/**
 * The share of a test set's time a mutant runs, on average: a killed mutant stops at its first
 * failing test, a surviving one runs them all; and the share of the shard's test files' time its
 * first, unmutated run takes. Fitted to the cold shards of acf89894 and 03c8bf0a (about 0.3 to 0.6).
 */
export const testShare = 0.5;

/**
 * What a shard of files costs, in seconds: each mutant's overhead and its share of its own file's
 * tests, plus the first run over every test file the shard needs, the importers' of a lib/ file
 * included. `files` maps each path to `{ mutants, own, wider }`.
 */
export function shardCost(paths, files, seconds) {
  const time = (file) => seconds[file] ?? unmeasuredSeconds;
  let total = 0;
  const tests = new Set();
  for (const path of paths) {
    const { mutants, own, wider } = files[path];
    total += mutants * (mutantOverhead + testShare * own.reduce((sum, file) => sum + time(file), 0));
    for (const file of [...own, ...wider]) tests.add(file);
  }
  for (const file of tests) total += testShare * time(file);
  return total;
}

/**
 * The files split across `count` shards, the costliest alone first, each into the shard it
 * raises least (`shardCost`), so the shards finish close together.
 */
export function planShards(files, count, seconds) {
  const shards = Array.from({ length: count }, () => []);
  const alone = (path) => shardCost([path], files, seconds);
  for (const path of Object.keys(files).sort((a, b) => alone(b) - alone(a) || (a < b ? -1 : 1))) {
    let best = 0;
    let bestCost = Infinity;
    for (const [index, shard] of shards.entries()) {
      const cost = shardCost([...shard, path], files, seconds);
      if (cost < bestCost) [best, bestCost] = [index, cost];
    }
    shards[best].push(path);
  }
  return shards.map((shard) => shard.sort());
}

/** The local modules a source file imports: `@/…` and relative specifiers, as repository paths without an extension. */
export function importsOf(path, text) {
  const specifiers = [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]);
  return specifiers.flatMap((specifier) => {
    if (specifier.startsWith("@/")) return [specifier.slice(2)];
    if (specifier.startsWith(".")) return [normalize(join(dirname(path), specifier)).split("\\").join("/")];
    return [];
  });
}

/** A module path without an extension, as the file that holds it, or null. */
function resolve(stem, exists) {
  for (const candidate of [stem, `${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`, `${stem}/index.tsx`]) if (/\.(ts|tsx|mts|mjs|css)$/.test(candidate) && exists(candidate)) return candidate;
  return null;
}

/** What decides a mutant's outcome beyond the code and its tests: the packages, the styles every test loads, the runner and its setup. */
export const harnessFiles = ["pnpm-lock.yaml", "app.css", "vitest.config.ts", "scripts/mutation/setup.ts", "scripts/mutation/plugins.mjs"];
const themeDir = "registry/ouro/theme/";

/**
 * What a change's mutants depend on beyond their own files: every lib/ and theme file, the harness
 * (`harnessFiles`), the tests that run on the mutants, and every module any of these or the changed
 * files import, directly or through each other. Stryker's incremental mode compares only a mutated
 * file (the mutation run gives it no test file to compare), so a result kept from a run before one
 * of these changed could be stale. The changed files themselves are left out, so a push that
 * changes them keeps its key: `pruneChangedFiles` drops their kept results instead.
 */
export function dependencyFiles(
  changed,
  { read = (path) => readFileSync(join(root, path), "utf8"), exists = (path) => existsSync(join(root, path)), list = listKept, harness = harnessFiles, tests = [] } = {},
) {
  const roots = [...harness, ...tests].filter((path) => exists(path) && !changed.includes(path));
  const found = new Set([...list(), ...roots]);
  const queue = [...changed, ...roots];
  const seen = new Set([...changed, ...roots]);
  while (queue.length > 0) {
    const path = queue.shift();
    for (const stem of importsOf(path, read(path))) {
      const file = resolve(stem, exists);
      if (!file || seen.has(file)) continue;
      seen.add(file);
      found.add(file);
      queue.push(file);
    }
  }
  return [...found].sort();
}

function listKept() {
  const under = (dir, pattern) =>
    readdirSync(join(root, dir), { recursive: true })
      .map((path) => `${dir}${String(path).split("\\").join("/")}`)
      .filter((path) => pattern.test(path));
  return [...under(libDir, /\.(ts|tsx|mjs)$/), ...under(themeDir, /\.(css|json|ts)$/)];
}

/** The component folder's test files (not the visual ones, which the mutation runner leaves out). */
function testsIn(dir, rootDir = root) {
  return existsSync(join(rootDir, dir))
    ? readdirSync(join(rootDir, dir))
        .filter((file) => /\.test\.tsx?$/.test(file) && !/\.visual\.test\./.test(file))
        .map((file) => `${dir}${file}`)
    : [];
}

/** The component folders whose runtime code imports a lib/ file (`lib/ouro/<name>`), directly. */
function importersOf(libFile, rootDir = root) {
  const name = libFile.slice(libDir.length).replace(/\.tsx?$/, "");
  const pattern = new RegExp(`from "@/registry/ouro/lib/ouro/${name}"`);
  const folders = readdirSync(join(rootDir, componentsDir)).filter((folder) =>
    readdirSync(join(rootDir, componentsDir, folder)).some((file) => runtimeSource(`${componentsDir}${folder}/${file}`) && pattern.test(readFileSync(join(rootDir, componentsDir, folder, file), "utf8"))),
  );
  return folders.sort();
}

/**
 * The test files that can kill a mutant in these runtime files: `own`, each component file's
 * folder's tests and each lib/ file's own tests, and `wider`, the tests of the folders whose code
 * imports a changed lib/ file (a helper some branch of which only a component's tests reach).
 */
export function testFilesFor(paths, rootDir = root) {
  const own = new Set();
  const wider = new Set();
  for (const path of paths) {
    if (path.startsWith(componentsDir)) {
      for (const file of testsIn(`${componentsDir}${path.slice(componentsDir.length).split("/")[0]}/`, rootDir)) own.add(file);
    } else {
      const stem = path.replace(/\.tsx?$/, "");
      for (const extension of [".test.ts", ".test.tsx"]) if (existsSync(join(rootDir, `${stem}${extension}`))) own.add(`${stem}${extension}`);
      for (const folder of importersOf(path, rootDir)) for (const file of testsIn(`${componentsDir}${folder}/`, rootDir)) wider.add(file);
    }
  }
  return { own: [...own].sort(), wider: [...wider].filter((file) => !own.has(file)).sort() };
}

/** A short hash of the files' paths and contents. */
export function dependencyHash(files, read = (path) => readFileSync(join(root, path), "utf8")) {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) hash.update(`${file}\0${read(file)}\0`);
  return hash.digest("hex").slice(0, 16);
}

/**
 * One Stryker incremental report from the shards' reports. Each report numbers its tests from 0,
 * so a test is renamed by its file and name, the same in every report, and each mutant's
 * `killedBy` and `coveredBy` follow.
 */
const mutantKey = ({ id, mutatorName, replacement, location }) =>
  location ? `${location.start.line}:${location.start.column}-${location.end.line}:${location.end.column} ${mutatorName} ${replacement}` : `#${id}`;

const undetected = ({ status }) => status === "Survived" || status === "NoCoverage";

/**
 * A shard's incremental report cut to the mutants inside its own ranges (`changes`: path to
 * 1-based line ranges, as `mutateRanges` gives Stryker, which takes a mutant inside a range only
 * when it lies wholly within it). Stryker writes into the report every mutant it was not asked to
 * run as well, with the status it last had: stale in another shard's report.
 */
export function scopeReport(report, changes) {
  const files = {};
  for (const [path, file] of Object.entries(report.files ?? {})) {
    const ranges = changes[path] ?? [];
    const mutants = file.mutants.filter(({ location }) => location && ranges.some(([start, end]) => location.start.line >= start && location.end.line <= end));
    if (mutants.length > 0) files[path] = { ...file, mutants };
  }
  return { ...report, files };
}

/**
 * The kept report without the results of any file whose source differs from the one they were
 * found on (or that is gone): Stryker would reuse a Killed on a line a change left alone, though
 * what the line does may differ now.
 */
export function pruneChangedFiles(report, read = (path) => readFileSync(join(root, path), "utf8")) {
  const same = (path, source) => {
    try {
      return read(path) === source;
    } catch {
      return false;
    }
  };
  return { ...report, files: Object.fromEntries(Object.entries(report.files ?? {}).filter(([path, file]) => same(path, file.source))) };
}

export function mergeReports(reports) {
  const merged = { ...reports[0], files: {}, testFiles: {} };
  const ids = new Map();
  const canonical = (file, name) => {
    const key = `${file}\0${name}`;
    if (!ids.has(key)) {
      ids.set(key, String(ids.size));
      (merged.testFiles[file] ??= { ...(reports.find((report) => report.testFiles?.[file])?.testFiles[file] ?? {}), tests: [] }).tests.push({ id: ids.get(key), name });
    }
    return ids.get(key);
  };
  for (const report of reports) {
    const local = new Map();
    for (const [file, { tests }] of Object.entries(report.testFiles ?? {})) {
      for (const test of tests) local.set(test.id, canonical(file, test.name));
    }
    const rename = (list) => list?.map((id) => local.get(id) ?? id);
    // A file's changed ranges can fall in different shards, so a file's mutants are the union of theirs.
    for (const [path, file] of Object.entries(report.files ?? {})) {
      const kept = merged.files[path]?.mutants ?? [];
      const mutants = file.mutants.map((mutant) => ({ ...mutant, ...(mutant.killedBy ? { killedBy: rename(mutant.killedBy) } : {}), ...(mutant.coveredBy ? { coveredBy: rename(mutant.coveredBy) } : {}) }));
      const fresh = new Set(mutants.map(mutantKey));
      const taken = new Set(mutants.map((mutant) => mutant.id));
      // The same mutant twice: a shard's report is cut to its own ranges (scopeReport), so this is
      // a report that was not; its copy may be a status carried over from an older run, and a
      // mutant no test failed on must not be hidden by one.
      const keep = new Map(kept.map((mutant) => [mutantKey(mutant), mutant]));
      for (const [index, mutant] of mutants.entries()) {
        const old = keep.get(mutantKey(mutant));
        if (old && undetected(old) && !undetected(mutant)) mutants[index] = { ...old, id: mutant.id };
      }
      const others = kept.filter((mutant) => !fresh.has(mutantKey(mutant)));
      for (const mutant of others) {
        let { id } = mutant;
        while (taken.has(id)) id = `${id}'`;
        taken.add(id);
        mutant.id = id;
      }
      merged.files[path] = { ...file, mutants: [...others, ...mutants] };
    }
  }
  return merged;
}

function main([command, ...args]) {
  if (command === "seconds") {
    const seconds = parseTestSeconds(readFileSync(args[0], "utf8"));
    writeFileSync(join(root, secondsFile), `${JSON.stringify(seconds, null, 2)}\n`);
    console.log(`${Object.keys(seconds).length} test files timed into ${secondsFile}.`);
    return 0;
  }
  if (command === "key") {
    const diff = spawnSync("git", ["diff", "--name-only", "-M", args[0] ?? "origin/main", "--", componentsDir, libDir], { cwd: root, encoding: "utf8" });
    if (diff.status !== 0) throw new Error(`git diff failed: ${diff.stderr}`);
    const changed = diff.stdout.split("\n").filter((path) => path && runtimeSource(path) && existsSync(join(root, path)));
    const { own, wider } = testFilesFor(changed);
    console.log(dependencyHash(dependencyFiles(changed, { tests: [...own, ...wider] })));
    return 0;
  }
  if (command === "merge") {
    const [out, ...inputs] = args;
    const reports = inputs.filter((path) => existsSync(path)).map((path) => JSON.parse(readFileSync(path, "utf8")));
    if (reports.length === 0) {
      console.log("No shard kept results: nothing to merge.");
      return 0;
    }
    writeFileSync(out, JSON.stringify(mergeReports(reports)));
    console.log(`Merged ${reports.length} shard report(s) into ${out}.`);
    return 0;
  }
  console.error("usage: cache.mjs seconds <vitest log> | key <base> | merge <out> <report>...");
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
