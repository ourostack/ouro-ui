// Puts the hourly ledger (the adoption-data branch) into the site before Pages builds it, when that ledger is newer than the
// copy committed on main, so /adoption/ opens on the last hourly measurement rather than on whenever the copy was committed.
// A ledger that cannot be fetched or read leaves the committed copy in place, with a warning: the build never fails on it.
//
//   node scripts/adoption/take-newest.mjs <url of ledger.json> <site copy>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The ledger to build in: `candidate` when it is a ledger of the same schema measured later than `current`. */
export function newest(current, candidate) {
  const ok = candidate && candidate.schema === current.schema && Array.isArray(candidate.surfaces) && typeof candidate.generatedAt === "string";
  return ok && Date.parse(candidate.generatedAt) > Date.parse(current.generatedAt) ? candidate : current;
}

async function main([url, file]) {
  const current = JSON.parse(readFileSync(file, "utf8"));
  let candidate = null;
  try {
    const response = await globalThis.fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    candidate = await response.json();
  } catch (error) {
    console.log(`::warning::Building /adoption/ from the committed ledger (${current.generatedAt}): ${error.message}`);
    return;
  }
  const chosen = newest(current, candidate);
  if (chosen === current) return console.log(`The committed ledger (${current.generatedAt}) is the newest.`);
  writeFileSync(file, `${JSON.stringify(chosen, null, 2)}\n`);
  console.log(`Building /adoption/ from the hourly ledger of ${chosen.generatedAt} (committed: ${current.generatedAt}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
