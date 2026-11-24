// Puts a list a scheduled run publishes on the adoption-data branch (the hourly ledger.json, Ouro Current's current.json)
// into the site before Pages builds it, when that list is newer than the copy committed on main, so /adoption/ and
// /current/ open on the last run rather than on whenever the copy was committed. A list that cannot be fetched or read
// leaves the committed copy in place, with a warning: the build never fails on it.
//
//   node scripts/adoption/take-newest.mjs <url of the list> <site copy>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The list to build in: `candidate` when it has the same schema and lists as `current`, and was made later. */
export function newest(current, candidate) {
  const lists = Object.keys(current).filter((key) => Array.isArray(current[key]));
  const ok = candidate && candidate.schema === current.schema && lists.every((key) => Array.isArray(candidate[key])) && typeof candidate.generatedAt === "string";
  return ok && Date.parse(candidate.generatedAt) > Date.parse(current.generatedAt) ? candidate : current;
}

export async function main([url, file]) {
  const current = JSON.parse(readFileSync(file, "utf8"));
  let candidate;
  try {
    // The contents API answers with the branch's current file; raw.githubusercontent.com may serve a copy minutes old.
    const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
    const api = url.startsWith("https://api.github.com/");
    const response = await globalThis.fetch(url, api ? { headers: { accept: "application/vnd.github.raw+json", ...(token ? { authorization: `Bearer ${token}` } : {}) } } : undefined);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    candidate = await response.json();
  } catch (error) {
    console.log(`::warning::Building ${file} from the committed copy (${current.generatedAt}): ${error.message}`);
    return;
  }
  const chosen = newest(current, candidate);
  if (chosen === current) return console.log(`The committed ${file} (${current.generatedAt}) is the newest.`);
  writeFileSync(file, `${JSON.stringify(chosen, null, 2)}\n`);
  console.log(`Building ${file} from the published list of ${chosen.generatedAt} (committed: ${current.generatedAt}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
