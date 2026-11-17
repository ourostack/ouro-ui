// The pin files Ouro Current understands, found by name in a repository's file list, and how each moves to a release.
// A finder reads a file's text and returns the pins in it ({ kind, file, follows, current, ... }); an updater returns
// the files to write ({ path: text | Buffer | null }, null deleting) and notes for the pull request.
//
// follows: "web" (ourostack/ouro-ui), "core" (ourostack/ouro-ui-core) or "apple" (ourostack/ouro-ui-apple).
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { dirname, posix } from "node:path";
import { isAfter } from "./rules.mjs";

export const REPOS = { web: "ourostack/ouro-ui", core: "ourostack/ouro-ui-core", apple: "ourostack/ouro-ui-apple" };
export const NAMES = { web: "Ouro UI", core: "Ouro UI core", apple: "Ouro UI for Apple" };

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bare = (version) => String(version ?? "").replace(/^v/, "");
/** The same version, written the way the file already writes it (with or without the `v`). */
const like = (old, version) => (String(old).startsWith("v") ? `v${bare(version)}` : bare(version));

const APPLE_URL = String.raw`https://github\.com/ourostack/ouro-ui-apple(?:\.git)?`;
const SWIFT_MANIFEST = new RegExp(String.raw`(\.package\(\s*url:\s*"${APPLE_URL}"\s*,\s*(?:exact:|from:|\.exact\(|\.upToNextMinor\(from:|\.upToNextMajor\(from:)\s*")([0-9][0-9.]*)(")`, "g");
const SWIFT_RESOLVED = /("identity"\s*:\s*"ouro-ui-apple"[\s\S]*?"state"\s*:\s*\{)([\s\S]*?)(\})/;
const XCODEGEN = new RegExp(String.raw`(url:\s*${APPLE_URL}\s*\n\s*(?:exactVersion|minorVersion|majorVersion|from|version):\s*"?)([0-9][0-9.]*)`, "g");
const PBXPROJ = new RegExp(String.raw`(repositoryURL = "${APPLE_URL}";\s*requirement = \{[^}]*?(?:minimumVersion|version) = "?)([0-9][0-9.]*)`, "g");
const WORKFLOW_TAG = /(OURO_UI_TAG:\s*["']?)(v[0-9][0-9.]*)/g;

/** Every pin in one file of a repository, by its name and text. */
export function findPins(path, text) {
  const base = posix.basename(path);
  const pins = [];
  if (base === "ouro-hx-installed.json") {
    const data = JSON.parse(text);
    if (data.tag && data.files) pins.push({ kind: "hx-installed", file: path, follows: "web", current: data.tag });
  } else if (base === "pin.json" && /(^|\/)ouro-ui-core\/pin\.json$/.test(path)) {
    const data = JSON.parse(text);
    if (data.tag && data.asset && data.path) pins.push({ kind: "core-pin", file: path, follows: "core", current: data.tag });
  } else if (base === "dist-manifest.json") {
    // ouro-ui-core's own manifest, copied beside the files vendored from its release (ouro-actions, its claims).
    const data = JSON.parse(text);
    if (typeof data.coreTag === "string" && data.files && typeof data.files === "object") pins.push({ kind: "core-manifest", file: path, follows: "core", current: data.coreTag });
  } else if (base === "upstream-sources.lock.json") {
    for (const source of JSON.parse(text).sources ?? []) {
      const follows = Object.keys(REPOS).find((key) => REPOS[key] === source.repository);
      if (follows && source.commit && Array.isArray(source.files)) pins.push({ kind: "vendor-lock", file: path, follows, current: `commit ${source.commit.slice(0, 7)}`, commit: source.commit, source: source.id });
    }
  } else if (base === "Package.swift") {
    for (const match of text.matchAll(SWIFT_MANIFEST)) pins.push({ kind: "swiftpm", file: path, follows: "apple", current: match[2] });
  } else if (base === "Package.resolved") {
    const match = SWIFT_RESOLVED.exec(text);
    const version = match && /"version"\s*:\s*"([^"]+)"/.exec(match[2]);
    if (version) pins.push({ kind: "swiftpm-resolved", file: path, follows: "apple", current: version[1] });
  } else if (base === "project.yml") {
    for (const match of text.matchAll(XCODEGEN)) pins.push({ kind: "xcodegen", file: path, follows: "apple", current: match[2] });
  } else if (base === "project.pbxproj") {
    for (const match of text.matchAll(PBXPROJ)) pins.push({ kind: "xcodeproj", file: path, follows: "apple", current: match[2] });
  } else if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(path)) {
    for (const match of text.matchAll(WORKFLOW_TAG)) pins.push({ kind: "workflow-tag", file: path, follows: "web", current: match[2] });
  }
  return pins;
}

