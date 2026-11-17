// Ouro Current: our own Dependabot for Ouro UI pins. For every repository the Ouro Current GitHub App is installed on,
// it finds the Ouro UI pin files by name, and when one is behind the newest release it follows, opens or updates one
// pull request, "Update to Ouro UI vX", on the branch `ouro-current/update`, with auto-merge on. See scripts/current/README.md.
//
//   OURO_CURRENT_APP_ID=… OURO_CURRENT_PRIVATE_KEY=… node scripts/current/current.mjs [--out current.json] [--only owner/repo]
//   GH_TOKEN=… node scripts/current/current.mjs --dry-run --only owner/repo   # what it would change; writes nothing
//   GH_TOKEN=… node scripts/current/current.mjs --with-token --only owner/repo   # the same pull request, opened with that token
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
import { RULES_PATH, applyRules, isIgnored } from "./rules.mjs";
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
  const zips = new Map();
  const assetZip = (follows, tag, assetName) => {
    const key = `${follows}@${tag}/${assetName}`;
    if (!zips.has(key)) {
      zips.set(key, (async () => {
        const release = await publicGh.get(`repos/${REPOS[follows]}/releases/tags/${encodeURIComponent(tag)}`);
        const asset = release.assets.find((item) => item.name === assetName);
        if (!asset) throw new Error(`${REPOS[follows]} ${tag} has no asset ${assetName}`);
        return publicGh.get(asset.browser_download_url, { raw: true, accept: "application/octet-stream" });
      })());
    }
    return zips.get(key);
  };
  return {
    tarball(follows, tag) {
      const key = `${follows}@${tag}`;
      if (!tarballs.has(key)) tarballs.set(key, publicGh.get(`repos/${REPOS[follows]}/tarball/${encodeURIComponent(tag)}`, { raw: true }).then(readTarball));
      return tarballs.get(key);
    },
    async assetFile(follows, tag, assetName, path) {
      return unzip(await assetZip(follows, tag, assetName), path);
    },
    /** Several files from one release asset, downloaded once: a Map of path to bytes, without the paths it lacks. */
    async assetFiles(follows, tag, assetName, paths) {
      const zip = await assetZip(follows, tag, assetName);
      const out = new Map();
      for (const path of paths) {
        try {
          out.set(path, unzip(zip, path));
        } catch {
          // not in the asset: the caller names what is missing
        }
      }
      return out;
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
  const blobs = new Map();
  for (const node of tree.tree) {
    if (node.type === "blob") blobs.set(node.path, node.sha);
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
  // A core manifest a lock file vendors is the lock's to update.
  const locked = new Set(pins.filter((pin) => pin.kind === "vendor-lock").flatMap((pin) => JSON.parse(texts[pin.file]).sources.flatMap((source) => (source.files ?? []).map((file) => file.generatedPath))));
  return { pins: pins.filter((pin) => !(pin.kind === "core-manifest" && locked.has(pin.file))), texts, blobs, treeSha: tree.sha, truncated: Boolean(tree.truncated) };
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

/** What every commit Ouro Current writes says after its title, so a commit someone else pushed is told apart. */
const MARK = "\n\nOuro Current: ";

/** The bot's branch, if it exists: its commit, that commit's tree and first parent, and whether Ouro Current wrote it. */
async function branchState(gh, repo) {
  try {
    const ref = await gh.get(`repos/${repo}/git/ref/heads/${BRANCH}`);
    const commit = await gh.get(`repos/${repo}/git/commits/${ref.object.sha}`);
    return { sha: commit.sha, tree: commit.tree.sha, parent: commit.parents[0]?.sha ?? null, ours: String(commit.message ?? "").includes(MARK) };
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function openPr(gh, repo, owner) {
  const list = await gh.get(`repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${BRANCH}`)}`);
  return list[0] ?? null;
}

/**
 * Turns on auto-merge (squash where allowed, else a merge commit), or says why it could not. The merge commit's
 * headline and body are given, never left to GitHub: its default squash text adds a `Co-authored-by: ouro-current[bot]`
 * trailer, which the organisation's no-AI-attribution rule forbids on main.
 */
async function autoMerge(gh, pr, commitBody) {
  const failures = [];
  const commitHeadline = `${pr.title} (#${pr.number})`;
  for (const method of ["SQUASH", "MERGE", "REBASE"]) {
    try {
      await gh.graphql(
        "mutation($id: ID!, $method: PullRequestMergeMethod!, $headline: String, $body: String) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: $method, commitHeadline: $headline, commitBody: $body }) { clientMutationId } }",
        { id: pr.node_id, method, headline: commitHeadline, body: commitBody },
      );
      return { on: true, note: null };
    } catch (error) {
      failures.push(error.message);
      if (!/merge method|not allowed|squash|rebase/i.test(error.message)) break;
    }
  }
  return { on: false, note: failures.at(-1) };
}

/** Whether a path is a workflow, which an app writes only with the `workflows` permission. */
export const inWorkflows = (path) => /^\.github\/workflows\//.test(path);
const workflowNote = (paths) =>
  `Leaves ${paths.map((path) => `\`${path}\``).join(", ")} alone: GitHub lets an app change \`.github/workflows/\` only with the \`workflows\` permission, which Ouro Current does not ask for. Keep the Ouro UI version in a file the workflow reads at run time, such as \`.github/ouro-hx-installed.json\`.`;

/** One repository: current, or updated through the bot's one pull request. */
export async function keepRepo(gh, repo, releases, sources, { dryRun = false } = {}) {
  const info = await gh.get(`repos/${repo}`);
  const base = info.default_branch;
  const head = (await gh.get(`repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`)).object.sha;
  const found = await readPins(gh, repo, head);
  const { texts, blobs, treeSha } = found;
  // What the repository asks of every change (.github/ouro-current.json): a new version, a changelog fragment.
  const read = async (path) => {
    try {
      const file = await gh.get(`repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${head}`);
      return Buffer.from(file.content, "base64").toString("utf8");
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  };
  const rulesText = found.pins.length ? await read(RULES_PATH) : null;
  const rules = rulesText === null ? null : JSON.parse(rulesText);
  // A repository never follows itself (Ouro UI's own copy of core's generator follows core, not Ouro UI), and a pin
  // the repository's rules ignore stays where it is.
  const pins = found.pins.filter((pin) => REPOS[pin.follows] !== repo && !isIgnored(rules, pin.file));
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
    /** The files directly in one folder of the repository, read one blob at a time rather than as a tarball. */
    consumerFolder: async (dir) => {
      const out = new Map();
      for (const [path, sha] of blobs) {
        if (dirname(path) !== dir) continue;
        const blob = await gh.get(`repos/${repo}/git/blobs/${sha}`);
        out.set(path, Buffer.from(blob.content, "base64"));
      }
      return out;
    },
  };
  for (const pin of behind) {
    const text = typeof files[pin.file] === "string" ? files[pin.file] : texts[pin.file];
    const update = await UPDATERS[pin.kind](pin, text, releases[pin.follows], ctx);
    Object.assign(files, update.files);
    notes.push(...update.notes);
  }
  // GitHub lets an app write under .github/workflows/ only with the `workflows` permission, which Ouro Current does not
  // ask for: it would need every installation approved again, and give the app write access to every repository's CI.
  // A pin there is left alone and said so; the repository keeps the version in a file its workflow reads instead.
  const held = [...new Set([...Object.keys(files), ...behind.map((pin) => pin.file)].filter(inWorkflows))].sort();
  for (const path of held) delete files[path];
  if (held.length) notes.push(workflowNote(held));
  if (behind.every((pin) => inWorkflows(pin.file))) return { ...result, state: "skipped", reason: workflowNote(held), pr: null };
  const name = title(behind.filter((pin) => !inWorkflows(pin.file)), releases);
  const latestRelease = async () => {
    try {
      return (await gh.get(`repos/${repo}/releases/latest`)).tag_name ?? null;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  };
  const newest = [...new Set(behind.map((pin) => pin.follows))].sort().map((follows) => `${NAMES[follows]} ${releases[follows].tag}`);
  const asked = await applyRules(rules, { read, latestRelease, releases: newest.join(" and "), newest: releases[behind[0].follows].tag });
  Object.assign(files, asked.files);
  notes.push(...asked.notes);
  // Two pins that vendor the same generator say the same thing once.
  notes.splice(0, notes.length, ...new Set(notes));
  // Every updater held back (a set that moves together or not at all): there is nothing to propose, and the notes say why.
  if (Object.keys(files).length === 0) return { ...result, state: "skipped", reason: notes.join(" "), pr: null };
  if (dryRun) return { ...result, state: "would-update", pr: null, plan: { title: name, files: Object.keys(files).sort(), notes } };
  const existing = await branchState(gh, repo);
  // Someone pushed to the open pull request's branch (a fix its checks needed): as Dependabot does, leave it to them
  // rather than force-push their work away. Closing the pull request or deleting the branch hands it back.
  if (existing && !existing.ours && existingPr) {
    return { ...result, state: "pr", pr: { number: existingPr.number, url: existingPr.html_url, title: existingPr.title, autoMerge: Boolean(existingPr.auto_merge), note: "edited by someone else, so left alone", pushed: false, edited: true } };
  }
  const moves = `${MARK.trim()} ${behind.map((pin) => `${pin.file} ${pin.current} to ${releases[pin.follows].tag}`).join("; ")}.`;
  const commit = await commitFiles(gh, repo, head, treeSha, files, `${name}\n\n${moves}`, existing);
  if (commit.changed) {
    try {
      if (existing) await gh.patch(`repos/${repo}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true });
      else await gh.post(`repos/${repo}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
    } catch (error) {
      // GitHub keeps the branch of a pull request in a merge queue as it is: the queued update merges, or leaves the
      // queue, and the next run brings it up to date (ourostack/ouro-ui#1809).
      if (!(existing && existingPr && error.status === 422 && /merge queue/i.test(error.message))) throw error;
      return { ...result, state: "pr", pr: { number: existingPr.number, url: existingPr.html_url, title: existingPr.title, autoMerge: Boolean(existingPr.auto_merge), note: "in the merge queue, so left as it is until it merges or leaves the queue", pushed: false } };
    }
  }
  const text = body(behind, releases, notes);
  let pr = existingPr;
  if (pr) {
    if (pr.title !== name || pr.body !== text) pr = await gh.patch(`repos/${repo}/pulls/${pr.number}`, { title: name, body: text });
  } else {
    pr = await gh.post(`repos/${repo}/pulls`, { title: name, body: text, head: BRANCH, base });
  }
  const merge = await autoMerge(gh, pr, moves);
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
        if (!item.private) log(`${item.full_name}: ${kept.state}${kept.reason ? `: ${kept.reason}` : ""}${kept.pr ? ` ${kept.pr.url}` : ""}`);
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

export async function main(argv = process.argv.slice(2), env = process.env, { makeGitHub = createGitHub, log = console.log } = {}) {
  const args = { out: null, only: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out") args.out = resolve(argv[++index]);
    else if (argv[index] === "--dry-run") args.dryRun = true;
    else if (argv[index] === "--with-token") args.withToken = true;
    else if (argv[index] === "--only") args.only = argv[++index].split(",");
    else throw new Error(`unknown argument ${argv[index]}`);
  }
  if (args.withToken) {
    // The same pull request, opened with GH_TOKEN for the repositories named: a repository the app is not installed on
    // yet is kept current by hand with exactly what the app would write.
    if (!args.only || args.dryRun) throw new Error("--with-token needs --only <owner/repo>[,<owner/repo>], and is not --dry-run");
    const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
    if (!token) throw new Error("--with-token needs GH_TOKEN: a token that can push a branch and open a pull request in each repository");
    const gh = makeGitHub({ token });
    const releases = await latestReleases(gh);
    const sources = createSources(gh);
    let failed = 0;
    for (const repo of args.only) {
      try {
        const kept = await keepRepo(gh, repo, releases, sources);
        log(`${repo}: ${kept.state}${kept.reason ? `: ${kept.reason}` : ""}${kept.pr ? ` ${kept.pr.url}${kept.pr.edited ? ` (${kept.pr.note})` : kept.pr.autoMerge ? " (auto-merge on)" : ` (auto-merge off: ${kept.pr.note})`}` : ""}`);
      } catch (error) {
        failed += 1;
        log(`${repo}: failed: ${error.message}`);
      }
    }
    return failed ? 1 : 0;
  }
  if (args.dryRun) {
    // Reads only, with GH_TOKEN, for the repositories named: what the bot would change, without the app or a write.
    if (!args.only) throw new Error("--dry-run needs --only <owner/repo>[,<owner/repo>]");
    // A repository that fails is reported, and the others still run.
    const gh = makeGitHub({ token: env.GH_TOKEN ?? env.GITHUB_TOKEN ?? null });
    const releases = await latestReleases(gh);
    const sources = createSources(gh);
    const repos = [];
    for (const repo of args.only) {
      let kept;
      try {
        kept = await keepRepo(gh, repo, releases, sources, { dryRun: true });
      } catch (error) {
        kept = { repo, state: "failed", error: error.message, pins: [] };
      }
      repos.push(kept);
      log(JSON.stringify(kept, null, 2));
    }
    if (args.out) {
      mkdirSync(dirname(args.out), { recursive: true });
      writeFileSync(args.out, `${JSON.stringify({ schema: 1, dryRun: true, repos }, null, 2)}\n`);
    }
    return repos.some((repo) => repo.state === "failed") ? 1 : 0;
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
