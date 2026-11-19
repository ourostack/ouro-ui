// Mirrors Ouro HX's registry at a release tag into a registry a company owns, under its own shadcn namespace
// (`@acme/button`), so every team installs from one reviewed copy. See docs/guides/company.md.
//
//   node scripts/mirror/mirror.mjs --tag v1.3.200 --namespace @acme --out ./acme-registry [--source <dir>] [--repo <owner/repo>]
//   node scripts/mirror/mirror.mjs --check --tag v1.3.200 --namespace @acme --out ./acme-registry [--source <dir>]
//
// It reads the tag's own registry.json (main commits none: only a release tag has one) and every file it lists, from
// --source (a checkout of the tag, as `git clone --branch <tag>` makes) or, without it, from raw.githubusercontent.com
// at the tag. It writes <out>/r/<item>.json for every item, with the file contents inside and every dependency on an
// item of this repository pointed at <namespace>/<item>, as `scripts/namespace.sh` builds the public @ouro namespace;
// <out>/r/registry.json, the index; and <out>/mirror.json, which records each item's source tag, the sha256 of each of
// its source files (the hash an install record's `files` holds) and the sha256 of the item's own JSON. --check builds
// the same in memory and reports every item whose file under <out> is missing, changed or extra; exit 1 when any is.
//
// It has no dependencies, so a company can take this one file from the tag it mirrors.
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const ITEM_SCHEMA = "https://ui.shadcn.com/schema/registry-item.json";
export const DEFAULT_REPO = "ourostack/ouro-ui";
const PUBLIC_NAMESPACE = "@ouro";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** The namespace as shadcn takes it in components.json (`@acme`), or why it is not one. */
export function checkNamespace(namespace) {
  if (!/^@[a-z0-9][a-z0-9_-]*$/i.test(namespace ?? "")) throw new Error(`[ouro-ui] mirror: ${JSON.stringify(namespace)} is not a namespace. Fix: pass one like --namespace @acme (a leading @, then letters, digits, - or _).`);
  if (namespace.toLowerCase() === PUBLIC_NAMESPACE) throw new Error(`[ouro-ui] mirror: ${namespace} is the public Ouro namespace, so a mirror under it would shadow the original. Fix: pass your company's own, like --namespace @acme.`);
  return namespace;
}

/** The tag, as a release names it (`v1.3.200`), or why it is not one. */
export function checkTag(tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "")) throw new Error(`[ouro-ui] mirror: ${JSON.stringify(tag)} is not a release tag. Fix: pass one like --tag v1.3.200, from https://github.com/${DEFAULT_REPO}/releases.`);
  return tag;
}

/** `registry` (a registry.json, parsed) when it is the release `tag`'s: main commits no registry.json, so a version is what says so. */
function checkRelease(registry, tag) {
  if (`v${registry.version}` !== tag) {
    throw new Error(`[ouro-ui] mirror: registry.json has version ${registry.version ?? "none"}, not ${tag.slice(1)}: main commits no registry.json, and a checkout of it is not a release. Fix: mirror a release tag, with a checkout made by git clone --branch ${tag}.`);
  }
  return registry;
}

/**
 * A dependency on an item of this repository (pinned to a tag or not) as the mirror serves it; any other dependency as it was.
 * A release registry names its own items as `ourostack/ouro-ui/<item>` whichever copy of the repository it is read from, so
 * that address and the one `repo` fetches from both count.
 */
export function mirrorDependency(dependency, repo, namespace) {
  const prefix = [DEFAULT_REPO, repo].map((name) => `${name}/`).find((candidate) => dependency.startsWith(candidate));
  return prefix ? `${namespace}/${dependency.slice(prefix.length).replace(/#.*$/, "")}` : dependency;
}

const withMirrorDependencies = (item, repo, namespace) =>
  item.registryDependencies ? { ...item, registryDependencies: item.registryDependencies.map((dependency) => mirrorDependency(dependency, repo, namespace)) } : item;

