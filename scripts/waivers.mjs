// Fails on a sweep waiver (site/e2e/waivers.ts) that no sweep used, so waivers cannot pile up.
// Usage: node scripts/waivers.mjs <dir holding the waivers-*.json files the sweeps wrote>
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { WAIVERS } from "../site/e2e/waivers.ts";

export function stale(used, waivers = WAIVERS) {
  return waivers.map((w, i) => [w, i]).filter(([, i]) => !used.has(i)).map(([w]) => `${w.component}|${w.part}|${w.variant}|${w.state} on ${w.page}: ${w.property}`);
}

export function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const dir = process.argv[2];
  const used = new Set(filesIn(dir).filter((f) => /waivers-.*\.json$/.test(f)).flatMap((f) => JSON.parse(readFileSync(f, "utf8"))));
  const unused = stale(used);
  if (unused.length > 0) {
    console.error(`::error::${unused.length} sweep waiver(s) matched nothing in any sweep; remove them from site/e2e/waivers.ts:\n${unused.join("\n")}`);
    process.exit(1);
  }
  console.log(`All ${WAIVERS.length} sweep waivers were used.`);
}
