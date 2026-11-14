// The pages that fall behind without anyone touching them: main's docs (README.md, llms.txt and the guides
// name one release in their install commands, ouro.latestRelease in package.json) and /adoption/ (the hourly
// ledger on the adoption-data branch). Each has its own job that keeps it current (docs-pin.yml,
// adoption-ledger.yml); this checks that the job did, so a stuck job shows up as an issue, not as a page a
// reader finds months old. Apple's pages have their own check (apple-release.mjs).
//
//   node scripts/stale-pages.mjs   needs network; GH_TOKEN optional on a public repository.
//   Exits 1 and prints one line per stale page; 2 when GitHub cannot be read, which is not staleness.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY = "ourostack/ouro-ui";
const LEDGER_URL = `https://raw.githubusercontent.com/${REPOSITORY}/adoption-data/ledger.json`;

/** The docs are stale once a release they do not name has been out this long. */
export const DOCS_LATE_MS = 24 * 60 * 60 * 1000;
/** The ledger runs hourly; three missed runs is stale. */
export const LEDGER_LATE_MS = 3 * 60 * 60 * 1000;

/**
 * The stale pages, as sentences. `pinned` is the release main's docs name, `releases` GitHub's releases as
 * { tag, at } (newest first or not), `ledgerAt` when the hourly ledger was last written.
 */
export function stalePages({ pinned, releases, ledgerAt, now }) {
  const stale = [];
  const pinnedAt = releases.find((release) => release.tag === pinned)?.at;
  const after = releases.filter((release) => pinnedAt && release.at > pinnedAt);
  const late = after.filter((release) => now.getTime() - Date.parse(release.at) > DOCS_LATE_MS);
  if (!pinnedAt) stale.push(`main's docs name ${pinned}, which is not a release.`);
  else if (late.length)
    stale.push(
      `main's docs name ${pinned}, and ${after.length} newer releases are out, ${late.length} of them for more than a day. docs-pin.yml's pull request ("Point the docs at a release") has not merged; push to its branch to start its CI.`,
    );
  const age = now.getTime() - Date.parse(ledgerAt);
  if (!(age <= LEDGER_LATE_MS)) stale.push(`/adoption/'s ledger was last written ${ledgerAt}, more than three hours ago. adoption-ledger.yml has stopped finishing.`);
  return stale;
}

async function get(url, token) {
  const headers = { accept: "application/vnd.github+json", ...(token && url.startsWith("https://api.github.com/") ? { authorization: `Bearer ${token}` } : {}) };
  const response = await globalThis.fetch(url, { headers });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

async function main() {
  const token = process.env.GH_TOKEN;
  const pinned = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).ouro.latestRelease;
  let releases, ledgerAt;
  try {
    const list = await get(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`, token);
    releases = list.filter((release) => !release.draft && !release.prerelease).map((release) => ({ tag: release.tag_name, at: release.published_at }));
    ledgerAt = (await get(LEDGER_URL)).generatedAt;
  } catch (error) {
    console.error(`::error::GitHub could not be read, so staleness is unknown: ${error.message}`);
    return 2;
  }
  const stale = stalePages({ pinned, releases, ledgerAt, now: new Date() });
  for (const line of stale) console.log(`::error::${line}`);
  if (!stale.length) console.log(`main's docs name ${pinned}, and /adoption/'s ledger is from ${ledgerAt}: neither is stale.`);
  return stale.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main();
