// The drift report: for each app checkout, which Ouro HX items it has, at which release, and which of their files differ
// from that release's source, so a company can see who is behind and who has edited what. See docs/guides/company.md.
//
//   node scripts/drift/drift.mjs <app-dir>... [--latest v1.3.200] [--source <dir>] [--repo <owner/repo>] [--json] [--strict]
//
// An app's install record, `.github/ouro-hx-installed.json` (the tag it installed from, and the sha256 of each installed
// file's source), names the release and the files. For each file the report takes the registry source at that tag, rewrites
// it as the shadcn CLI does for the app's components.json aliases (the way Ouro Current decides a file is unedited), and
// compares it with the file in the checkout: "released" when they are the same, "edited" when they differ, "missing" when the
// app no longer has the file, "unlisted" when the release's registry no longer lists it, so there is nothing to compare.
// The release's registry.json and files come from raw.githubusercontent.com at the tag, or from --source, a checkout of
// that release. The newest release comes from --latest, or the GitHub API; without one "behind" is left unknown.
// --json prints the report as JSON; --strict exits 1 when an app is behind, has an edited, missing or unlisted file, or has no install record.
import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { declaredRoots, findComponentsJson, installRewrite, installedPaths, isBehind } from "../current/pins.mjs";
import { treeFiles } from "../tree.mjs";

const DEFAULT_REPO = "ourostack/ouro-ui";
const RECORD = "ouro-hx-installed.json";

/** The release `tag`'s registry.json bytes and a reader of its files, from a checkout folder or raw.githubusercontent.com. */
async function releaseSource({ tag, repo, source, fetch }) {
  if (source) {
    const dir = resolve(source);
    const file = join(dir, "registry.json");
    if (!existsSync(file)) throw new Error(`${dir} has no registry.json. Fix: pass --source a checkout of ${tag} made by git clone --branch ${tag} https://github.com/${repo}.`);
    const registry = readFileSync(file);
    const version = JSON.parse(registry.toString("utf8")).version;
    if (`v${version}` !== tag) throw new Error(`the --source checkout is ${version === undefined ? "not a release" : `v${version}`}, not ${tag}. Fix: pass a checkout of ${tag}, or drop --source to read it from GitHub.`);
    return { registry, read: async (path) => (existsSync(join(dir, path)) ? readFileSync(join(dir, path)) : undefined) };
  }
  const read = async (path) => {
    const response = await fetch(`https://raw.githubusercontent.com/${repo}/${tag}/${path}`);
    if (response.status === 404) return undefined;
    if (response.status !== 200) throw new Error(`${path} at ${tag} answered HTTP ${response.status}. Fix: try again, or pass --source a checkout of ${tag}.`);
    return Buffer.from(await response.arrayBuffer());
  };
  const registry = await read("registry.json");
  if (registry === undefined) throw new Error(`${repo} has no registry.json at ${tag}. Fix: check that the install record's tag is a release of ${repo}.`);
  return { registry, read };
}

