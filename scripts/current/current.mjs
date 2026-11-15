// Ouro Current: our own Dependabot for Ouro UI pins. For every repository the Ouro Current GitHub App is installed on,
// it finds the Ouro UI pin files by name, and when one is behind the newest release it follows, opens or updates one
// pull request, "Update to Ouro UI vX", on the branch `ouro-current/update`, with auto-merge on. See scripts/current/README.md.
//
//   OURO_CURRENT_APP_ID=… OURO_CURRENT_PRIVATE_KEY=… node scripts/current/current.mjs [--out current.json] [--only owner/repo]
//   GH_TOKEN=… node scripts/current/current.mjs --dry-run --only owner/repo   # what it would change; writes nothing
//
// It never pushes to a default branch, never touches a branch other than its own, and never merges anything itself:
// the repository's own checks and auto-merge decide.
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appJwt, createGitHub } from "./github.mjs";
import { NAMES, REPOS, UPDATERS, asBytes, findPins, isBehind, isCandidate } from "./pins.mjs";
import { readTarball } from "./tar.mjs";

export const BRANCH = "ouro-current/update";
/** Ouro UI's own repositories are where releases come from, not consumers. */
const UPSTREAM = new Set(Object.values(REPOS));

/** The newest stable release of each Ouro UI repository, with the commit its tag points at. */
export async function latestReleases(gh) {
  const out = {};
  for (const [follows, repo] of Object.entries(REPOS)) {
    const release = await gh.get(`repos/${repo}/releases/latest`);
    const commit = await gh.get(`repos/${repo}/commits/${encodeURIComponent(release.tag_name)}`);
    out[follows] = { repo, name: NAMES[follows], tag: release.tag_name, sha: commit.sha, url: release.html_url };
  }
  return out;
}

/** "Update to Ouro UI v1.3.187" or, for several, "Update to Ouro UI v1.3.187 and Ouro UI core v0.15.0". */
export function title(behind, releases) {
  const names = [...new Set(behind.map((pin) => pin.follows))].sort().map((follows) => `${NAMES[follows]} ${releases[follows].tag}`);
  return `Update to ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]}`;
}

export function body(behind, releases, notes) {
  const rows = behind.map((pin) => `| \`${pin.file}\` | ${NAMES[pin.follows]} | \`${pin.current}\` | [\`${releases[pin.follows].tag}\`](${releases[pin.follows].url}) |`);
  return [
    // Versions and file names stay in code spans: a repository that runs Ouro UI's claims check on pull requests
    // reads a bare version as a claim to cite, and would fail every update.
    "Ouro Current moves the Ouro UI pins of this repository to the releases below.",
    "",
    "| File | Follows | From | To |",
    "|---|---|---|---|",
    ...[...new Set(rows)],
    "",
    ...(notes.length ? [...notes.map((note) => `- ${note}`), ""] : []),
    "Your checks decide: this pull request merges itself when they pass. A newer release updates this same pull request. The release notes say what changed: https://github.com/ourostack/ouro-ui/blob/main/UPGRADING.md",
    "",
    "<!-- ouro-current -->",
  ].join("\n");
}

/** Downloads and caches what the updaters read: release tarballs, release assets, and the consumer's own files. */
export function createSources(publicGh, { unzip = defaultUnzip } = {}) {
  const tarballs = new Map();
  return {
    tarball(follows, tag) {
      const key = `${follows}@${tag}`;
      if (!tarballs.has(key)) tarballs.set(key, publicGh.get(`repos/${REPOS[follows]}/tarball/${encodeURIComponent(tag)}`, { raw: true }).then(readTarball));
      return tarballs.get(key);
    },
    async assetFile(follows, tag, assetName, path) {
      const release = await publicGh.get(`repos/${REPOS[follows]}/releases/tags/${encodeURIComponent(tag)}`);
      const asset = release.assets.find((item) => item.name === assetName);
      if (!asset) throw new Error(`${REPOS[follows]} ${tag} has no asset ${assetName}`);
      const zip = await publicGh.get(asset.browser_download_url, { raw: true, accept: "application/octet-stream" });
      return unzip(zip, path);
    },
  };
}

