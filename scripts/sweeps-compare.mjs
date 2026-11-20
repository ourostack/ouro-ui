// Compares a component's look across every part of the sameness sweep (#2527). Each part saves its looks
// (site/e2e/sameness-sweep.ts); this reads them all, per colour mode and engine, in part order, and runs the
// sweep's own comparison over the union, so a difference between two pages fails whichever parts they landed in.
// Usage: node scripts/sweeps-compare.mjs <dir holding the saved looks> [dir to write the used waivers to]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { filesIn } from "./waivers.mjs";
import { Looks } from "../site/e2e/looks.ts";
import { matched } from "../site/e2e/waivers.ts";

/** Groups the saved files by mode and engine, and says which part of a group saved nothing. */
export function groupParts(files) {
  const groups = new Map();
  for (const file of files) {
    const saved = JSON.parse(file);
    const name = `${saved.mode}, ${saved.engine}`;
    const group = groups.get(name) ?? { parts: saved.parts, found: new Map() };
    groups.set(name, group);
    group.found.set(saved.part, saved.looks);
  }
  const missing = [];
  for (const [name, { parts, found }] of groups) {
    for (let part = 1; part <= parts; part++) if (!found.has(part)) missing.push(`${name}: part ${part} of ${parts} saved no looks`);
  }
  return { groups, missing };
}

/** The findings over every part of each group, and a line on what each group compared. */
export async function compare(files) {
  const { groups, missing } = groupParts(files);
  const findings = [...missing];
  const summary = [];
  for (const [name, { parts, found }] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const looks = new Looks();
    for (let part = 1; part <= parts; part++) if (found.has(part)) await looks.merge(found.get(part));
    summary.push(`${name}: ${looks.keys} component states, ${looks.crops} pictures, over ${parts} part(s)`);
    for (const f of looks.differences()) findings.push(`${name}: ${f}`);
    for (const f of looks.pixelDifferences()) findings.push(`${name}: ${f}`);
    for (const side of looks.sides()) summary.push(`SIDES ${name}: ${side}`);
  }
  if (groups.size === 0) findings.push("no sweep part saved any looks");
  return { findings, summary };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const dir = process.argv[2];
  const files = filesIn(dir).filter((f) => /sameness-.*\.json$/.test(f)).sort().map((f) => readFileSync(f, "utf8"));
  const { findings, summary } = await compare(files);
  for (const line of summary) console.log(line);
  const out = process.argv[3];
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "waivers-sameness-compare.json"), JSON.stringify([...matched]));
  }
  if (findings.length > 0) {
    for (const f of findings) console.log(`::error::${f}`);
    console.error(`${findings.length} difference(s) between pages that render the same component.`);
    process.exit(1);
  }
  console.log("Every component looks the same on every page, across every part.");
}