/** The newest release's tag, from the GitHub API, or null when it cannot be read. */
async function newestRelease(repo, fetch) {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { accept: "application/vnd.github+json" } });
    return response.status === 200 ? ((await response.json()).tag_name ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * The report for one install record: its tag, the items it has with each file's state, and the counts. A record that
 * cannot be read, or whose release cannot be fetched, has an `error` and no items.
 */
async function recordReport({ dir, file, consumer, release, latest }) {
  const out = { file, tag: null, behind: null, items: [], summary: { items: 0, files: 0, released: 0, edited: 0, missing: 0, unlisted: 0 } };
  let record;
  try {
    record = JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch (error) {
    return { ...out, error: `${file} is not JSON (${error.message}). Fix: restore it from the app's history, or reinstall to write it again.` };
  }
  if (!record?.tag || typeof record.files !== "object" || record.files === null) return { ...out, error: `${file} has no "tag" and "files", so it is not an Ouro HX install record.` };
  out.tag = record.tag;
  if (latest) out.behind = isBehind({ kind: "hx-installed", current: record.tag }, { tag: latest });
  let from;
  try {
    from = await release(record.tag);
  } catch (error) {
    return { ...out, error: error.message };
  }
  const installed = Object.keys(record.files);
  // The registry the tag shipped, in the shape Ouro Current reads a release in: its registry.json, and which files it has.
  const listed = new Set(JSON.parse(from.registry.toString("utf8")).items.flatMap((item) => (item.files ?? []).map((entry) => entry.path)));
  const tarball = { get: (path) => (path === "registry.json" ? from.registry : undefined), has: (path) => listed.has(path) };
  const found = findComponentsJson(consumer, installed);
  const before = installedPaths(tarball, installed, declaredRoots(found, consumer));
  const rewrite = installRewrite(found?.json ?? null);
  const items = new Map();
  for (const path of installed) {
    const entry = before.get(path);
    let state;
    if (!entry) state = "unlisted";
    else if (!existsSync(join(dir, path))) state = "missing";
    else {
      const source = await from.read(entry.path);
      state = source !== undefined && rewrite(source).equals(readFileSync(join(dir, path))) ? "released" : "edited";
    }
    const name = entry?.item ?? "(not in this release)";
    if (!items.has(name)) items.set(name, []);
    items.get(name).push({ path, state });
    out.summary.files += 1;
    out.summary[state] += 1;
  }
  out.items = [...items].sort(([a], [b]) => a.localeCompare(b)).map(([name, files]) => ({ name, files }));
  out.summary.items = out.items.length;
  return out;
}

/**
 * The drift report of one app checkout: every install record in it. `release(tag)` gives that release's registry and files.
 */
export async function appReport(app, { release, latest = null }) {
  const dir = resolve(app);
  const paths = treeFiles(dir).filter((path) => !path.startsWith(".git/"));
  const consumer = new Map(paths.filter((path) => ["components.json", "tsconfig.json"].includes(posix.basename(path))).map((path) => [path, readFileSync(join(dir, path))]));
  const records = [];
  for (const file of paths.filter((path) => posix.basename(path) === RECORD)) records.push(await recordReport({ dir, file, consumer, release, latest }));
  return { app, records };
}

/** The whole report for several app checkouts. */
export async function driftReport(apps, { repo = DEFAULT_REPO, source = null, latest = null, fetch = globalThis.fetch } = {}) {
  const cache = new Map();
  const release = (tag) => {
    if (!cache.has(tag)) cache.set(tag, releaseSource({ tag, repo, source, fetch }));
    return cache.get(tag);
  };
  const newest = latest ?? (await newestRelease(repo, fetch));
  const out = [];
  for (const app of apps) out.push(await appReport(app, { release, latest: newest }));
  return { schema: 1, repo, latest: newest, apps: out };
}

/** Whether an app is behind, has a file that is not as released, or has no install record to measure it by. */
export const drifted = (report) => report.apps.some((app) => app.records.length === 0 || app.records.some((record) => record.error || record.behind || record.summary.edited + record.summary.missing + record.summary.unlisted > 0));

/** The report as text: one block per install record, with the items it has and a line for each file that is not as released. */
export function reportText(report) {
  const lines = [];
  for (const app of report.apps) {
    if (app.records.length === 0) lines.push(`${app.app}: no Ouro HX install record (.github/ouro-hx-installed.json) found.`);
    for (const record of app.records) {
      lines.push(`${app.app}: ${record.file}`);
      if (record.error) {
        lines.push(`  ${record.error}`);
        continue;
      }
      const where = record.behind === null ? "the newest release is unknown" : record.behind ? `behind the newest release, ${report.latest}` : `the newest release, ${report.latest}`;
      lines.push(`  Ouro HX ${record.tag}, ${where}.`);
      const { summary } = record;
      lines.push(`  ${summary.items} items, ${summary.files} files: ${summary.released} as released, ${summary.edited} edited, ${summary.missing} missing, ${summary.unlisted} not in that release.`);
      lines.push(`  Items: ${record.items.map((item) => item.name).join(", ")}.`);
      for (const item of record.items) for (const file of item.files) if (file.state !== "released") lines.push(`  ${item.name}: ${file.state} ${file.path}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function main(argv = process.argv.slice(2), { log = console.log, fetch = globalThis.fetch } = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { latest: { type: "string" }, source: { type: "string" }, repo: { type: "string", default: DEFAULT_REPO }, json: { type: "boolean", default: false }, strict: { type: "boolean", default: false } },
  });
  if (positionals.length === 0) throw new Error("[ouro-ui] drift: no app. Fix: pass the checkout of each app, like node scripts/drift/drift.mjs ../spoonjoy ../recipes.");
  for (const app of positionals) if (!existsSync(app)) throw new Error(`[ouro-ui] drift: ${app} is not a folder. Fix: pass the path of an app's checkout.`);
  const report = await driftReport(positionals, { repo: values.repo, source: values.source, latest: values.latest, fetch });
  log(values.json ? JSON.stringify(report, null, 2) : reportText(report).trimEnd());
  return values.strict && drifted(report) ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error.message);
      process.exitCode = 2;
    },
  );
}