/** The file names worth reading, so a repository's whole tree is never downloaded to find its pins. */
export const isCandidate = (path) =>
  !/(^|\/)(node_modules|\.build|DerivedData|Pods|vendor\/bundle)\//.test(path) &&
  (/(^|\/)(ouro-hx-installed\.json|upstream-sources\.lock\.json|dist-manifest\.json|Package\.swift|Package\.resolved|project\.yml|project\.pbxproj)$/.test(path) ||
    /(^|\/)ouro-ui-core\/pin\.json$/.test(path) ||
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path));

/** Whether a pin is behind the release it follows. A vendored commit is behind unless it is the release's commit. */
export const isBehind = (pin, release) => (pin.kind === "vendor-lock" ? pin.commit !== release.sha : bare(pin.current) !== bare(release.tag));

// ---- Updaters: each takes the pin, the file's text, the release, and `ctx` (tarballs, assets, the consumer's files) ----

/** A plain version in the file's text, replaced where the finder found it. */
const replaceVersion = (pattern) => (pin, text, release) => ({ files: { [pin.file]: text.replace(pattern, (all, head, version, tail) => `${head}${like(version, release.tag)}${typeof tail === "string" ? tail : ""}`) }, notes: [] });

function updateResolved(pin, text, release) {
  const next = text.replace(SWIFT_RESOLVED, (all, head, state, tail) => {
    let body = state.replace(/("version"\s*:\s*")[^"]+(")/, `$1${bare(release.tag)}$2`);
    body = body.replace(/("revision"\s*:\s*")[0-9a-f]+(")/, `$1${release.sha}$2`);
    return `${head}${body}${tail}`;
  });
  return { files: { [pin.file]: next }, notes: [] };
}

/** The registry's files at a tag, each with the path it installs to (`@components/…`, `@lib/…`, `~/…`). */
function registryTargets(tarball) {
  const registry = JSON.parse(tarball.get("registry.json").toString("utf8"));
  const out = [];
  for (const item of registry.items ?? []) for (const file of item.files ?? []) if (file.target) out.push({ item: item.name, path: file.path, target: file.target });
  return out;
}

/** The item a registryDependencies entry names: `ourostack/ouro-ui/lib-platform#v1.3.232`, a URL to `lib-platform.json`, or `lib-platform`. */
const dependencyName = (dependency) => dependency.replace(/#.*$/, "").replace(/\.json$/, "").split("/").at(-1);

/** The items `names` install at one tag, with every item they depend on, as the shadcn CLI follows registryDependencies. */
export function withDependencies(tarball, names) {
  const registry = JSON.parse(tarball.get("registry.json").toString("utf8"));
  const byName = new Map((registry.items ?? []).map((item) => [item.name, item]));
  const out = new Set();
  const visit = (name) => {
    if (out.has(name) || !byName.has(name)) return;
    out.add(name);
    for (const dependency of byName.get(name).registryDependencies ?? []) visit(dependencyName(dependency));
  };
  for (const name of names) visit(name);
  return out;
}

/** Where each alias lands in the consumer, read from the paths its install record already holds. */
function aliasRoots(targets, installed) {
  const votes = {};
  for (const { target } of targets) {
    const alias = /^(@[a-z]+|~)\//.exec(target)?.[1];
    if (!alias) continue;
    const rest = target.slice(alias.length + 1);
    for (const path of installed) {
      if (path === rest || path.endsWith(`/${rest}`)) {
        const root = path.slice(0, path.length - rest.length);
        votes[alias] ??= {};
        votes[alias][root] = (votes[alias][root] ?? 0) + 1;
      }
    }
  }
  const roots = { "~": "" };
  for (const [alias, counts] of Object.entries(votes)) roots[alias] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  // An alias nothing installed yet sits beside one that did, as shadcn's do (`app/components/` beside `app/lib/`).
  const known = Object.entries(roots).find(([alias, root]) => alias !== "~" && root.endsWith(`${alias.slice(1)}/`));
  for (const { target } of targets) {
    const alias = /^(@[a-z]+)\//.exec(target)?.[1];
    if (alias && !(alias in roots) && known) roots[alias] = `${known[1].slice(0, known[1].length - known[0].length)}${alias.slice(1)}/`;
  }
  return roots;
}

const resolveTarget = (target, roots) => {
  const alias = /^(@[a-z]+|~)\//.exec(target)?.[1];
  return alias && alias in roots ? `${roots[alias]}${target.slice(alias.length + 1)}` : null;
};

/**
 * The rewrite the shadcn CLI makes when it installs a registry file: the registry's own import paths become the app's
 * aliases (components.json). The install record keeps the hash of the registry's bytes, before this rewrite.
 */
export function installRewrite(componentsJson) {
  const aliases = componentsJson?.aliases ?? {};
  const pairs = [
    ["@/registry/ouro/components/", aliases.components ? `${aliases.components}/` : null],
    ["@/registry/ouro/lib/", aliases.lib ? `${aliases.lib}/` : null],
  ].filter(([, to]) => to);
  return (bytes) => {
    if (pairs.length === 0) return bytes;
    let text = bytes.toString("utf8");
    for (const [from, to] of pairs) text = text.split(from).join(to);
    return Buffer.from(text, "utf8");
  };
}

/** JSON with the comments and trailing commas a tsconfig may hold. */
function looseJson(text) {
  const bare = text.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match, string) => string ?? "");
  return JSON.parse(bare.replace(/,(\s*[}\]])/g, "$1"));
}