/** A file of the release's source: a path inside registry/, never one that climbs out of it. */
const inRegistry = (path) => typeof path === "string" && path.startsWith("registry/") && !path.split("/").includes("..");

/**
 * The mirror of `registry` (the tag's registry.json, parsed) as text: a Map of each path under <out> (`r/button.json`,
 * `r/registry.json`, `mirror.json`) to its contents. `read(path)` gives a source file's bytes, or undefined when the tag has none.
 */
export function buildMirror({ registry, read, tag, namespace, repo = DEFAULT_REPO }) {
  checkRelease(registry, tag);
  const files = new Map();
  const items = {};
  const names = new Set();
  for (const { name } of registry.items) {
    if (typeof name !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(name) || name === "registry" || names.has(name)) {
      throw new Error(`[ouro-ui] mirror: ${JSON.stringify(name)} is not an item name a mirror can write (once each, letters, digits, . - and _, and not "registry"). Fix: mirror a release's own registry.json.`);
    }
    names.add(name);
  }
  const index = { ...registry, items: registry.items.map((item) => withMirrorDependencies(item, repo, namespace)) };
  files.set("r/registry.json", json(index));
  for (const item of index.items) {
    const sources = {};
    const withContent = (item.files ?? []).map((file) => {
      if (!inRegistry(file.path)) throw new Error(`[ouro-ui] mirror: ${item.name} lists ${file.path}, which is not a file under registry/. Fix: mirror a release's own registry.json, which lists only files under registry/.`);
      const bytes = read(file.path);
      if (bytes === undefined) throw new Error(`[ouro-ui] mirror: ${item.name} lists ${file.path}, which ${tag} does not have. Fix: check that --tag names a release and --source is a checkout of it.`);
      sources[file.path] = sha256(bytes);
      return { ...file, content: Buffer.from(bytes).toString("utf8") };
    });
    const text = json({ $schema: ITEM_SCHEMA, ...item, ...(item.files ? { files: withContent } : {}) });
    files.set(`r/${item.name}.json`, text);
    items[item.name] = { sourceTag: tag, hash: sha256(text), files: sources };
  }
  files.set("mirror.json", json({ schema: 1, source: { repo, tag, version: registry.version }, namespace, items }));
  return files;
}

/** The release's registry.json, parsed, and a reader of its files, from a checkout folder or raw.githubusercontent.com. */
async function sourceOf({ source, repo, tag, fetch }) {
  if (source) {
    const dir = resolve(source);
    if (!existsSync(join(dir, "registry.json"))) throw new Error(`[ouro-ui] mirror: ${dir} has no registry.json. Fix: pass --source a checkout of the release (git clone --branch ${tag} https://github.com/${repo}), not main, which commits none.`);
    return { registry: JSON.parse(readFileSync(join(dir, "registry.json"), "utf8")), read: async (path) => (existsSync(join(dir, path)) ? readFileSync(join(dir, path)) : undefined) };
  }
  const read = async (path) => {
    const response = await fetch(`https://raw.githubusercontent.com/${repo}/${tag}/${path}`);
    if (response.status === 404) return undefined;
    if (response.status !== 200) throw new Error(`[ouro-ui] mirror: ${path} at ${tag} answered HTTP ${response.status}. Fix: try again, or pass --source a checkout of the tag.`);
    return Buffer.from(await response.arrayBuffer());
  };
  const bytes = await read("registry.json");
  if (bytes === undefined) throw new Error(`[ouro-ui] mirror: ${repo} has no registry.json at ${tag}. Fix: pass a release tag from https://github.com/${repo}/releases.`);
  return { registry: JSON.parse(bytes.toString("utf8")), read };
}

