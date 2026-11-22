// Ouro Current: our own Dependabot for Ouro UI pins. For every repository the Ouro Current GitHub App is installed on,
// it finds the Ouro UI pin files by name, and when one is behind the newest release it follows, opens or updates one
// pull request, "Update to Ouro UI vX", on the branch `ouro-current/update`, with auto-merge on (or, where the repository's `.github/ouro-current.json` names a review team, off and with that team asked to review). See scripts/current/README.md.
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
import { lowerBaseline } from "./baseline.mjs";
import { regenerate } from "./generate.mjs";
import { NAMES, REPOS, UPDATERS, WORKFLOWS_PERMISSION, appleRequirement, asBytes, findPins, hxStylesheetBehind, isBehind, isCandidate, ourostackPackages, takes } from "./pins.mjs";
import { CONFIG as CHECK_CONFIG, bringsCheck, checkConfigs, checkRulesSection, seedKnown } from "./known.mjs";
import { gateLive, liveFor, runLiveCheck } from "./live.mjs";
import { RULES_PATH, applyRules, isIgnored, reviewTeam } from "./rules.mjs";
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

export function body(behind, releases, notes, sections = []) {
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
    ...sections.flatMap((section) => [section, ""]),
    "Your checks decide: this pull request merges itself when they pass. A newer release updates this same pull request. The release notes say what changed: https://github.com/ourostack/ouro-ui/blob/main/UPGRADING.md",
    "",
    "<!-- ouro-current -->",
  ].join("\n");
}

/**
 * The repository_dispatch event that asks an app's sharded Ouro check to run every shard on client_payload.sha, and to
 * name its report artifacts `ouro-check…-full-<sha>`: a workflow that listens for it checks that commit out.
 */
export const FULL_RUN = "ouro-current-full-run";