/**
 * The app's `components.json`, as the CLI finds it: in the folder it runs in, which holds the installed files (a
 * package in a monorepo, `packages/web/`, or the repository's root). The folder that holds the most of them wins.
 */
function findComponentsJson(consumer, installed) {
  let best = null;
  for (const path of consumer.keys()) {
    if (posix.basename(path) !== "components.json") continue;
    const dir = posix.dirname(path) === "." ? "" : `${posix.dirname(path)}/`;
    const holds = installed.filter((file) => file.startsWith(dir)).length;
    if (holds > 0 && (!best || holds > best.holds || (holds === best.holds && dir.length > best.dir.length))) best = { dir, holds, json: JSON.parse(consumer.get(path).toString("utf8")) };
  }
  return best;
}

/**
 * Where the app's own aliases put a registry alias (`@lib` at `src/lib/` when components.json says `@/lib` and the
 * tsconfig maps `@/*` to `./src/*`), as the CLI resolves them. A new file goes there, so its imports resolve.
 */
function declaredRoots(found, consumer) {
  if (!found) return {};
  const tsconfig = consumer.get(`${found.dir}tsconfig.json`);
  let paths = {};
  try {
    paths = tsconfig ? (looseJson(tsconfig.toString("utf8")).compilerOptions?.paths ?? {}) : {};
  } catch {
    return {};
  }
  const resolve = (alias) => {
    for (const [pattern, [target] = []] of Object.entries(paths)) {
      if (!pattern.endsWith("/*") || !target?.endsWith("/*")) continue;
      const prefix = pattern.slice(0, -1);
      if (`${alias}/`.startsWith(prefix)) return posix.normalize(`${found.dir}${target.slice(0, -1)}${`${alias}/`.slice(prefix.length)}`).replace(/^\.\//, "");
    }
    return null;
  };
  const roots = {};
  for (const [key, alias] of [["@components", found.json.aliases?.components], ["@lib", found.json.aliases?.lib]]) {
    const root = alias && resolve(alias);
    if (root) roots[key] = root.endsWith("/") ? root : `${root}/`;
  }
  return roots;
}

/** The part of a target after its alias (`ouro/check/check.ts` for `@lib/ouro/check/check.ts`). */
const afterAlias = (target) => target.replace(/^(@[a-z]+|~)\//, "");

/** The registry's targets whose source is in the tag. */
const presentTargets = (tarball) => registryTargets(tarball).filter((entry) => tarball.has(entry.path));

/** Where the app's aliases resolve: what the install record shows, then the app's own declared aliases. */
const rootsOf = (targets, installed, declared) => ({ ...aliasRoots(targets, installed), ...declared });

/** The consumer path a registry target installs to: `~/` is the folder that holds components.json. */
const installPath = (target, found, roots) => (target.startsWith("~/") ? (found ? `${found.dir}${afterAlias(target)}` : null) : resolveTarget(target, roots));

/**
 * Each consumer path an item installs to, with its registry source, at one tag. A file the install record holds stays
 * where the record says, even when the app keeps it apart from the rest of its alias (Ouro check in `lib/ouro/check/`
 * beside components in `src/`); a file the record lacks goes beside its item's other files, else under its alias.
 */
function installedPaths(tarball, installed, declared = {}) {
  const targets = presentTargets(tarball);
  const roots = rootsOf(targets, installed, declared);
  const byPath = new Map();
  const itemRoots = new Map();
  for (const entry of targets) {
    const rest = afterAlias(entry.target);
    const path = installed.find((candidate) => candidate === rest || candidate.endsWith(`/${rest}`));
    if (!path) continue;
    byPath.set(path, entry);
    if (!itemRoots.has(entry.item)) itemRoots.set(entry.item, { alias: entry.target.slice(0, entry.target.length - rest.length), root: path.slice(0, path.length - rest.length) });
  }
  for (const entry of targets) {
    if ([...byPath.values()].includes(entry)) continue;
    const sibling = itemRoots.get(entry.item);
    const path = sibling && entry.target.startsWith(sibling.alias) ? `${sibling.root}${afterAlias(entry.target)}` : resolveTarget(entry.target, roots);
    if (path && !byPath.has(path)) byPath.set(path, entry);
  }
  return byPath;
}

const list = (paths) => paths.map((path) => `\`${path}\``).join(", ");

/** A path in a script, where it stands as a word: `src/lib/x.ts`, or `./src/lib/x.ts` after a space or a quote. */
const scriptPath = (path) => new RegExp(String.raw`(^|[\s"'=(])((?:\.\/)?)${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\w-]|\.\w)`, "g");

/**
 * A package.json the moved files need: the `#ouro-ax/*` import their shared Ouro AX files resolve through, when it lacks
 * one, and each `scripts` value that names a moved file, pointed where it now sits. Only what changed is rewritten, in
 * the file's own indentation, with its trailing newline.
 */
function editPackage(text, { axImport, moves }) {
  const data = JSON.parse(text);
  const changed = { imports: false, scripts: false };
  if (axImport && !(data.imports && typeof data.imports === "object" && "#ouro-ax/*" in data.imports)) {
    data.imports = { ...(data.imports ?? {}), "#ouro-ax/*": axImport };
    changed.imports = true;
  }
  for (const [name, value] of Object.entries(data.scripts ?? {})) {
    if (typeof value !== "string") continue;
    let next = value;
    for (const move of moves) next = next.replace(scriptPath(move.from), (all, lead, dotSlash) => `${lead}${dotSlash}${move.to}`);
    if (next !== value) {
      data.scripts[name] = next;
      changed.scripts = true;
    }
  }
  if (!changed.imports && !changed.scripts) return { text, ...changed };
  const indent = /^([ \t]+)"/m.exec(text)?.[1] ?? "  ";
  return { text: `${JSON.stringify(data, null, indent)}${text.endsWith("\n") ? "\n" : ""}`, ...changed };
}

/**
 * Ouro HX installed as source (`.github/ouro-hx-installed.json`: the tag, its commit, and the sha256 of each installed
 * file's registry source). A file is updated only when the old tag's source, rewritten as the CLI rewrites it, is
 * exactly the file in the repository: then the same rewrite of the new source is exactly what the CLI would write. A
 * file that differs was edited here, or written in a way this cannot reproduce, so it is left alone and named.
 */
async function updateHxInstalled(pin, text, release, ctx) {
  const record = JSON.parse(text);
  const installed = Object.keys(record.files);
  const [previous, next, consumer] = await Promise.all([ctx.tarball("web", record.tag), ctx.tarball("web", release.tag), ctx.consumerFiles()]);
  const found = findComponentsJson(consumer, installed);
  const declared = declaredRoots(found, consumer);
  const before = installedPaths(previous, installed, declared);
  const after = installedPaths(next, installed, declared);
  const nextTargets = presentTargets(next);
  const nextRoots = rootsOf(nextTargets, installed, declared);
  const nextByPath = new Map();
  for (const entry of nextTargets) {
    if (!nextByPath.has(entry.path)) nextByPath.set(entry.path, entry);
  }
  const rewrite = installRewrite(found?.json ?? null);
  const out = {};
  const hashes = {};
  const edited = [];
  const gone = [];
  const moves = [];
  const blocked = [];
  const items = new Set();
  for (const path of installed) {
    hashes[path] = record.files[path];
    const now = consumer.get(path);
    const old = before.get(path);
    const wrote = old && rewrite(previous.get(old.path));
    if (!now || !wrote || !wrote.equals(now)) {
      edited.push(path);
      continue;
    }
    const entry = after.get(path);
    if (!entry) {
      // The registry still has the file at this tag, but its target moved (Node-only tools now install under scripts/):
      // the unedited file moves there, unless the app already has a file at the new path.
      const moved = nextByPath.get(old.path);
      const to = moved && installPath(moved.target, found, nextRoots);
      if (!to || to === path) {
        gone.push(path);
        continue;
      }
      if (consumer.has(to) || to in record.files || to in out) {
        blocked.push({ from: path, to });
        continue;
      }
      const source = next.get(old.path);
      delete hashes[path];
      out[path] = null;
      hashes[to] = sha256(source);
      out[to] = rewrite(source);
      items.add(moved.item);
      moves.push({ from: path, to, target: moved.target });
      continue;
    }
    items.add(entry.item);
    const source = next.get(entry.path);
    hashes[path] = sha256(source);
    const bytes = rewrite(source);
    if (!bytes.equals(now)) out[path] = bytes;
  }
  // A file an updated item now includes, or a file of an item it now depends on (a new `lib/ouro/platform.ts` that an
  // updated kbd imports), is added as the CLI would add it. A file the app already has outside the record is its own.
  const wanted = withDependencies(next, items);
  const added = [];
  for (const [path, entry] of after) {
    if (path in hashes || !wanted.has(entry.item) || consumer.has(path)) continue;
    const source = next.get(entry.path);
    out[path] = rewrite(source);
    hashes[path] = sha256(source);
    added.push(path);
  }
  // Ouro AX's shared files are imported as `#ouro-ax/*`, which the app's package.json must map to its lib folder. Only
  // the package beside components.json changes, and a script that ran a moved file is pointed at where it now sits.
  const pkgPath = found ? `${found.dir}package.json` : null;
  const pkgText = pkgPath && consumer.get(pkgPath)?.toString("utf8");
  const writesAx = Object.values(out).some((value) => Buffer.isBuffer(value) && value.includes("#ouro-ax/"));
  const lib = nextRoots["@lib"];
  const libIn = found && lib?.startsWith(found.dir) ? lib.slice(found.dir.length) : null;
  const inPackage = (path) => (path.startsWith(found.dir) ? path.slice(found.dir.length) : null);
  const pkg = { imports: false, scripts: false };
  if (pkgText !== undefined && (moves.length > 0 || writesAx)) {
    const scriptMoves = moves.flatMap(({ from, to }) => (inPackage(from) && inPackage(to) ? [{ from: inPackage(from), to: inPackage(to) }] : []));
    const edit = editPackage(pkgText, { axImport: writesAx && libIn !== null ? `./${libIn}ouro/ax/*` : null, moves: scriptMoves });
    if (edit.text !== pkgText) out[pkgPath] = Buffer.from(edit.text, "utf8");
    pkg.imports = edit.imports;
    pkg.scripts = edit.scripts;
  }
  const sorted = Object.fromEntries(Object.keys(hashes).sort().map((path) => [path, hashes[path]]));
  out[pin.file] = `${JSON.stringify({ ...record, tag: release.tag, tagCommit: release.sha, files: sorted }, null, 2)}\n`;
  const notes = [];
  // No counts or bare versions: a repository that runs Ouro UI's claims check on pull requests reads them as claims.
  const one = (paths, single, several) => (paths.length === 1 ? single : several);
  for (const { from, to, target } of moves) notes.push(target.startsWith("~/") ? `Moves \`${from}\` to \`${to}\`, outside the app's TypeScript project.` : `Moves \`${from}\` to \`${to}\`.`);
  if (pkg.imports) notes.push(`Adds \`#ouro-ax/*\` to \`imports\` in \`${pkgPath}\`, which the moved files resolve the shared Ouro AX files through.`);
  if (pkg.scripts) notes.push(`Points the \`scripts\` in \`${pkgPath}\` at the moved files.`);
  if (added.length) notes.push(`Adds what installed items now include: ${list(added)}.`);
  if (edited.length) notes.push(`Leaves ${list(edited)} at \`${record.tag}\`, because ${one(edited, "it is", "they are")} not what the CLI wrote for \`${record.tag}\` (edited here, or rewritten in a way Ouro Current does not reproduce). Install ${one(edited, "it", "them")} again with the CLI, or move the change into Ouro UI.`);
  for (const { from, to } of blocked) notes.push(`Leaves \`${from}\` where it is, because \`${to}\` already exists in the app and is not replaced.`);
  if (gone.length) notes.push(`Keeps what the registry no longer has: ${list(gone)}.`);
  return { files: out, notes };
}

/** The release asset that holds ouro-ui-core's built `dist/`, which the repository does not commit. */
export const coreDistAsset = (tag) => `ouro-ui-core-${tag}-dist.zip`;
/** Where a core `dist/` path sits in that asset: its paths are relative to `dist/`, and `dist-manifest.json` is at its root. */
const inDistAsset = (path) => path.replace(/^dist\//, "");
/**
 * Said of an update that vendors core's action generator: projections a repository generated with the old one still
 * pass `check`, which ignores the generator's version stamp from this release on, so they need not be generated again.
 */
const STAMP_FREE = "v0.17.6";
const projectionsNote = (release) => (isAfter(STAMP_FREE, release.tag) ? [] : [`Generated projections stay valid: \`check\` ignores the generator's version stamp from Ouro UI core \`${STAMP_FREE}\` on, so a version-only update needs nothing generated again.`]);

/** One file vendored from ouro-ui-core's release asset (`vendor/ouro-ui-core/pin.json`), taken from the new release's asset. */
async function updateCorePin(pin, text, release, ctx) {
  const data = JSON.parse(text);
  const asset = data.asset.split(bare(data.tag)).join(bare(release.tag));
  const bytes = await ctx.assetFile("core", release.tag, asset, data.path);
  const vendored = posix.join(dirname(pin.file), posix.basename(data.path));
  const next = { ...data, tag: like(data.tag, release.tag), release: data.release ? `https://github.com/${REPOS.core}/releases/tag/${release.tag}` : undefined, asset, sha256: sha256(bytes) };
  if (!data.release) delete next.release;
  return { files: { [vendored]: bytes, [pin.file]: `${JSON.stringify(next, null, 2)}\n` }, notes: [] };
}

/** Where a JSON string value sits in `text`: the first `"key": "…"` at or after `from` and before `to`. */
function valueAt(text, key, from, to) {
  const pattern = new RegExp(String.raw`"${key}"\s*:\s*"([^"\\]*)"`, "g");
  pattern.lastIndex = from;
  const match = pattern.exec(text);
  if (!match || match.index >= to) return null;
  const start = match.index + match[0].length - match[1].length - 1;
  return { start, end: start + match[1].length, value: match[1] };
}

/**
 * The lock file with only the source's commit and its files' sha256 values changed, every other byte as it was, so a
 * repository's own layout (one file to a line, say) and its checks of it survive. Null when the text is laid out in a
 * way this cannot follow; the caller then writes the file whole.
 */
export function editLock(text, sourceId, commit, shas, release = {}) {
  const id = new RegExp(String.raw`"id"\s*:\s*"${sourceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).exec(text);
  if (!id) return null;
  const nextId = /"id"\s*:\s*"/g;
  nextId.lastIndex = id.index + id[0].length;
  const end = nextId.exec(text)?.index ?? text.length;
  const edits = [];
  // The commit is the source's own key, so it is looked for before its first file.
  const firstFile = text.indexOf('"sourcePath"', id.index);
  const commitAt = valueAt(text, "commit", id.index, firstFile >= 0 && firstFile < end ? firstFile : end);
  if (!commitAt) return null;
  edits.push({ ...commitAt, next: commit });
  // The release a source names, under `release` or `tag`, moves with its commit.
  for (const [key, value] of Object.entries(release ?? {})) {
    const releaseAt = valueAt(text, key, id.index, firstFile >= 0 && firstFile < end ? firstFile : end);
    if (!releaseAt) return null;
    edits.push({ ...releaseAt, next: value });
  }
  for (const [sourcePath, sha] of Object.entries(shas)) {
    let at = id.index;
    let found = null;
    for (;;) {
      const path = valueAt(text, "sourcePath", at, end);
      if (!path) break;
      at = path.end;
      if (JSON.parse(`"${path.value}"`) !== sourcePath) continue;
      const following = valueAt(text, "sourcePath", path.end, end);
      found = valueAt(text, "sha256", path.end, following ? following.start : end);
      break;
    }
    if (!found) return null;
    edits.push({ ...found, next: sha });
  }
  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const edit of edits) out = out.slice(0, edit.start) + edit.next + out.slice(edit.end);
  return out;
}

/** A source's `release` or `tag`, moved to the new tag the way it writes it: a tag (`v0.16.0`) or its release page. */
function nextRelease(value, release) {
  if (typeof value !== "string") return value;
  if (/^v?[0-9]/.test(value)) return like(value, release.tag);
  return value.replace(/(\/releases\/tag\/)[^/?#]+/, `$1${release.tag}`);
}

/**
 * Files vendored from a commit (`upstream-sources.lock.json`: each source path, where it is written, and its sha256).
 * A source that follows core reads its `dist/` files from the release's dist asset, since core commits no `dist/`.
 */
async function updateVendorLock(pin, text, release, ctx) {
  const lock = JSON.parse(text);
  const source = lock.sources.find((item) => item.id === pin.source);
  const asset = pin.follows === "core" ? coreDistAsset(release.tag) : null;
  let read;
  if (asset) {
    const got = await ctx.assetFiles("core", release.tag, asset, source.files.map((file) => inDistAsset(file.sourcePath)));
    read = (path) => got.get(inDistAsset(path));
  } else {
    const next = await ctx.tarball(pin.follows, release.tag);
    read = (path) => next.get(path);
  }
  const files = {};
  const missing = [];
  const shas = {};
  source.commit = release.sha;
  // A source names its release as `release` (m365crawl) or `tag` (ouro-work-substrate); either moves with the commit.
  const named = {};
  for (const key of ["release", "tag"]) {
    if (typeof source[key] !== "string") continue;
    source[key] = nextRelease(source[key], release);
    named[key] = source[key];
  }
  for (const file of source.files) {
    const bytes = read(file.sourcePath);
    if (!bytes) {
      missing.push(file.sourcePath);
      continue;
    }
    file.sha256 = sha256(bytes);
    shas[file.sourcePath] = file.sha256;
    files[file.generatedPath] = bytes;
  }
  if (missing.length) throw new Error(`${pin.file}: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not in ${REPOS[pin.follows]} ${release.tag}${asset ? ` (${asset})` : ""}`);
  // Only this source's values change; the edit is kept when it reads back as the lock this run means to write.
  const edited = editLock(text, pin.source, release.sha, shas, named);
  const same = (value) => {
    try {
      return JSON.stringify(JSON.parse(value)) === JSON.stringify(lock);
    } catch {
      return false;
    }
  };
  files[pin.file] = edited !== null && same(edited) ? edited : `${JSON.stringify(lock, null, 2)}\n`;
  const actions = pin.follows === "core" && source.files.some((file) => /(^|\/)actions\//.test(file.sourcePath));
  return { files, notes: actions ? projectionsNote(release) : [] };
}

/**
 * Files vendored from a core release with its `dist-manifest.json` copied beside them (`tools/ouro-actions/`). The
 * manifest and the files it lists move together or not at all, since a repository checks each file against the
 * manifest's hash: every listed file must be the old release's, by name and by the old manifest's hash, and still
 * shipped. When one was edited here, or the release no longer ships it, the whole set stays and the file is named. A
 * file the manifest does not list is not core's, and is left alone.
 */
async function updateCoreManifest(pin, text, release, ctx) {
  const old = JSON.parse(text);
  const asset = coreDistAsset(release.tag);
  const manifestBytes = (await ctx.assetFiles("core", release.tag, asset, ["dist-manifest.json"])).get("dist-manifest.json");
  if (!manifestBytes) throw new Error(`${pin.file}: ${REPOS.core} ${release.tag} has no dist-manifest.json in ${asset}`);
  const next = JSON.parse(manifestBytes.toString("utf8"));
  const folder = await ctx.consumerFolder(dirname(pin.file));
  const edited = [];
  const gone = [];
  const moves = [];
  for (const [path, bytes] of [...folder].sort(([a], [b]) => a.localeCompare(b))) {
    if (path === pin.file) continue;
    const named = Object.entries(old.files).filter(([source]) => posix.basename(source) === posix.basename(path));
    if (named.length === 0) continue;
    const hash = sha256(bytes);
    const source = named.find(([, sha]) => sha === hash)?.[0];
    if (!source) edited.push(path);
    else if (!(source in next.files)) gone.push(path);
    else if (next.files[source] !== hash) moves.push({ path, source });
  }
  const one = (paths, single, several) => (paths.length === 1 ? single : several);
  if (edited.length || gone.length) {
    const why = [
      edited.length ? `${list(edited)} ${one(edited, "is", "are")} not the file \`${old.coreTag}\` shipped (edited here)` : null,
      gone.length ? `the release no longer ships ${list(gone)}` : null,
    ].filter(Boolean).join(", and ");
    return { files: {}, notes: [`Leaves \`${pin.file}\` and the files it lists at \`${old.coreTag}\`, because ${why}, and the manifest moves only with its files. Copy the release's files again, or move the change into Ouro UI core.`] };
  }
  const got = await ctx.assetFiles("core", release.tag, asset, moves.map((move) => inDistAsset(move.source)));
  const files = {};
  for (const { path, source } of moves) {
    const bytes = got.get(inDistAsset(source));
    if (!bytes || sha256(bytes) !== next.files[source]) throw new Error(`${pin.file}: ${source} in ${asset} is not the file its dist-manifest.json lists`);
    files[path] = bytes;
  }
  files[pin.file] = manifestBytes;
  const notes = [];
  if (moves.some(({ source }) => /(^|\/)actions\//.test(source))) notes.push(...projectionsNote(release));
  return { files, notes };
}

export const UPDATERS = {
  "hx-installed": updateHxInstalled,
  "core-pin": updateCorePin,
  "vendor-lock": updateVendorLock,
  "core-manifest": updateCoreManifest,
  swiftpm: replaceVersion(SWIFT_MANIFEST),
  "swiftpm-resolved": updateResolved,
  xcodegen: replaceVersion(XCODEGEN),
  xcodeproj: replaceVersion(PBXPROJ),
  "workflow-tag": replaceVersion(WORKFLOW_TAG),
};

/** The text of a file to write: a Buffer stays bytes, anything else is text. */
export const asBytes = (value) => (Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8"));
