import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { treeFiles } from "./tree.mjs";

// Sums the per-test times the browser shards record (stories-<n>of<m>.json) into the cost of each story
// or site page, for test/slice-core.ts: node scripts/story-costs.mjs <dir of downloaded timings-browser-*>

const storyId = /\b([A-Z][A-Za-z0-9]*\/[A-Z][A-Za-z0-9]*)\b/;
const routePath = /> (\/[a-z0-9\-/]*\/) /;
const docsItem = /\b(docs\/[a-z0-9-]+) shows a live demo/;

/** The story id, page path or docs item a test name is about, or null. */
export function itemOf(name) {
  return (name.match(docsItem) ?? name.match(routePath) ?? name.match(storyId))?.[1] ?? null;
}

/** Total milliseconds per item across timing files, rounded and sorted by name. */
export function costsOf(files) {
  const totals = {};
  for (const file of files) {
    for (const [name, ms] of Object.entries(file)) {
      const item = itemOf(name);
      if (item) totals[item] = (totals[item] ?? 0) + ms;
    }
  }
  return Object.fromEntries(Object.entries(totals).sort(([a], [b]) => (a < b ? -1 : 1)).map(([item, ms]) => [item, Math.round(ms)]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  const files = treeFiles(dir)
    .filter((path) => /(^|\/)stories-\d+of\d+\.json$/.test(String(path)))
    .map((path) => JSON.parse(readFileSync(join(dir, String(path)), "utf8")));
  writeFileSync(pathToFileURL(join(fileURLToPath(import.meta.url), "../../test/story-costs.json")), `${JSON.stringify(costsOf(files), null, 2)}\n`);
}