/** The mirror of the release `tag`, read from `source` or the network, as buildMirror returns it. */
export async function mirrorRelease({ tag, namespace, source, repo = DEFAULT_REPO, fetch = globalThis.fetch }) {
  checkTag(tag);
  const from = await sourceOf({ source, repo, tag, fetch });
  checkRelease(from.registry, tag);
  const paths = [...new Set(from.registry.items.flatMap((item) => (item.files ?? []).map((file) => file.path)))].filter(inRegistry);
  const read = new Map();
  let next = 0;
  // Eight requests at a time: every file, without hammering GitHub.
  await Promise.all(
    Array.from({ length: Math.min(8, paths.length) }, async () => {
      while (next < paths.length) {
        const path = paths[next++];
        const bytes = await from.read(path);
        if (bytes !== undefined) read.set(path, bytes);
      }
    }),
  );
  return buildMirror({ registry: from.registry, read: (path) => read.get(path), tag, namespace, repo });
}

/** Writes the mirror under `out`, replacing its r/ folder and mirror.json, and refusing a folder that is not a mirror's. */
export function writeMirror(out, files) {
  const dir = resolve(out);
  if (existsSync(join(dir, "r")) && !existsSync(join(dir, "mirror.json"))) {
    throw new Error(`[ouro-ui] mirror: ${dir} has an r/ folder but no mirror.json, so it is not a mirror this script wrote. Fix: pass an empty --out, or one a mirror was written to.`);
  }
  rmSync(join(dir, "r"), { recursive: true, force: true });
  mkdirSync(join(dir, "r"), { recursive: true });
  for (const [path, text] of files) writeFileSync(join(dir, path), text);
}

/** How the files under `out` differ from `files`: a line for every item or file that is missing, changed or extra. */
export function mirrorDifferences(out, files) {
  const dir = resolve(out);
  const problems = [];
  const label = (path) => path.replace(/^r\//, "").replace(/\.json$/, "");
  for (const [path, text] of files) {
    if (!existsSync(join(dir, path))) problems.push(`${label(path)}: ${path} is missing.`);
    else if (readFileSync(join(dir, path), "utf8") !== text) problems.push(`${label(path)}: ${path} differs from the tag's build.`);
  }
  const have = existsSync(join(dir, "r")) ? readdirSync(join(dir, "r")).sort().map((name) => `r/${name}`) : [];
  for (const path of have) if (!files.has(path)) problems.push(`${label(path)}: ${path} is not in the tag's build.`);
  return problems;
}

export async function main(argv = process.argv.slice(2), { log = console.log, fetch = globalThis.fetch } = {}) {
  const { values } = parseArgs({
    args: argv,
    options: { tag: { type: "string" }, namespace: { type: "string" }, out: { type: "string" }, source: { type: "string" }, repo: { type: "string", default: DEFAULT_REPO }, check: { type: "boolean", default: false } },
  });
  if (!values.out) throw new Error("[ouro-ui] mirror: no --out. Fix: pass the folder the mirror is written to, like --out ./acme-registry.");
  const namespace = checkNamespace(values.namespace);
  const files = await mirrorRelease({ tag: values.tag, namespace, source: values.source, repo: values.repo, fetch });
  const count = Object.keys(JSON.parse(files.get("mirror.json")).items).length;
  if (values.check) {
    const problems = mirrorDifferences(values.out, files);
    for (const problem of problems.slice(0, 50)) log(problem);
    if (problems.length > 50) log(`And ${problems.length - 50} more.`);
    log(problems.length ? `${values.out} is not the ${values.tag} mirror: ${problems.length} difference${problems.length === 1 ? "" : "s"}.` : `${values.out} is the ${values.tag} mirror, byte for byte: ${count} items.`);
    return problems.length ? 1 : 0;
  }
  writeMirror(values.out, files);
  log(`Mirrored ${count} items of ${values.repo} ${values.tag} as ${namespace} into ${resolve(values.out)}.`);
  log(`Serve ${join(resolve(values.out), "r")} and point teams at it in components.json: "registries": { "${namespace}": "https://<your host>/r/{name}.json" }`);
  return 0;
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
