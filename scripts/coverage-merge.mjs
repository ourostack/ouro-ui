/* global structuredClone */
// Merges the coverage CI's browser test shards wrote (each shard's coverage/coverage-final.json,
// vitest.config.ts) and holds the whole to the repository's thresholds: 100% of lines, branches,
// functions and statements of every file the runs measured. Vitest checks the thresholds itself on
// an unsharded run; a shard measures only its share, so the check moves here.
//
//   node scripts/coverage-merge.mjs <dir> --shards <count>
//                                           merges every coverage-final.json under <dir> (any
//                                           depth), which must be one per shard; exits 1, naming
//                                           a file and line short of 100% with the shard folder
//                                           behind a share of it that is itself short, when the
//                                           merged coverage is short; 3 when a shard's is missing;
//                                           4 when a shard's own file was instrumented twice with a
//                                           different number of statement, function or branch
//                                           entries than the other shards that measured the same
//                                           file (across shards), either under the same source
//                                           location with two different keys (one shard's own map)
//                                           or at different locations: either way the extra entries
//                                           would inflate that file's denominator and report a
//                                           fully covered file as short (issue #3082) — unless
//                                           every extra entry has zero hits and repeats the other
//                                           shards' own entries as an exact prefix, which
//                                           reconcileDuplicateTails trims away first, since that
//                                           shape is a harmless race in the coverage provider's own
//                                           instrumentation of a file none of that shard's projects
//                                           executed, not a second, disputed measurement (flake log
//                                           #2469)
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The thresholds vitest.config.ts sets (scripts/workflows.test.mjs holds them equal). */
export const thresholds = { lines: 100, branches: 100, functions: 100, statements: 100 };

/** The istanbul library @vitest/coverage-istanbul writes its maps with, so merging reads them as it wrote them. */
async function istanbul() {
  const provider = createRequire(import.meta.url).resolve("@vitest/coverage-istanbul");
  return import(pathToFileURL(createRequire(provider).resolve("@vitest/istanbul-lib-coverage")).href);
}

/** Every coverage-final.json under `dir`, sorted. */
export const coverageFiles = (dir) =>
  readdirSync(dir, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith("coverage-final.json"))
    .sort()
    .map((file) => join(dir, file));

/** `loc`'s location as a string key: a statementMap entry is itself a location, a fnMap or branchMap entry holds one at `.loc`. */
const locationKey = (item) => {
  const loc = item.start ? item : item.loc;
  return `${loc.start.line}:${loc.start.column}-${loc.end.line}:${loc.end.column}`;
};

/** The location keys that appear more than once in `itemMap` (a statementMap, fnMap or branchMap): a healthy instrumentation never maps two different keys to the same source location. */
const duplicateLocations = (itemMap) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of Object.values(itemMap ?? {})) {
    const key = locationKey(item);
    (seen.has(key) ? duplicates : seen).add(key);
  }
  return duplicates;
};

/**
 * Every file one shard's own coverage-final.json (`map`) instruments twice: its statement,
 * function or branch map holds the same source location under two different keys, as when a
 * module was loaded and instrumented under two different URLs in the same shard run (issue
 * #3082). Merging such a file inflates its denominator, so a fully covered file reports short.
 */
export const doubledFiles = (map) =>
  Object.entries(map)
    .map(([file, fc]) => ({ file, duplicates: duplicateLocations(fc.statementMap).size + duplicateLocations(fc.fnMap).size + duplicateLocations(fc.branchMap).size }))
    .filter(({ duplicates }) => duplicates > 0);

/** A file's instrumentation shape: how many statement, function and branch map entries istanbul wrote for it. The same source always instruments to the same shape, whichever shard measured it. */
const shapeOf = (fc) => `${Object.keys(fc.statementMap ?? {}).length}:${Object.keys(fc.fnMap ?? {}).length}:${Object.keys(fc.branchMap ?? {}).length}`;

/**
 * Every file whose shape (`shapeOf`) disagrees between two shards that both report it, in `maps`
 * (one per label in `labels`). The shards agreeing on a shape are the healthy ones; a shard with
 * any other shape instrumented the file under two module graphs whose extra entries don't repeat
 * the healthy shards' locations exactly, so `doubledFiles` (an exact location repeated within one
 * shard's own map) misses it (issue #3082). Needs every shard's map at once, since the fault is
 * one shard disagreeing with the others, not a fault visible in any single shard's own map.
 */
