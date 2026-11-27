// Downloads the artifacts of the current workflow run whose names start with a prefix, one per name:
// the newest that exists. actions/download-artifact lists every artifact of the run, and a rerun of
// the run uploads each shard's artifact again under the same name, so it fetched `coverage-browser-14`
// twice and failed on the stale copy's 404 (#3933). Here a name's newest copy wins and an older one is
// the fallback only when the newer cannot be read.
//
//   node scripts/download-newest-artifacts.mjs <prefix> <dir>
//
// Reads GH_TOKEN, GITHUB_REPOSITORY and GITHUB_RUN_ID. Each artifact is unzipped into <dir>/<name>/,
// as actions/download-artifact does with merge-multiple off. Needs `actions: read`.
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The artifacts to try for each name that starts with `prefix`, newest first. Expired ones are left out.
 * @param {{ id: number, name: string, expired?: boolean, created_at?: string }[]} artifacts
 * @param {string} prefix
 * @returns {Map<string, { id: number, name: string }[]>}
 */
export function newestPerName(artifacts, prefix) {
  const byName = new Map();
  for (const artifact of artifacts) {
    if (!artifact.name.startsWith(prefix) || artifact.expired) continue;
    byName.set(artifact.name, [...(byName.get(artifact.name) ?? []), artifact]);
  }
  for (const [name, copies] of byName) {
    byName.set(name, copies.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")) || b.id - a.id));
  }
  return byName;
}

const api = (path, token) =>
  globalThis.fetch(`https://api.github.com/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });

/** Every artifact of a run, following the pages. */
export async function listArtifacts(repo, run, token) {
  const artifacts = [];
  for (let page = 1; ; page += 1) {
    const response = await api(`repos/${repo}/actions/runs/${run}/artifacts?per_page=100&page=${page}`, token);
    if (!response.ok) throw new Error(`listing the artifacts of run ${run} failed: ${response.status}`);
    const body = await response.json();
    artifacts.push(...body.artifacts);
    if (artifacts.length >= body.total_count || body.artifacts.length === 0) return artifacts;
  }
}

/**
 * Downloads and unzips the newest readable copy of each name into `dir`.
 * @param {{ list: () => Promise<any[]>, fetchZip: (id: number) => Promise<Buffer | null>, unzip: (zip: Buffer, to: string) => void }} io
 * @returns {Promise<string[]>} the names downloaded, sorted
 */
export async function downloadNewest(io, prefix, dir) {
  const names = newestPerName(await io.list(), prefix);
  for (const [name, copies] of [...names].sort(([a], [b]) => a.localeCompare(b))) {
    let done = false;
    for (const copy of copies) {
      const zip = await io.fetchZip(copy.id);
      if (!zip) {
        console.warn(`${name} (artifact ${copy.id}) cannot be read; trying the copy before it`);
        continue;
      }
      io.unzip(zip, join(dir, name));
      done = true;
      break;
    }
    if (!done) throw new Error(`no copy of ${name} can be downloaded`);
  }
  return [...names.keys()].sort();
}

/* istanbul ignore next @preserve -- runs only on CI, with the network */
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [prefix, dir] = process.argv.slice(2);
  const { GH_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  if (!prefix || !dir || !GH_TOKEN || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) {
    console.error("usage: GH_TOKEN=… GITHUB_REPOSITORY=… GITHUB_RUN_ID=… node scripts/download-newest-artifacts.mjs <prefix> <dir>");
    process.exit(2);
  }
  const names = await downloadNewest(
    {
      list: () => listArtifacts(GITHUB_REPOSITORY, GITHUB_RUN_ID, GH_TOKEN),
      fetchZip: async (id) => {
        const response = await api(`repos/${GITHUB_REPOSITORY}/actions/artifacts/${id}/zip`, GH_TOKEN);
        return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
      },
      unzip: (zip, to) => {
        rmSync(to, { recursive: true, force: true });
        mkdirSync(to, { recursive: true });
        const file = `${to}.zip`;
        writeFileSync(file, zip);
        const result = spawnSync("unzip", ["-q", "-o", file, "-d", to], { stdio: "inherit" });
        rmSync(file, { force: true });
        if (result.status !== 0) throw new Error(`unzip of ${file} failed`);
      },
    },
    prefix,
    dir,
  );
  console.log(`Downloaded ${names.length} artifacts: ${names.join(", ")}`);
}
