// Which latency spec files each CI shard runs. The latency suite runs one test at a time on its own
// runner so no other test shares the CPU; each shard is a runner of its own, so the suite's wall
// clock is its longest shard's. Shards are balanced by the spec files' measured seconds (run
// 43494330894, one runner: 13.6 minutes, about a minute of it the site build each shard repeats).
//
//   node scripts/latency-shards.mjs <shard>   prints the shard's spec files, for `pnpm test:latency`
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Each shard's spec files, with the seconds they took in run 43494330894. */
export const LATENCY_SHARDS = [
  { files: ["chapter-one.latency.spec.ts", "stage.latency.spec.ts"], seconds: 290 },
  { files: ["chapter-two.latency.spec.ts", "site-menu.latency.spec.ts"], seconds: 230 },
  { files: ["chapter-three.latency.spec.ts", "stage-switch.latency.spec.ts"], seconds: 236 },
];

/** The spec files on disk, as the latency config matches them. */
export function latencySpecs(dir = join(root, "site/e2e")) {
  return readdirSync(dir).filter((name) => name.endsWith(".latency.spec.ts")).sort();
}

/** The paths `playwright test` takes to run only this shard (1-based). */
export function shardPaths(shard) {
  const entry = LATENCY_SHARDS[shard - 1];
  if (!entry) throw new Error(`latency shard ${shard} does not exist: there are ${LATENCY_SHARDS.length}`);
  return entry.files.map((file) => `site/e2e/${file}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(shardPaths(Number(process.argv[2])).join(" "));
