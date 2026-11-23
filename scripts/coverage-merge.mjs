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
//                                           4 when a shard's own file was instrumented twice (its
//                                           statement, function or branch map holds the same
//                                           source location under two different keys), which
//                                           inflates that file's denominator and reports a fully
//                                           covered file as short (issue #3082)
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

/**
 * The merged coverage of `maps` (istanbul coverage-final.json objects): its totals and every file
 * short of a threshold, with the lines no shard reached. With `labels` (one per map, same order),
 * a short file also names the labelled shards whose own share of that file is itself short, so a
 * shard whose run lost a file's coverage is named directly rather than only the merged percentage.
 */
export async function mergeCoverage(maps, labels) {
  const { createCoverageMap } = await istanbul();
  const merged = createCoverageMap({});
  for (const map of maps) merged.merge(map);
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
  const maps = files.map((file) => JSON.parse(readFileSync(file, "utf8")));
  const doubled = maps.flatMap((map, index) => doubledFiles(map).map((one) => ({ ...one, shard: labels[index] })));
  if (doubled.length > 0) {
    for (const { shard, file, duplicates } of doubled) console.error(`::error::${shard}'s own coverage-final.json instruments ${file} twice (${duplicates} duplicate location${duplicates === 1 ? "" : "s"}): merging it would make a fully covered file look short. Rerun that shard instead of chasing the file.`);
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