export const mismatchedShapes = (maps, labels) => {
  const byFile = new Map();
  maps.forEach((map, index) => {
    for (const [file, fc] of Object.entries(map)) {
      if (!byFile.has(file)) byFile.set(file, []);
      byFile.get(file).push({ shard: labels[index], shape: shapeOf(fc) });
    }
  });
  const problems = [];
  for (const [file, entries] of byFile) {
    const shapeCounts = new Map();
    for (const { shape } of entries) shapeCounts.set(shape, (shapeCounts.get(shape) ?? 0) + 1);
    if (shapeCounts.size < 2) continue;
    const majorityShape = [...shapeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (const { shard, shape } of entries) if (shape !== majorityShape) problems.push({ file, shard });
  }
  return problems;
};

const mapKeys = ["statementMap", "fnMap", "branchMap"];
const hitKeyOf = { statementMap: "s", fnMap: "f", branchMap: "b" };

/** The total of a hit count, which is a plain number for a statement or function and an array of per-path counts for a branch. */
const hitTotal = (hit) => (Array.isArray(hit) ? hit.reduce((sum, one) => sum + one, 0) : (hit ?? 0));

/**
 * `fc`, with every map and hit-count entry trimmed to the ids `majorityFc` itself has, when `fc`'s
 * statement, function and branch maps repeat `majorityFc`'s own ids at `majorityFc`'s own locations
 * exactly and every id beyond them has zero hits everywhere; `null` when any of that isn't so (an id
 * `majorityFc` has at a different location, an id `majorityFc` lacks, or an extra id with even one
 * hit), which leaves the file to `mismatchedShapes`.
 */
const reconcileOne = (majorityFc, fc) => {
  for (const mapKey of mapKeys) {
    const majorityMap = majorityFc[mapKey] ?? {};
    const map = fc[mapKey] ?? {};
    const majorityIds = Object.keys(majorityMap);
    if (Object.keys(map).length <= majorityIds.length) return null;
    for (const id of majorityIds) if (!(id in map) || locationKey(map[id]) !== locationKey(majorityMap[id])) return null;
    const hits = fc[hitKeyOf[mapKey]] ?? {};
    for (const id of Object.keys(map)) if (!majorityIds.includes(id) && hitTotal(hits[id]) !== 0) return null;
  }
  const trimmed = { ...fc };
  for (const mapKey of mapKeys) {
    const majorityIds = Object.keys(majorityFc[mapKey] ?? {});
    const hitKey = hitKeyOf[mapKey];
    trimmed[mapKey] = Object.fromEntries(majorityIds.map((id) => [id, fc[mapKey][id]]));
    trimmed[hitKey] = Object.fromEntries(majorityIds.map((id) => [id, fc[hitKey][id]]));
  }
  return trimmed;
};

/**
 * `maps`, with every shard's file that `mismatchedShapes` would flag reconciled to the majority
 * shape where that's safe (`reconcileOne`), so merging never runs on a file still in dispute. A
 * reconciled file's extra entries carry zero hits throughout, so trimming them cannot turn a
 * genuinely covered line, function or branch short: the shard's real measurement, whatever it is,
 * lives entirely in the entries the majority shape already accounts for. `@vitest/coverage-istanbul`
 * instruments a file its browser projects never execute through its own "uncovered files" pass
 * (`getCoverageMapForUncoveredFiles`, which keeps its coverage in one instrumenter shared by every
 * project, admittedly "cannot be run parallel"), once per project that finds the file uncovered;
 * when two of a shard's projects race to do that for the same file, the second's instrumentation
 * lands at different (but equally unexecuted) locations in the one shard's map, inflating its shape
 * with a tail of zero-hit entries (flake log #2469, issues #3082 and #3171's earlier recurrences,
 * this one's root cause). A file whose extra entries disagree with the majority on a shared id, or
 * carry even one hit, is left for `mismatchedShapes` to fail loudly: a genuinely different
 * measurement, not a race's harmless duplicate.
 */
export const reconcileDuplicateTails = (maps, labels) => {
  const byFile = new Map();
  maps.forEach((map, index) => {
    for (const file of Object.keys(map)) {
      if (!byFile.has(file)) byFile.set(file, []);
      byFile.get(file).push(index);
    }
  });
  const reconciled = maps.map((map) => ({ ...map }));
  const notes = [];
  for (const [file, indices] of byFile) {
    const shapeCounts = new Map();
    for (const index of indices) shapeCounts.set(shapeOf(maps[index][file]), (shapeCounts.get(shapeOf(maps[index][file])) ?? 0) + 1);
    if (shapeCounts.size < 2) continue;
    const majorityShape = [...shapeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const majorityFc = maps[indices.find((index) => shapeOf(maps[index][file]) === majorityShape)][file];
    for (const index of indices) {
      const fc = maps[index][file];
      if (shapeOf(fc) === majorityShape) continue;
      const trimmed = reconcileOne(majorityFc, fc);
      if (!trimmed) continue;
      reconciled[index] = { ...reconciled[index], [file]: trimmed };
      notes.push({ file, shard: labels[index] });
    }
  }
  return { maps: reconciled, notes };
};

/**
 * The merged coverage of `maps` (istanbul coverage-final.json objects): its totals and every file
 * short of a threshold, with the lines no shard reached. With `labels` (one per map, same order),
 * a short file also names the labelled shards whose own share of that file is itself short, so a
 * shard whose run lost a file's coverage is named directly rather than only the merged percentage.
 */
export async function mergeCoverage(maps, labels) {
  const { createCoverageMap } = await istanbul();
  const merged = createCoverageMap({});
  // istanbul's merge reuses and mutates a shard's own file coverage object when it is the first
  // to report a file, so without cloning, reading `maps[index][file]` below for its own share
  // would read back the merged total instead, misnaming a clean shard as the short one (#3082).
  for (const map of maps) merged.merge(structuredClone(map));
  const short = [];
  for (const file of merged.files().sort()) {
    const coverage = merged.fileCoverageFor(file);
    const summary = coverage.toSummary();
    const metrics = Object.keys(thresholds).filter((metric) => summary[metric].pct < thresholds[metric]);
    if (metrics.length === 0) continue;
    const entry = { file, metrics: Object.fromEntries(metrics.map((metric) => [metric, summary[metric].pct])), lines: coverage.getUncoveredLines() };
    if (labels) {
      entry.by = [];
      for (const [index, map] of maps.entries()) {
        if (!map[file]) continue;
        const own = createCoverageMap({});
        own.addFileCoverage(map[file]);
        const ownSummary = own.fileCoverageFor(file).toSummary();
        const ownMetrics = Object.keys(thresholds).filter((metric) => ownSummary[metric].pct < thresholds[metric]);
        if (ownMetrics.length > 0) entry.by.push({ shard: labels[index], metrics: Object.fromEntries(ownMetrics.map((metric) => [metric, ownSummary[metric].pct])) });
      }
    }
    short.push(entry);
  }
  const total = merged.getCoverageSummary();
  return { files: merged.files().length, totals: Object.fromEntries(Object.keys(thresholds).map((metric) => [metric, total[metric].pct])), short };
}

async function main([dir, flag, count]) {
  if (!dir || flag !== "--shards" || !/^\d+$/.test(count ?? "")) {
    console.error("Usage: node scripts/coverage-merge.mjs <dir> --shards <count>");
    return 2;
  }
  const files = coverageFiles(dir);
  if (files.length !== Number(count)) {
    console.error(`::error::${files.length} coverage-final.json under ${dir}, for ${count} browser test shards: each shard uploads its own, so one is missing or doubled.`);
    return 3;
  }
  const labels = files.map((file) => basename(dirname(file)));
  const rawMaps = files.map((file) => JSON.parse(readFileSync(file, "utf8")));
  const { maps, notes } = reconcileDuplicateTails(rawMaps, labels);
  for (const { shard, file } of notes) console.log(`${shard}'s own coverage-final.json instrumented ${file} twice (an unexecuted file instrumented once per project that raced to do so, flake log #2469); kept only the measured copy.`);
  const doubled = maps.flatMap((map, index) => doubledFiles(map).map((one) => ({ ...one, shard: labels[index] })));
  const mismatched = mismatchedShapes(maps, labels);
  if (doubled.length > 0 || mismatched.length > 0) {
    for (const { shard, file, duplicates } of doubled) console.error(`::error::${shard}'s own coverage-final.json instruments ${file} twice (${duplicates} duplicate location${duplicates === 1 ? "" : "s"}): merging it would make a fully covered file look short. Rerun that shard instead of chasing the file.`);
    for (const { shard, file } of mismatched) console.error(`::error::${shard}'s own coverage-final.json instruments ${file} differently from the other shards that measured it (a different number of statement, function or branch map entries): merging it would make a fully covered file look short. Rerun that shard instead of chasing the file.`);
    return 4;
  }
  const result = await mergeCoverage(maps, labels);
  const totals = Object.entries(result.totals).map(([metric, pct]) => `${metric} ${pct}%`).join(", ");
  console.log(`Coverage of ${result.files} files, merged from ${files.length} shards: ${totals}.`);
  if (result.files === 0) {
    console.error("::error::The shards measured no file.");
    return 3;
  }
  if (result.short.length === 0) return 0;
  for (const { file, metrics, lines, by } of result.short) {
    const byText = by.length > 0 ? `; by shard: ${by.map((one) => `${one.shard} (${Object.entries(one.metrics).map(([metric, pct]) => `${metric} ${pct}%`).join(", ")})`).join(", ")}` : "";
    console.log(`${file}: ${Object.entries(metrics).map(([metric, pct]) => `${metric} ${pct}%`).join(", ")}${lines.length > 0 ? `; lines no test reached: ${lines.join(", ")}` : ""}${byText}`);
  }
  console.log(`::error::Coverage is short of 100% in ${result.short.length} file${result.short.length === 1 ? "" : "s"} (above). Cover each line in the item's own tests.`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
