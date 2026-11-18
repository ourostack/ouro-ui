// Keeps the repository's Actions caches well under GitHub's 10 GB limit (.github/workflows/cache-prune.yml).
// Only main saves caches, so a pull request's entries are its own leftovers and go. On main, each
// family of keys keeps its newest entry, which is what the workflows restore: GitHub answers a
// restore-key prefix with the most recently created match, so older entries of a family are never read.
//
// Usage (CI sets GITHUB_REPOSITORY and GH_TOKEN): node scripts/cache-prune.mjs
// The decision is toDelete(); the CLI only lists the caches with gh, deletes them and prints the totals.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MAIN = "refs/heads/main";

// The key with its content hashes removed. The first match wins; a key no rule matches is kept.
const FAMILIES = [
  // install-test's prepared app: the fixture hash stays, since the restore key is that prefix.
  [/^(install-app-pw[\d.]+-[^-]+-[^-]+-[0-9a-f]+-)[0-9a-f]+$/, (m) => m[1]],
  [/^(install-base-pw[\d.]+-[^-]+-[^-]+-)[0-9a-f]+$/, (m) => m[1]],
  [/^(install-npm-[^-]+-[^-]+-)[0-9a-f]+$/, (m) => m[1]],
  // Playwright's browsers: one entry per key.
  [/^playwright-[^-]+-[^-]+-[^-]+-[\d.]+-[a-z-]+$/, (m) => m[0]],
  // The system packages' .deb files, per runner image: the image version is left out of the family.
  [/^browser-debs-([^-]+-[^-]+)-[\w.]+-(\w+-[\d.]+-[a-z-]+)$/, (m) => `browser-debs-${m[1]}-${m[2]}`],
  // setup-node's pnpm store, per OS and architecture.
  [/^(node-cache-[^-]+-[^-]+-pnpm-)[0-9a-f]+$/, (m) => m[1]],
  // The mutation job's results, per pull request and dependency hash (its one save from a pull request).
  [/^(stryker-\d+-[0-9a-f]+-)[0-9a-f]{40}$/, (m) => m[1]],
];

export function familyOf(key) {
  for (const [pattern, family] of FAMILIES) {
    const match = pattern.exec(key);
    if (match) return family(match);
  }
  return null;
}

const time = (cache) => Date.parse(cache.createdAt) || 0;

/**
 * The caches to delete. A cache from a ref other than main goes, except stryker's, which keep their
 * newest per family from any ref. On main, each family keeps its newest cache; keys no family
 * matches are left alone.
 */
export function toDelete(caches) {
  const doomed = new Set();
  const families = new Map();
  for (const cache of caches) {
    const stryker = cache.key.startsWith("stryker-");
    if (!stryker && cache.ref !== MAIN) {
      doomed.add(cache);
      continue;
    }
    const family = familyOf(cache.key);
    if (family === null) continue;
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(cache);
  }
  for (const members of families.values()) {
    members.sort((a, b) => time(b) - time(a) || String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
    for (const cache of members.slice(1)) doomed.add(cache);
  }
  return caches.filter((cache) => doomed.has(cache));
}

const gh = (args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 16 << 20 });

function listCaches(repo) {
  const caches = [];
  for (let page = 1; ; page += 1) {
    const { actions_caches: batch } = JSON.parse(gh(["api", `repos/${repo}/actions/caches?per_page=100&page=${page}`]));
    caches.push(...batch.map((cache) => ({ id: cache.id, key: cache.key, ref: cache.ref, sizeInBytes: cache.size_in_bytes, createdAt: cache.created_at })));
    if (batch.length < 100) return caches;
  }
}

const megabytes = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
const total = (caches) => caches.reduce((sum, cache) => sum + cache.sizeInBytes, 0);

export async function main(env = process.env) {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY is not set");
  const before = listCaches(repo);
  const doomed = toDelete(before);
  console.log(`${before.length} caches, ${megabytes(total(before))}; deleting ${doomed.length}.`);
  const failed = [];
  for (const cache of doomed) {
    try {
      gh(["api", "-X", "DELETE", `repos/${repo}/actions/caches/${cache.id}`]);
      console.log(`deleted ${cache.key} (${cache.ref}, ${megabytes(cache.sizeInBytes)})`);
    } catch (error) {
      failed.push(cache.key);
      console.log(`could not delete ${cache.key}: ${error.stderr ?? error.message}`);
    }
  }
  const after = listCaches(repo);
  console.log(`${after.length} caches, ${megabytes(total(after))} after.`);
  return failed.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main();