function defaultUnzip(zip, path) {
  const dir = mkdtempSync(join(tmpdir(), "ouro-current-"));
  try {
    const file = join(dir, "asset.zip");
    writeFileSync(file, zip);
    return execFileSync("unzip", ["-p", file, path], { maxBuffer: 256 * 1024 * 1024 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The pins in a repository at a commit: its file list, filtered by name, then each candidate read. */
export async function readPins(gh, repo, sha) {
  const tree = await gh.get(`repos/${repo}/git/trees/${sha}?recursive=1`);
  const pins = [];
  const texts = {};
  for (const node of tree.tree) {
    if (node.type !== "blob" || !isCandidate(node.path)) continue;
    const blob = await gh.get(`repos/${repo}/git/blobs/${node.sha}`);
    const text = Buffer.from(blob.content, "base64").toString("utf8");
    let found;
    try {
      found = findPins(node.path, text);
    } catch {
      continue; // a file of that name that is not a pin file (unparseable JSON) is not ours
    }
    if (found.length) texts[node.path] = text;
    pins.push(...found);
  }
  return { pins, texts, treeSha: tree.sha, truncated: Boolean(tree.truncated) };
}

/** Writes the files as one commit on top of `parent`, and returns its sha (or the branch's, when nothing differs). */
async function commitFiles(gh, repo, parent, baseTree, files, message, existing) {
  const entries = [];
  for (const [path, value] of Object.entries(files)) {
    if (value === null) {
      entries.push({ path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blob = await gh.post(`repos/${repo}/git/blobs`, { content: asBytes(value).toString("base64"), encoding: "base64" });
    entries.push({ path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const tree = await gh.post(`repos/${repo}/git/trees`, { base_tree: baseTree, tree: entries });
  if (existing && existing.tree === tree.sha && existing.parent === parent) return { sha: existing.sha, changed: false };
  const commit = await gh.post(`repos/${repo}/git/commits`, { message, tree: tree.sha, parents: [parent] });
  return { sha: commit.sha, changed: true };
}

/** The bot's branch, if it exists: its commit, that commit's tree and first parent. */
async function branchState(gh, repo) {
  try {
    const ref = await gh.get(`repos/${repo}/git/ref/heads/${BRANCH}`);
    const commit = await gh.get(`repos/${repo}/git/commits/${ref.object.sha}`);
    return { sha: commit.sha, tree: commit.tree.sha, parent: commit.parents[0]?.sha ?? null };
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function openPr(gh, repo, owner) {
  const list = await gh.get(`repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${BRANCH}`)}`);
  return list[0] ?? null;
}

/** Turns on auto-merge (squash where allowed, else a merge commit), or says why it could not. */
async function autoMerge(gh, pr) {
  const failures = [];
  for (const method of ["SQUASH", "MERGE", "REBASE"]) {
    try {
      await gh.graphql("mutation($id: ID!, $method: PullRequestMergeMethod!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: $method }) { clientMutationId } }", { id: pr.node_id, method });
      return { on: true, note: null };
    } catch (error) {
      failures.push(error.message);
      if (!/merge method|not allowed|squash|rebase/i.test(error.message)) break;
    }
  }
  return { on: false, note: failures.at(-1) };
}

/** One repository: current, or updated through the bot's one pull request. */
export async function keepRepo(gh, repo, releases, sources, { dryRun = false } = {}) {
  const info = await gh.get(`repos/${repo}`);
  const base = info.default_branch;
  const head = (await gh.get(`repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`)).object.sha;
  const { pins, texts, treeSha } = await readPins(gh, repo, head);
  const result = { repo, private: Boolean(info.private), pins: pins.map((pin) => ({ kind: pin.kind, file: pin.file, follows: pin.follows, current: pin.current, latest: releases[pin.follows].tag, behind: isBehind(pin, releases[pin.follows]) })) };
  const behind = pins.filter((pin) => isBehind(pin, releases[pin.follows]));
  const existingPr = dryRun ? null : await openPr(gh, repo, info.owner.login);
  if (pins.length === 0 || behind.length === 0) {
    if (existingPr) {
      await gh.post(`repos/${repo}/issues/${existingPr.number}/comments`, { body: "This repository is already on the newest Ouro UI releases, so this pull request is no longer needed." });
      await gh.patch(`repos/${repo}/pulls/${existingPr.number}`, { state: "closed" });
    }
    return { ...result, state: pins.length === 0 ? "no-pins" : "current", pr: null };
  }
  // Each file's pins apply in turn to its text, so two pins in one file (two vendored sources) both land.
  const files = {};
  const notes = [];
  let consumer = null;
  const ctx = {
    ...sources,
    consumerFiles: async () => (consumer ??= readTarball(await gh.get(`repos/${repo}/tarball/${head}`, { raw: true }))),
  };
  for (const pin of behind) {
    const text = typeof files[pin.file] === "string" ? files[pin.file] : texts[pin.file];
    const update = await UPDATERS[pin.kind](pin, text, releases[pin.follows], ctx);
    Object.assign(files, update.files);
    notes.push(...update.notes);
  }
  const name = title(behind, releases);
  if (dryRun) return { ...result, state: "would-update", pr: null, plan: { title: name, files: Object.keys(files).sort(), notes } };
  const existing = await branchState(gh, repo);
  const commit = await commitFiles(gh, repo, head, treeSha, files, `${name}\n\nOuro Current: ${behind.map((pin) => `${pin.file} ${pin.current} to ${releases[pin.follows].tag}`).join("; ")}.`, existing);
  if (commit.changed) {
    if (existing) await gh.patch(`repos/${repo}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true });
    else await gh.post(`repos/${repo}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
  }
  const text = body(behind, releases, notes);
  let pr = existingPr;
  if (pr) {
    if (pr.title !== name || pr.body !== text) pr = await gh.patch(`repos/${repo}/pulls/${pr.number}`, { title: name, body: text });
  } else {
    pr = await gh.post(`repos/${repo}/pulls`, { title: name, body: text, head: BRANCH, base });
  }
  const merge = await autoMerge(gh, pr);
  return { ...result, state: "pr", pr: { number: pr.number, url: pr.html_url, title: name, autoMerge: merge.on, note: merge.note, pushed: commit.changed } };
}

/**
 * Every installation of the app, every repository it can see. A repository that fails is reported, never skipped in
 * silence, and the others still run.
 */
export async function keepCurrent({ appId, privateKey, makeGitHub = createGitHub, publicToken = null, only = null, now = () => new Date(), log = console.log, unzip } = {}) {
  const app = makeGitHub({ token: appJwt(appId, privateKey, now().getTime()), scheme: "Bearer" });
  const publicGh = makeGitHub({ token: publicToken });
  const releases = await latestReleases(publicGh);
  const sources = createSources(publicGh, { unzip });
  const installations = await app.all("app/installations");
  const repos = [];
  for (const installation of installations) {
    const owner = installation.account?.login ?? String(installation.id);
    let gh;
    let list;
    try {
      const { token } = await app.post(`app/installations/${installation.id}/access_tokens`, {});
      gh = makeGitHub({ token });
      list = await gh.all("installation/repositories", "repositories");
    } catch (error) {
      repos.push({ repo: owner, private: false, state: "failed", error: `could not read the installation: ${error.message}`, pins: [] });
      continue;
    }
    for (const item of list) {
      if (item.archived || UPSTREAM.has(item.full_name) || (only && !only.includes(item.full_name))) continue;
      try {
        const kept = await keepRepo(gh, item.full_name, releases, sources);
        if (!item.private) log(`${item.full_name}: ${kept.state}${kept.pr ? ` ${kept.pr.url}` : ""}`);
        repos.push(kept);
      } catch (error) {
        log(`${item.private ? "a private repository" : item.full_name}: failed${item.private ? "" : `: ${error.message}`}`);
        repos.push({ repo: item.full_name, private: Boolean(item.private), state: "failed", error: error.message, pins: [] });
      }
    }
  }
  return { schema: 1, generatedAt: now().toISOString(), releases, installations: installations.length, repos };
}

/** What the public page shows: a private repository is counted but never named. */
export function publicView(report) {
  const shown = report.repos.filter((repo) => !repo.private);
  return {
    schema: 1,
    generatedAt: report.generatedAt,
    releases: Object.fromEntries(Object.entries(report.releases).map(([key, release]) => [key, { name: release.name, tag: release.tag, url: release.url }])),
    installations: report.installations,
    privateRepos: report.repos.length - shown.length,
    repos: shown
      .filter((repo) => repo.state !== "no-pins")
      .map((repo) => ({ repo: repo.repo, state: repo.state, pins: repo.pins.map(({ file, follows, current, latest, behind }) => ({ file, follows, current, latest, behind })), pr: repo.pr ? { number: repo.pr.number, url: repo.pr.url } : null }))
      .sort((a, b) => a.repo.localeCompare(b.repo)),
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = { out: null, only: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out") args.out = resolve(argv[++index]);
    else if (argv[index] === "--dry-run") args.dryRun = true;
    else if (argv[index] === "--only") args.only = argv[++index].split(",");
    else throw new Error(`unknown argument ${argv[index]}`);
  }
  if (args.dryRun) {
    // Reads only, with GH_TOKEN, for the repositories named: what the bot would change, without the app or a write.
    if (!args.only) throw new Error("--dry-run needs --only <owner/repo>[,<owner/repo>]");
    const gh = createGitHub({ token: env.GH_TOKEN ?? env.GITHUB_TOKEN ?? null });
    const releases = await latestReleases(gh);
    const sources = createSources(gh);
    for (const repo of args.only) console.log(JSON.stringify(await keepRepo(gh, repo, releases, sources, { dryRun: true }), null, 2));
    return 0;
  }
  if (!env.OURO_CURRENT_APP_ID || !env.OURO_CURRENT_PRIVATE_KEY) throw new Error("set OURO_CURRENT_APP_ID and OURO_CURRENT_PRIVATE_KEY (the app's ID and private key)");
  const report = await keepCurrent({ appId: env.OURO_CURRENT_APP_ID, privateKey: env.OURO_CURRENT_PRIVATE_KEY, publicToken: env.GH_TOKEN ?? env.GITHUB_TOKEN ?? null, only: args.only });
  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${JSON.stringify(publicView(report), null, 2)}\n`);
  }
  const failed = report.repos.filter((repo) => repo.state === "failed");
  const prs = report.repos.filter((repo) => repo.state === "pr").length;
  console.log(`${report.installations} installations, ${report.repos.length} repositories: ${prs} with an update pull request, ${failed.length} failed.`);
  for (const repo of failed) console.log(`Failed: ${repo.private ? "a private repository (its error is left out of this public log)" : `${repo.repo}: ${repo.error}`}`);
  return failed.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error.message);
      process.exitCode = 1;
    },
  );
}
