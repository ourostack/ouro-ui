// Which latency spec files each CI shard runs. The latency suite runs one test at a time on its own
// runner so no other test shares the CPU; each shard is a runner of its own, so the suite's wall
// clock is its longest shard's. Shards are balanced by the spec files' measured seconds; each shard
// also repeats about 70 seconds of setup (the container, the install and the site build), which
// the balance leaves out.
//
//   node scripts/latency-shards.mjs <shard>   prints the shard's spec files and title filter, for `pnpm test:latency`
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The Chapter III controls the first of its two shards runs; the second runs every other test in that file. */
const CHAPTER_THREE_FIRST = "(encounter-code|alarm|orders|palette|feathers|surface|saloon-code)\\sanswers";

/**
 * Each shard's spec files, with the seconds they took in run 45625761833 (summed per file from the
 * four shards' logs; Chapter III's 329 s is split in half between its two shards, by test count).
 * A shard with a `grep` or `grepInvert` runs only the tests whose title matches (or does not match) it.
 */
export const LATENCY_SHARDS = [
  { files: ["chapter-three.latency.spec.ts"], grep: CHAPTER_THREE_FIRST, seconds: 165 },
  { files: ["chapter-three.latency.spec.ts"], grepInvert: CHAPTER_THREE_FIRST, seconds: 165 },
  { files: ["chapter-one.latency.spec.ts"], seconds: 230 },
  { files: ["chapter-two.latency.spec.ts"], seconds: 224 },
  { files: ["stage.latency.spec.ts", "stage-switch.latency.spec.ts"], seconds: 226 },
  { files: ["site-menu.latency.spec.ts", "patterns.latency.spec.ts"], seconds: 117 },
];

/** The spec files on disk, as the latency config matches them. */
export function latencySpecs(dir = join(root, "site/e2e")) {
  return readdirSync(dir).filter((name) => name.endsWith(".latency.spec.ts")).sort();
}

/** The arguments `playwright test` takes to run only this shard (1-based): its spec paths, then its title filter if it has one. */
export function shardArgs(shard) {
  const entry = LATENCY_SHARDS[shard - 1];
  const filter = entry?.grep ? [`--grep=${entry.grep}`] : entry?.grepInvert ? [`--grep-invert=${entry.grepInvert}`] : [];
  return [...shardPaths(shard), ...filter];
}

/** The paths `playwright test` takes to run only this shard (1-based). */
export function shardPaths(shard) {
  const entry = LATENCY_SHARDS[shard - 1];
  if (!entry) throw new Error(`latency shard ${shard} does not exist: there are ${LATENCY_SHARDS.length}`);
  return entry.files.map((file) => `site/e2e/${file}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(shardArgs(Number(process.argv[2])).join(" "));