/** Downloads and caches what the updaters read: release tarballs, release assets, and the consumer's own files. */
export function createSources(publicGh, { unzip = defaultUnzip, liveCheck = runLiveCheck } = {}) {
  const tarballs = new Map();
  const zips = new Map();
  let published = null;
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
    /**
     * The Ouro check reports a commit's checks uploaded (artifacts named ouro-check…), read with the app's token, or
     * the public one where the app may not read a repository's Actions; none when neither can.
     */
    async ciReports(gh, repo, sha) {
      for (const client of [gh, publicGh]) {
        try {
          const reports = [];
          const { workflow_runs: runs = [] } = await client.get(`repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`);
          // A full run (FULL_RUN) runs on the default branch's workflow, so its run is not on this commit: its
          // artifacts name the commit they checked instead.
          const { workflow_runs: full = [] } = await client.get(`repos/${repo}/actions/runs?event=repository_dispatch&per_page=20`);
          for (const run of [...runs, ...full]) {
            const { artifacts = [] } = await client.get(`repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`);
            const ours = (item) => (run.event === "repository_dispatch" ? item.name.endsWith(`-full-${sha}`) : true);
            for (const artifact of artifacts.filter((item) => /^ouro-check/.test(item.name) && ours(item) && !item.expired)) {
              const zip = await client.get(artifact.archive_download_url, { raw: true });
              try {
                reports.push(JSON.parse(String(unzip(zip, "report.json"))));
              } catch {
                // an artifact without a report (a shard's screenshots alone) has nothing to record
              }
            }
          }
          return reports;
        } catch {
          // this token may not read the repository's Actions: the next one tries
        }
      }
      return [];
    },
    /**
     * The workflows whose run on a commit uploaded an Ouro check report but had a job cancelled, as { id, path }, with
     * no full run of that workflow since: a sharded check that fails fast cancels the other shards, so their findings
     * were never reported (ourostack/ouroboros-website#293: 8 findings of a new rule, all from shards a failing one
     * cancelled). A full run is one dispatched on the commit, or a FULL_RUN event's run of the workflow that started
     * after the cut-short one. Read like ciReports; none when neither token can.
     */
    async ciCutShort(gh, repo, sha) {
      for (const client of [gh, publicGh]) {
        try {
          const { workflow_runs: runs = [] } = await client.get(`repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`);
          const { workflow_runs: sent = [] } = await client.get(`repos/${repo}/actions/runs?event=repository_dispatch&per_page=20`);
          const full = new Set(runs.filter((run) => run.event === "workflow_dispatch").map((run) => run.workflow_id));
          const cut = new Map();
          for (const run of runs) {
            if (run.status !== "completed" || full.has(run.workflow_id) || cut.has(run.workflow_id)) continue;
            if (sent.some((later) => later.workflow_id === run.workflow_id && later.created_at > run.created_at)) continue;
            const { jobs = [] } = await client.get(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`);
            if (!jobs.some((job) => job.conclusion === "cancelled")) continue;
            const { artifacts = [] } = await client.get(`repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`);
            if (artifacts.some((item) => /^ouro-check/.test(item.name))) cut.set(run.workflow_id, { id: run.workflow_id, path: run.path });
          }
          return [...cut.values()];
        } catch {
          // this token may not read the repository's Actions: the next one tries
        }
      }
      return [];
    },
    /**
     * Ouro check run against a repository's live site at a release (live.mjs): { findings }, or a throw when it cannot
     * run. Only an update of a live-checked repository that brings a rule calls it.
     */
    liveCheck,
    /**
     * A repository's live check record from the last run, as the published current.json (adoption-data) holds it, or
     * null: none when the file cannot be read, so the check runs rather than being held back on a guess.
     */
    async publishedLive(repo) {
      published ??= publicGh
        .get(`repos/${REPOS.web}/contents/current.json?ref=adoption-data`)
        .then((file) => JSON.parse(Buffer.from(file.content, "base64").toString("utf8")))
        .catch(() => ({ repos: [] }));
      return (await published).repos?.find((item) => item.repo === repo)?.live ?? null;
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

/**
 * The bot's branch, if it exists: its commit, that commit's tree and first parent, and whether it is still Ouro
 * Current's own: its commit, or that commit with only merges of the default branch on top ("Update branch", or an agent
 * keeping it current, as ourostack/ouroboros#1389 had three of).
 * Such a merge brings in nothing but the default branch, which the next update is built on anyway, so it is replaced;
 * any other commit on top is someone's fix, and is left to them.
 */
async function branchState(gh, repo, base) {
  try {
    const ref = await gh.get(`repos/${repo}/git/ref/heads/${BRANCH}`);
    const commit = await gh.get(`repos/${repo}/git/commits/${ref.object.sha}`);
    let walk = commit;
    for (let hops = 0; hops < 20 && !String(walk.message ?? "").includes(MARK) && (await mergesBase(gh, repo, walk, base)); hops += 1) {
      walk = await gh.get(`repos/${repo}/git/commits/${walk.parents[0].sha}`);
    }
    return { sha: commit.sha, tree: commit.tree.sha, parent: commit.parents[0]?.sha ?? null, ours: String(walk.message ?? "").includes(MARK), moves: String(walk.message ?? "") };
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

/** Whether a commit is a merge of the default branch into the update branch: two parents, the second on `base`. */
async function mergesBase(gh, repo, commit, base) {
  if (!base || commit.parents?.length !== 2) return false;
  if (!new RegExp(`^Merge (remote-tracking )?branch '(origin/)?${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`).test(String(commit.message ?? ""))) return false;
  try {
    const { status } = await gh.get(`repos/${repo}/compare/${commit.parents[1].sha}...${encodeURIComponent(base)}`);
    return status === "identical" || status === "ahead";
  } catch {
    return false;
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

/** Turns off a pull request's auto-merge; false when GitHub would not, so the push goes ahead as before. */
async function disarm(gh, pr) {
  try {
    await gh.graphql("mutation($id: ID!) { disablePullRequestAutoMerge(input: { pullRequestId: $id }) { clientMutationId } }", { id: pr.node_id });
    return true;
  } catch {
    return false;
  }
}

/** The ourostack packages a repository resolves whose manifest, at that revision, does not take ouro-ui-apple's release. */
async function appleHolds(gh, pins, texts, release) {
  const out = [];
  for (const pin of pins.filter((pin) => pin.kind === "swiftpm-resolved")) {
    for (const dependency of ourostackPackages(texts[pin.file])) {
      let manifest;
      try {
        manifest = Buffer.from((await gh.get(`repos/${dependency.repo}/contents/Package.swift?ref=${dependency.revision}`)).content, "base64").toString("utf8");
      } catch (error) {
        if (error.status === 404) continue;
        throw error;
      }
      const requirement = appleRequirement(manifest);
      if (requirement && !takes(requirement, release.tag)) out.push({ ...dependency, requirement });
    }
  }
  return out;
}

const RANGE = { exact: (v) => `exactly ${v}`, minor: (v) => `${v} up to the next minor`, major: (v) => `${v} up to the next major` };
const holdNote = (holds, release) =>
  `${NAMES.apple} stays where it is for now: ${holds
    .map(({ repo, revision, requirement }) => `${repo} at ${revision.slice(0, 7)} takes ${RANGE[requirement.rule](requirement.version)}`)
    .join(", and ")}, so moving only this repository to ${release.tag} would leave its Swift packages unable to resolve. It moves once a revision of that package it resolves takes ${release.tag}.`;

/** Whether a path is a workflow, which an app writes only with the `workflows` permission. */
export const inWorkflows = (path) => /^\.github\/workflows\//.test(path);
const workflowNote = (paths) =>
  `Leaves ${paths.map((path) => `\`${path}\``).join(", ")} alone: ${WORKFLOWS_PERMISSION}. Keep the Ouro UI version in a file the workflow reads at run time, such as \`.github/ouro-hx-installed.json\`.`;

/** One repository: current, or updated through the bot's one pull request. */
export async function keepRepo(gh, repo, releases, sources, { dryRun = false, live = liveFor(repo), now = () => new Date(), fetchImpl = null } = {}) {
  const info = await gh.get(`repos/${repo}`);
  const base = info.default_branch;
  const head = (await gh.get(`repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`)).object.sha;
  const found = await readPins(gh, repo, head);
  const { texts, blobs, treeSha } = found;
  // What the repository asks of every change (.github/ouro-current.json): a new version, a changelog fragment.
  const readAt = async (ref, path) => {
    try {
      const file = await gh.get(`repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${ref}`);
      return Buffer.from(file.content, "base64").toString("utf8");
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  };
  const read = (path) => readAt(head, path);
  const rulesText = found.pins.length ? await read(RULES_PATH) : null;
  const rules = rulesText === null ? null : JSON.parse(rulesText);
  const review = reviewTeam(rules, info.owner.login);
  // A repository never follows itself (Ouro UI's own copy of core's generator follows core, not Ouro UI), and a pin
  // the repository's rules ignore stays where it is.
  const pins = found.pins.filter((pin) => REPOS[pin.follows] !== repo && !isIgnored(rules, pin.file));
  let consumer = null;
  const ctx = {
    ...sources,
    /** Every path in the repository, from its tree, without reading a file. */
    consumerPaths: () => [...blobs.keys()],
    consumerFiles: async () => (consumer ??= readTarball(await gh.get(`repos/${repo}/tarball/${head}`, { raw: true }))),
    /** One file of the repository, or null when it has none at that path. */
    consumerFile: async (path) => (blobs.has(path) ? Buffer.from((await gh.get(`repos/${repo}/git/blobs/${blobs.get(path)}`)).content, "base64") : null),
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
  // An install record already on the release whose stylesheet lacks what the release's theme items add (an update that
  // moved the components alone, before Ouro Current wrote stylesheets: #1843) is behind too, for its stylesheet.
  for (const pin of pins) {
    if (pin.kind === "hx-installed" && !isBehind(pin, releases.web) && (await hxStylesheetBehind(pin, texts[pin.file], releases.web, ctx))) pin.stylesheet = true;
  }
  let behind = pins.filter((pin) => pin.stylesheet || isBehind(pin, releases[pin.follows]));
  // An app that also builds an ourostack package which takes ouro-ui-apple itself (Ouro MD and its app shell) resolves
  // only when both take the same version. Ouro UI for Apple waits until each such package, at the revision the app
  // resolves, takes the new release: moving the app alone left ouro-md#194 unable to resolve its packages.
  const swiftHolds = behind.some((pin) => pin.follows === "apple") ? await appleHolds(gh, pins, texts, releases.apple) : [];
  if (swiftHolds.length) behind = behind.filter((pin) => pin.follows !== "apple");
  const result = { repo, private: Boolean(info.private), pins: pins.map((pin) => ({ kind: pin.kind, file: pin.file, follows: pin.follows, current: pin.current, latest: releases[pin.follows].tag, behind: behind.includes(pin) })) };
  const existingPr = dryRun ? null : await openPr(gh, repo, info.owner.login);
  if (swiftHolds.length && behind.length === 0) return { ...result, state: "skipped", reason: holdNote(swiftHolds, releases.apple), pr: null };
  if (pins.length === 0 || behind.length === 0) {
    if (existingPr) {
      await gh.post(`repos/${repo}/issues/${existingPr.number}/comments`, { body: "This repository is already on the newest Ouro UI releases, so this pull request is no longer needed." });
      await gh.patch(`repos/${repo}/pulls/${existingPr.number}`, { state: "closed" });
    }
    return { ...result, state: pins.length === 0 ? "no-pins" : "current", pr: null };
  }
  // Each file's pins apply in turn to its text, so two pins in one file (two vendored sources) both land.
  const files = {};
  const notes = swiftHolds.length ? [holdNote(swiftHolds, releases.apple)] : [];
  // The Ouro check rules the release adds, which the body lists under their own heading, after the notes. A live-checked
  // repository lists every rule its release brings (`brought`), vendored Ouro check or not; the others only those it vendors.
  const checkRules = [];
  const brought = { rules: [], notes: [] };
  for (const pin of behind) {
    const text = typeof files[pin.file] === "string" ? files[pin.file] : texts[pin.file];
    const update = await UPDATERS[pin.kind](pin, text, releases[pin.follows], ctx);
    Object.assign(files, update.files);
    notes.push(...update.notes);
    checkRules.push(...(update.checkRules ?? []));
    brought.rules.push(...(update.newRules?.rules ?? []));
    brought.notes.push(...(update.newRules?.notes ?? []));
  }
  // A new ouro-actions generator generates the projections again, as the repository runs generate (ouro-ui-core#123).
  const generated = await regenerate(files, ctx);
  Object.assign(files, generated.files);
  notes.push(...generated.notes);
  // Fewer lint hits in what the update vendors lowers the app's oxlint baseline, which its lint holds every count to (spoonjoy-v2#814).
  const linted = await lowerBaseline(files, ctx);
  Object.assign(files, linted.files);
  notes.push(...linted.notes);
  const named = live ? brought.rules : checkRules;
  // GitHub lets an app write under .github/workflows/ only with the `workflows` permission, which Ouro Current does not
  // ask for: it would need every installation approved again, and give the app write access to every repository's CI.
  // A pin there is left alone and said so; the repository keeps the version in a file its workflow reads instead.
  const held = [...new Set([...Object.keys(files), ...behind.map((pin) => pin.file)].filter(inWorkflows))].sort();
  for (const path of held) delete files[path];
  if (held.length) notes.push(workflowNote(held));
  if (behind.every((pin) => inWorkflows(pin.file))) return { ...result, state: "skipped", reason: workflowNote(held), pr: null };
  const shown = behind.filter((pin) => !inWorkflows(pin.file));
  const name = shown.every((pin) => pin.stylesheet) ? `Update the stylesheet to ${NAMES.web} ${releases.web.tag}` : title(shown, releases);
  const latestRelease = async () => {
    try {
      return (await gh.get(`repos/${repo}/releases/latest`)).tag_name ?? null;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  };
  const published = async (name, version) => (await (fetchImpl ?? globalThis.fetch)(`https://registry.npmjs.org/${name.replace("/", "%2F")}/${version}`)).ok;
  const newest = [...new Set(behind.map((pin) => pin.follows))].sort().map((follows) => `${NAMES[follows]} ${releases[follows].tag}`);
  const asked = await applyRules(rules, { read, latestRelease, published, releases: newest.join(" and "), newest: releases[behind[0].follows].tag });
  Object.assign(files, asked.files);
  notes.push(...asked.notes);
  // Two pins that vendor the same generator say the same thing once.
  notes.splice(0, notes.length, ...new Set(notes));
  // Every updater held back (a set that moves together or not at all): there is nothing to propose, and the notes say why.
  if (Object.keys(files).length === 0) return { ...result, state: "skipped", reason: notes.join(" "), pr: null };
  if (review) notes.push(`Auto-merge is off: this repository asks \`${info.owner.login}/${review}\` to review the update.`);
  if (dryRun) {
    // A live check runs when the update is written, not here: a dry run reads only what the write would read.
    const liveNote = live && brought.rules.length ? [`The Ouro check of ${releases.web.tag} runs against the live site when this update is written: a finding of a rule it does not bring in holds the update back.`] : [];
    return { ...result, state: "would-update", pr: null, plan: { title: name, files: Object.keys(files).sort(), notes: [...notes, ...liveNote], sections: [checkRulesSection(named, null, checkConfigs(files)[0])].filter(Boolean) } };
  }
  const existing = await branchState(gh, repo, base);
  // The pull request open when this run began may have merged or closed since (GitHub deletes a merged pull request's
  // branch): main as this run read it is from before that, so nothing is written, neither a branch on the old main nor
  // a title on the merged pull request, and the next run starts from the new main (#1840).
  if (existingPr) {
    const now = await gh.get(`repos/${repo}/pulls/${existingPr.number}`);
    if (now.state !== "open") return { ...result, state: "skipped", reason: `#${existingPr.number} ${now.merged ? "merged" : "closed"} while this run read the repository, so the next run starts from the new main.`, pr: null };
  }
  // Someone pushed to the open pull request's branch (a fix its checks needed): as Dependabot does, leave it to them
  // rather than force-push their work away. Closing the pull request or deleting the branch hands it back.
  if (existing && !existing.ours && existingPr) {
    return { ...result, state: "pr", pr: { number: existingPr.number, url: existingPr.html_url, title: existingPr.title, autoMerge: Boolean(existingPr.auto_merge), note: "edited by someone else, so left alone", pushed: false, edited: true } };
  }
  // An Ouro check rule this update brings in: the findings the pull request's own checks reported for it are recorded as
  // known, so they pass and a new one fails (known.mjs). The run after the one that brought the rule writes them. A
  // live-checked repository has its findings checked on its live site instead, before anything is written (live.mjs).
  let seed = null;
  const seeding = !live && Boolean(existing?.ours && sources.ciReports && bringsCheck(files));
  if (live && (brought.rules.length || brought.notes.length)) {
    // The update's branch records its findings only when it is Ouro Current's and for this release: an earlier run's
    // check of another release says nothing about this one.
    const sameRelease = Boolean(existing?.ours) && (existing.moves.includes(` to ${releases.web.tag}.`) || existing.moves.includes(` to ${releases.web.tag};`));
    const gate = await gateLive({
      live,
      tag: releases.web.tag,
      rules: brought.rules.map((rule) => rule.rule),
      unreadable: brought.notes,
      base: await read(CHECK_CONFIG),
      branch: sameRelease ? await readAt(existing.sha, CHECK_CONFIG) : null,
      liveCheck: sources.liveCheck,
      previous: async () => sources.publishedLive?.(repo) ?? null,
      now: now(),
    });
    if (gate.held) return { ...result, state: "skipped", reason: gate.held, pr: null, ...(gate.live ? { live: gate.live } : {}) };
    seed = gate.seed ? { ...gate.seed, path: CHECK_CONFIG } : null;
    if (seed?.file) files[CHECK_CONFIG] = seed.file;
  } else if (seeding) {
    const reports = await sources.ciReports(gh, repo, existing.sha);
    // Each check's own ouro-check.json, the one it reads where it runs: a package's in a monorepo, not the root's.
    for (const path of checkConfigs(files)) {
      const one = await seedKnown({
        files,
        oldCheck: async (folder) => {
          const own = await ctx.consumerFolder(folder.replace(/\/$/, ""));
          return own.has(`${folder}run.ts`) ? [...own.values()].map(String) : [];
        },
        reports,
        base: await read(path),
        branch: await readAt(existing.sha, path),
        widened: named.filter((rule) => rule.widened).map((rule) => rule.rule),
      });
      if (!one) continue;
      files[path] = one.file;
      seed ??= { ...one, path };
    }
  }
  const moves = `${MARK.trim()} ${behind.map((pin) => `${pin.file} ${pin.current} to ${releases[pin.follows].tag}`).join("; ")}.`;
  const commit = await commitFiles(gh, repo, head, treeSha, files, `${name}\n\n${moves}`, existing);
  // Auto-merge left on from the last push lets a merge queue take the pull request in the same second as this push,
  // and GitHub then started no \`pull_request\` checks for it (ourostack/m365crawl#366, 07:45Z). It is turned off
  // before the push and on again after it, as for a new pull request.
  const disarmed = commit.changed && existing && existingPr?.auto_merge ? await disarm(gh, existingPr) : false;
  if (commit.changed) {
    try {
      if (existing) await gh.patch(`repos/${repo}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true });
      else await gh.post(`repos/${repo}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
    } catch (error) {
      // The branch went between the read and the write: its pull request merged or closed and GitHub deleted it, as the
      // check above catches when it happens earlier. The next run starts from the new main (ourostack/ouro-ui#1993).
      if (existing && error.status === 422 && /reference does not exist/i.test(error.message)) {
        return { ...result, state: "skipped", reason: `${existingPr ? `#${existingPr.number}'s branch` : `The ${BRANCH} branch`} was deleted while this run wrote it (its pull request merged or closed), so the next run starts from the new main.`, pr: null };
      }
      // GitHub keeps the branch of a pull request in a merge queue as it is: the queued update merges, or leaves the
      // queue, and the next run brings it up to date (ourostack/ouro-ui#1809).
      if (!(existing && existingPr && error.status === 422 && /merge queue/i.test(error.message))) throw error;
      if (disarmed && !review) await autoMerge(gh, existingPr, moves);
      return { ...result, state: "pr", pr: { number: existingPr.number, url: existingPr.html_url, title: existingPr.title, autoMerge: Boolean(existingPr.auto_merge), note: "in the merge queue, so left as it is until it merges or leaves the queue", pushed: false } };
    }
  }
  // The reports seeding read came from a run that a failing shard cut short, and nothing new was pushed, so no run on
  // the branch will ever report the cancelled shards. A FULL_RUN repository_dispatch event, which needs only the
  // Contents write the app has, asks the check's workflow to run every shard on the commit; the next round records
  // what that run reports. A workflow without that trigger is left alone, and the result says so.
  let fullRun = null;
  if (seeding && !commit.changed && sources.ciCutShort) {
    for (const workflow of await sources.ciCutShort(gh, repo, existing.sha)) {
      const text = workflow.path ? await read(workflow.path) : null;
      if (!text?.includes(FULL_RUN)) {
        fullRun = `${workflow.path ?? `workflow ${workflow.id}`} has no \`repository_dispatch\` trigger for \`${FULL_RUN}\`, so the cancelled shards' findings wait for a run that reports them`;
        continue;
      }
      try {
        await gh.post(`repos/${repo}/dispatches`, { event_type: FULL_RUN, client_payload: { sha: existing.sha } });
        fullRun = `sent \`${FULL_RUN}\` for ${existing.sha}, since a failing shard cancelled the others in ${workflow.path}`;
      } catch (error) {
        fullRun = `could not send \`${FULL_RUN}\` (${error.status ?? error.message}), so the cancelled shards' findings wait for a run that reports them`;
      }
    }
  }
  const text = body(behind, releases, notes, [checkRulesSection(named, seed, checkConfigs(files)[0])].filter(Boolean));
  let pr = existingPr;
  if (pr) {
    if (pr.title !== name || pr.body !== text) pr = await gh.patch(`repos/${repo}/pulls/${pr.number}`, { title: name, body: text });
  } else {
    pr = await gh.post(`repos/${repo}/pulls`, { title: name, body: text, head: BRANCH, base });
  }
  if (review) {
    // A repository that asked for review after the pull request armed auto-merge has it turned off, so a person decides.
    // One that stays armed would merge without the review, so the run fails rather than report it off.
    if (pr.auto_merge && !disarmed && !(await disarm(gh, pr))) throw new Error(`#${pr.number} has auto-merge on and GitHub would not turn it off, so it could merge without review by ${info.owner.login}/${review}`);
    const team = `${info.owner.login}/${review}`;
    // Asked when the pull request opens and after each push; between pushes, only if the team is not waiting and nobody
    // has reviewed yet (a request that failed before), so a team that already reviewed is not asked again for nothing.
    const waiting = Boolean(existingPr?.requested_teams?.some((item) => item.slug === review));
    const ask = !existingPr || commit.changed || (!waiting && (await gh.get(`repos/${repo}/pulls/${pr.number}/reviews`)).length === 0);
    let note = ask ? `review requested from ${team}` : `review left to ${team}, already asked`;
    if (ask) {
      try {
        await gh.post(`repos/${repo}/pulls/${pr.number}/requested_reviewers`, { team_reviewers: [review] });
      } catch (error) {
        note = `could not request review from ${team} (${error.status ?? error.message}), which needs to be a team with access to this repository`;
      }
    }
    return { ...result, state: "pr", pr: { number: pr.number, url: pr.html_url, title: name, autoMerge: false, note, pushed: commit.changed, review: team, ...(fullRun ? { fullRun } : {}) } };
  }
  const merge = await autoMerge(gh, pr, moves);
  return { ...result, state: "pr", pr: { number: pr.number, url: pr.html_url, title: name, autoMerge: merge.on, note: merge.note, pushed: commit.changed, ...(fullRun ? { fullRun } : {}) } };
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
        const kept = await keepRepo(gh, item.full_name, releases, sources, { now });
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
      .map((repo) => ({ repo: repo.repo, state: repo.state, pins: repo.pins.map(({ file, follows, current, latest, behind }) => ({ file, follows, current, latest, behind })), pr: repo.pr ? { number: repo.pr.number, url: repo.pr.url } : null, ...(repo.live ? { live: repo.live } : {}) }))
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
