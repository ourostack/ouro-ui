// The pin files Ouro Current understands, found by name in a repository's file list, and how each moves to a release.
// A finder reads a file's text and returns the pins in it ({ kind, file, follows, current, ... }); an updater returns
// the files to write ({ path: text | Buffer | null }, null deleting) and notes for the pull request.
//
// follows: "web" (ourostack/ouro-ui), "core" (ourostack/ouro-ui-core), "apple" (ourostack/ouro-ui-apple), "windows"
// (ourostack/ouro-ui-windows, NuGet) or "android" (ourostack/ouro-ui-android, Gradle).
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { dirname, posix } from "node:path";
import { BASE_SOURCE, THEME_ITEMS, applyItem, baseImport, basePath, hasItem, importBase } from "./stylesheet.mjs";

export const REPOS = { web: "ourostack/ouro-ui", core: "ourostack/ouro-ui-core", apple: "ourostack/ouro-ui-apple", windows: "ourostack/ouro-ui-windows", android: "ourostack/ouro-ui-android" };
export const NAMES = { web: "Ouro UI", core: "Ouro UI core", apple: "Ouro UI for Apple", windows: "Ouro UI for Windows", android: "Ouro UI for Android" };

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

// NuGet: a PackageReference (or a central PackageVersion) of a package ouro-ui-windows releases, with a plain version
// in its Version or VersionOverride attribute or a <Version> child. A floating or ranged version is left alone.
const NUGET_FILE = /\.(?:csproj|fsproj|vbproj|props|targets)$/i;
const NUGET_ID = /^Ouro\.(?:UI\.Windows(?:\.[A-Za-z0-9_]+)*|Actions)$/i;
const NUGET_TAG = /<(PackageReference|PackageVersion)\b([^>]*?)(\/?)>/g;
const PLAIN_VERSION = "[0-9]+(?:\\.[0-9]+)*";

/** Each Ouro package reference in an MSBuild file, its version passed through `move`: the text it makes, and every reference's package and version. */
function editNuget(text, move) {
  const found = [];
  let out = "";
  let last = 0;
  for (const match of text.matchAll(NUGET_TAG)) {
    const [whole, element, attributes, selfClosing] = match;
    const id = /\b(?:Include|Update)\s*=\s*"([^"]+)"/.exec(attributes)?.[1];
    if (!id || !NUGET_ID.test(id.trim())) continue;
    const attribute = new RegExp(String.raw`(\b(?:Version|VersionOverride)\s*=\s*")(${PLAIN_VERSION})(")`).exec(attributes);
    if (attribute) {
      found.push({ id: id.trim(), version: attribute[2] });
      out += text.slice(last, match.index) + whole.replace(attribute[0], `${attribute[1]}${move(attribute[2])}${attribute[3]}`);
      last = match.index + whole.length;
      continue;
    }
    if (selfClosing) continue;
    const close = text.indexOf(`</${element}>`, match.index + whole.length);
    if (close < 0) continue;
    const inner = text.slice(match.index + whole.length, close);
    const child = new RegExp(String.raw`(<Version>\s*)(${PLAIN_VERSION})(\s*</Version>)`).exec(inner);
    if (!child) continue;
    found.push({ id: id.trim(), version: child[2] });
    out += text.slice(last, match.index) + whole + inner.replace(child[0], `${child[1]}${move(child[2])}${child[3]}`);
    last = close;
  }
  return { text: out + text.slice(last), found };
}

// Gradle: a bot.ouro.ui coordinate in a build script or a version catalog, as "group:name:version", as a catalog's
// module with its version, as group, name and version, or through a catalog's version.ref when only Ouro libraries use it.
const GRADLE_FILE = /(?:\.gradle(?:\.kts)?|\.versions\.toml)$/;
const GRADLE_COORDINATE = new RegExp(String.raw`((["'])bot\.ouro\.ui:[A-Za-z0-9_.-]+:)(${PLAIN_VERSION})(\2)`, "g");
const GRADLE_MODULE = new RegExp(String.raw`(\bmodule\s*=\s*"bot\.ouro\.ui:[A-Za-z0-9_.-]+"\s*,\s*version\s*=\s*")(${PLAIN_VERSION})(")`, "g");
const GRADLE_PARTS = new RegExp(String.raw`(\bgroup\s*[:=]\s*(["'])bot\.ouro\.ui\2\s*,\s*name\s*[:=]\s*(["'])[A-Za-z0-9_.-]+\3\s*,\s*version\s*[:=]\s*(["']))(${PLAIN_VERSION})(\4)`, "g");
const CATALOG_REF = /\bversion(?:\.ref\s*=\s*"([^"]+)"|\s*=\s*\{\s*ref\s*=\s*"([^"]+)"\s*\})/;

/** The [versions] entries of a version catalog that only bot.ouro.ui libraries refer to. */
function ouroCatalogRefs(text) {
  const ouro = new Set();
  const other = new Set();
  for (const line of text.split("\n")) {
    const ref = CATALOG_REF.exec(line);
    if (!ref) continue;
    (/bot\.ouro\.ui[:"]/.test(line) ? ouro : other).add(ref[1] ?? ref[2]);
  }
  return [...ouro].filter((name) => !other.has(name));
}

/** Each bot.ouro.ui version in a Gradle file, passed through `move`: the text it makes and every version it found. */
function editGradle(path, text, move) {
  const found = [];
  const swap = (head, version, tail) => {
    found.push(version);
    return `${head}${move(version)}${tail}`;
  };
  let out = text
    .replace(GRADLE_COORDINATE, (all, head, quote, version, tail) => swap(head, version, tail))
    .replace(GRADLE_MODULE, (all, head, version, tail) => swap(head, version, tail))
    .replace(GRADLE_PARTS, (all, head, q1, q2, q3, version, tail) => swap(head, version, tail));
  if (path.endsWith(".versions.toml")) {
    const section = /^\[versions\][^\S\n]*\n([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(out);
    if (section) {
      let body = section[1];
      for (const name of ouroCatalogRefs(out)) {
        const entry = new RegExp(String.raw`^(\s*"?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"?\s*=\s*")(${PLAIN_VERSION})(")`, "m");
        body = body.replace(entry, (all, head, version, tail) => swap(head, version, tail));
      }
      const start = section.index + section[0].length - section[1].length;
      out = out.slice(0, start) + body + out.slice(start + section[1].length);
    }
  }
  return { text: out, found };
}

const APPLE_REQUIREMENT = new RegExp(String.raw`\.package\(\s*url:\s*"${APPLE_URL}"\s*,\s*(exact:|from:|\.exact\(|\.upToNextMinor\(from:|\.upToNextMajor\(from:)\s*"([0-9][0-9.]*)"`);
const OUROSTACK_PACKAGE = /^https:\/\/github\.com\/(ourostack\/[^/]+?)(?:\.git)?$/;

/** The versions of ouro-ui-apple a Swift manifest takes, or null when it names none in a form read here. */
export function appleRequirement(manifest) {
  const match = APPLE_REQUIREMENT.exec(manifest);
  if (!match) return null;
  const rule = match[1].startsWith("exact") || match[1] === ".exact(" ? "exact" : match[1] === ".upToNextMinor(from:" ? "minor" : "major";
  return { rule, version: match[2] };
}

const parts = (version) => bare(version).split(".").map(Number);
/** Whether a requirement from appleRequirement takes a version, as SwiftPM reads it. */
export function takes(requirement, version) {
  const [want, have] = [parts(requirement.version), parts(version)];
  const cmp = [0, 1, 2].map((i) => (have[i] ?? 0) - (want[i] ?? 0)).find((d) => d !== 0) ?? 0;
  if (requirement.rule === "exact") return cmp === 0;
  if (cmp < 0 || have[0] !== want[0]) return false;
  return requirement.rule === "major" || have[1] === want[1];
}

/** The ourostack packages other than ouro-ui-apple a Package.resolved pins, each with its repository and revision. */
export function ourostackPackages(resolved) {
  const out = [];
  for (const pin of JSON.parse(resolved).pins ?? []) {
    const repo = OUROSTACK_PACKAGE.exec(pin.location ?? "")?.[1];
    if (repo && repo !== REPOS.apple && pin.state?.revision) out.push({ repo, revision: pin.state.revision });
  }
  return out;
}

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
  } else if (NUGET_FILE.test(base)) {
    for (const { id, version } of editNuget(text, (version) => version).found) pins.push({ kind: "nuget", file: path, follows: "windows", current: version, package: id });
  } else if (GRADLE_FILE.test(base)) {
    for (const version of editGradle(path, text, (version) => version).found) pins.push({ kind: "gradle", file: path, follows: "android", current: version });
  } else if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(path)) {
    for (const match of text.matchAll(WORKFLOW_TAG)) pins.push({ kind: "workflow-tag", file: path, follows: "web", current: match[2] });
  }
  return pins;
}

/** The file names worth reading, so a repository's whole tree is never downloaded to find its pins. */
export const isCandidate = (path) =>
  !/(^|\/)(node_modules|\.build|DerivedData|Pods|vendor\/bundle)\//.test(path) &&
  !/(^|\/)(bin|obj|\.gradle|build)\//.test(path) &&
  (/(^|\/)(ouro-hx-installed\.json|upstream-sources\.lock\.json|dist-manifest\.json|Package\.swift|Package\.resolved|project\.yml|project\.pbxproj)$/.test(path) ||
    NUGET_FILE.test(path) ||
    GRADLE_FILE.test(path) ||
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

/** A lock file beside a NuGet or Gradle pin that also holds the package: left as it is and named, since it carries hashes of the packages. */
async function lockNotes(pin, ctx, release) {
  const paths = ctx.consumerPaths?.() ?? [];
  const locks =
    pin.kind === "nuget"
      ? paths.filter((path) => posix.basename(path) === "packages.lock.json" && posix.dirname(path) === posix.dirname(pin.file))
      : paths.filter((path) => /(^|\/)(gradle\.lockfile|verification-metadata\.xml)$/.test(path));
  const notes = [];
  for (const path of locks) {
    const bytes = await ctx.consumerFile?.(path);
    if (!bytes || !(pin.kind === "nuget" ? /"Ouro\.(?:UI\.Windows|Actions)/i : /bot\.ouro\.ui/).test(bytes.toString("utf8"))) continue;
    const fix = pin.kind === "nuget" ? "`dotnet restore --force-evaluate`" : "`./gradlew dependencies --write-locks` (or `--write-verification-metadata sha256`)";
    notes.push(`Leaves \`${path}\` as it is: it holds the hashes of the packages at the old version. Run ${fix} on this branch to write it for \`${bare(release.tag)}\`.`);
  }
  return notes;
}

async function updateNuget(pin, text, release, ctx) {
  return { files: { [pin.file]: editNuget(text, () => bare(release.tag)).text }, notes: await lockNotes(pin, ctx, release) };
}

async function updateGradle(pin, text, release, ctx) {
  return { files: { [pin.file]: editGradle(pin.file, text, () => bare(release.tag)).text }, notes: await lockNotes(pin, ctx, release) };
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

/** An import of the shared Ouro AX files (`@/registry/ouro/ax/component`), in an import, an export or an `import()`. */
const AX_SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])@\/registry\/ouro\/ax\/([^"'\n]+)\2/g;

/**
 * The rewrite the shadcn CLI makes when it installs a registry file: the registry's own import paths become the app's
 * aliases (components.json). The install record keeps the hash of the registry's bytes, before this rewrite.
 *
 * An import of the shared Ouro AX files has no alias of its own: the CLI's alias pass sends it to the components alias,
 * then its import-resolving pass finds the file the item installs (`@lib/ouro/ax/component.ts`) and writes the lib
 * alias's path to it, without a `.ts`, `.tsx`, `.js` or `.jsx` extension or a trailing `/index`
 * (`~/lib/ouro/ax/component`).
 */
export function installRewrite(componentsJson) {
  const aliases = componentsJson?.aliases ?? {};
  const pairs = [
    ["@/registry/ouro/components/", aliases.components ? `${aliases.components}/` : null],
    ["@/registry/ouro/lib/", aliases.lib ? `${aliases.lib}/` : null],
  ].filter(([, to]) => to);
  const ax = aliases.lib ? (all, head, quote, rest) => `${head}${quote}${aliases.lib}/${`ouro/ax/${rest}`.replace(/\.(?:tsx?|jsx?)$/, "").replace(/\/index$/, "")}${quote}` : null;
  return (bytes) => {
    if (pairs.length === 0) return bytes;
    let text = bytes.toString("utf8");
    if (ax) text = text.replace(AX_SPECIFIER, ax);
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
export function findComponentsJson(consumer, installed) {
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
export function declaredRoots(found, consumer) {
  if (!found) return {};
  // `~/` is the folder the CLI runs in, which holds components.json: a package's own folder in a monorepo.
  const home = { "~": found.dir };
  const tsconfig = consumer.get(`${found.dir}tsconfig.json`);
  let paths = {};
  try {
    paths = tsconfig ? (looseJson(tsconfig.toString("utf8")).compilerOptions?.paths ?? {}) : {};
  } catch {
    return home;
  }
  const resolve = (alias) => {
    for (const [pattern, [target] = []] of Object.entries(paths)) {
      if (!pattern.endsWith("/*") || !target?.endsWith("/*")) continue;
      const prefix = pattern.slice(0, -1);
      if (`${alias}/`.startsWith(prefix)) return posix.normalize(`${found.dir}${target.slice(0, -1)}${`${alias}/`.slice(prefix.length)}`).replace(/^\.\//, "");
    }
    return null;
  };
  const roots = { ...home };
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
export function installedPaths(tarball, installed, declared = {}) {
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
/** Paths in code spans, the last after "and". */
const listAnd = (paths) => (paths.length > 1 ? `${list(paths.slice(0, -1))} and \`${paths.at(-1)}\`` : list(paths));

/** Files that can name another by its path and break without it: code, scripts, workflows, config and stylesheets. */
const NAMING = /\.(?:[cm]?[jt]sx?|json|ya?ml|sh|css|scss|toml|html|vue|svelte|astro)$|(^|\/)(?:Makefile|Dockerfile)$/;

/**
 * Each of `paths` that a file of the repository names, with the `file:line` of each line that does, by its path from the
 * root or from the naming file's folder. What the update itself writes or the record lists (`skip`), lock files, and
 * prose are not read: a changelog that mentions a file does not use it.
 */
function namedAt(consumer, paths, skip) {
  if (paths.length === 0) return [];
  const hits = new Map(paths.map((path) => [path, []]));
  for (const [file, bytes] of consumer) {
    if (skip.has(file) || hits.has(file) || !NAMING.test(file) || /(^|\/)node_modules\/|(^|[-.])lock\.(?:json|ya?ml)$|\.lock$/.test(file) || bytes.includes(0)) continue;
    const lines = bytes.toString("utf8").split("\n");
    for (const path of paths) {
      const forms = [...new Set([path, posix.relative(posix.dirname(file), path)])].map(escapeRe).join("|");
      const re = new RegExp(String.raw`(^|[^\w./-])(?:\.\/)?(?:${forms})(?![\w/-]|\.\w)`);
      lines.forEach((line, index) => {
        if (re.test(line)) hits.get(path).push({ file, line: index + 1 });
      });
    }
  }
  return [...hits]
    .filter(([, at]) => at.length)
    .map(([path, at]) => ({ path, at: at.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1)).map(({ file, line }) => `${file}:${line}`) }));
}

/** A path in a script, where it stands as a word: `src/lib/x.ts`, or `./src/lib/x.ts` after a space or a quote. */
const scriptPath = (path) => new RegExp(String.raw`(^|[\s"'=(])((?:\.\/)?)${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\w-]|\.\w)`, "g");

/** Where a package.json's `#ouro-ax/*` import points, as a folder in the package (`src/lib/ouro/ax/`), or null. */
function axImportOf(text) {
  try {
    const target = JSON.parse(text ?? "null")?.imports?.["#ouro-ax/*"];
    return typeof target === "string" && target.endsWith("/*") ? posix.normalize(target.slice(0, -1)).replace(/^\.\//, "").replace(/\/?$/, "/") : null;
  } catch {
    return null;
  }
}

/** The registry folder of Ouro AX's shared files, which the app's `#ouro-ax/*` import must resolve to. */
const KIT = "@lib/ouro/ax/";

/** Files whose old paths may be named in the app's own scripts and docs, Makefiles and justfiles among them. */
const TEXT = /(?:\.(?:[cm]?[jt]sx?|json|md|mdx|ya?ml|sh|bash|mk|txt|astro|html|toml)|(?:^|\/)(?:Makefile|makefile|GNUmakefile|justfile|Justfile|\.justfile))$/;
/** Folders an install or a build wrote, which hold no reference of the app's own. */
const notRead = /(^|\/)(?:node_modules|\.git|dist|build|out|\.next|\.nuxt|\.output|\.svelte-kit|\.turbo|\.vercel|\.wrangler|\.cache|coverage|storybook-static|vendor)\//;
/** A larger file is generated, not written by hand, and is not read for references. */
const REFERENCE_LIMIT = 512 * 1024;
const isWorkflow = (path) => /^\.github\/workflows\//.test(path);
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Why Ouro Current leaves `.github/workflows/` to the repository, said the same way wherever it comes up. */
export const WORKFLOWS_PERMISSION = "GitHub lets an app change `.github/workflows/` only with the `workflows` permission, which Ouro Current does not ask for";

/**
 * The folders a move empties of Ouro's files: each folder in the app's package whose every installed file moves, each to
 * the same place under one new folder (`lib/ouro/check/` when its files all went to `scripts/ouro/check/`), with that
 * new folder. A file of the app's own left in it keeps its path, since a folder is matched only where its path ends.
 */
function movedFolders(installed, moves, packageDir) {
  const movedTo = new Map(moves.map(({ from, to }) => [from, to]));
  const paths = installed;
  const folders = [];
  const seen = new Set();
  for (const { from } of moves) {
    for (let dir = posix.dirname(from); dir !== "." && `${dir}/`.startsWith(packageDir) && `${dir}/` !== packageDir; dir = posix.dirname(dir)) {
      if (seen.has(dir)) continue;
      seen.add(dir);
      const targets = new Set(paths.filter((path) => path.startsWith(`${dir}/`)).map((path) => {
        const to = movedTo.get(path);
        const rest = path.slice(dir.length);
        return to?.endsWith(rest) ? to.slice(0, to.length - rest.length) : null;
      }));
      const [target] = targets;
      if (targets.size === 1 && target && target !== dir) folders.push({ from: dir, to: target });
    }
  }
  return folders;
}

/** Prose, whose mentions of a moved path are listed for the pull request rather than rewritten. */
const DOCS = /\.(?:md|mdx|txt)$/;
/** Tests, which run the app's tools as its scripts do, wherever they sit. */
const TESTS = /(?:^|\/)(?:tests?|__tests__|e2e)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

/**
 * A moved file's old path, or a folder a move emptied, where the repository's own files name it: from the root
 * (`node lib/ouro/check/x.ts`), from the app's package folder (`src/lib/…` in that package's scripts, or at the root
 * when the root has nothing of its own there), or relative to the file (`../lib/ouro/check/x.ts`). Each is pointed at
 * the new path, in the same form, as a whole path: never a part of a longer one. Scripts and tests are rewritten, and a
 * stylesheet's `@source` lines; the rest of the app's source, Ouro's install folders and what the update writes are read
 * only to learn what still names a moved file. A workflow is not changed (an app may write one only with the
 * `workflows` permission), nor is prose: their lines are returned with the path to write, for the pull request to name.
 */
function rewriteReferences(consumer, moves, { skip, app, ouro, packageDir, installed }) {
  const pairs = [...moves.map(({ from, to }) => ({ from, to, folder: false })), ...movedFolders(installed, moves, packageDir).map(({ from, to }) => ({ from, to, folder: true }))];
  const forms = pairs.flatMap(({ from, to, folder }) => [
    { old: from, now: to, base: "", folder },
    ...(packageDir && from.startsWith(packageDir) && to.startsWith(packageDir) ? [{ old: from.slice(packageDir.length), now: to.slice(packageDir.length), base: packageDir, folder }] : []),
  ]);
  const files = {};
  const fixed = [];
  const stuck = [];
  const docs = [];
  const named = new Set();
  if (forms.length === 0) return { files, fixed, stuck, docs, named };
  const paths = [...consumer.keys()];
  const packages = new Set(paths.filter((path) => posix.basename(path) === "package.json").map((path) => (posix.dirname(path) === "." ? "" : `${posix.dirname(path)}/`)));
  const home = (path) => {
    for (let dir = posix.dirname(path); ; dir = posix.dirname(dir)) {
      if (packages.has(dir === "." ? "" : `${dir}/`) || dir === ".") return dir === "." ? "" : `${dir}/`;
    }
  };
  // The root's own file or folder at a package path means a root file naming that path means the root's.
  const atRoot = (form) => consumer.has(form.old) || (form.folder && paths.some((path) => path.startsWith(`${form.old}/`)));
  const patterns = new Map();
  const patternFor = (scope, dir) => {
    const key = `${scope} ${dir}`;
    if (!patterns.has(key)) {
      const usable = forms.filter((form) => form.base === "" || scope === "package" || (scope === "root" && !atRoot(form)));
      // From a file in a folder, a path may also be written relative to it (`../lib/ouro/check` in `app/styles/`).
      const relative = dir === "." ? [] : forms.filter((form) => form.base === "").flatMap((form) => {
        const rel = posix.relative(dir, form.old);
        const now = posix.relative(dir, form.now);
        return rel.startsWith("../") ? [{ ...form, old: rel, now, relative: true }] : [{ ...form, old: `./${rel}`, now: now.startsWith("../") ? now : `./${now}`, relative: true }];
      });
      const all = [...usable, ...relative].sort((a, b) => b.old.length - a.old.length);
      // A folder is matched only where its path ends, or before `/*`, so a file in it that did not move keeps its path.
      const alternatives = all.map((form) => `${escapeRe(form.old)}${form.folder ? String.raw`(?=$|[\s"'\`)\],;:]|\/(?:\*|$|[\s"'\`]))` : String.raw`(?![\w/-]|\.\w)`}`);
      patterns.set(key, { byOld: new Map(all.map((form) => [form.old, form])), re: new RegExp(String.raw`(^|[\s"'\`=(:,[])((?:\.{1,2}\/)*)(${alternatives.join("|")})`, "gm") });
    }
    return patterns.get(key);
  };
  const rewrite = (path, text) => {
    const at = home(path);
    const dir = posix.dirname(path);
    const { byOld, re } = patternFor(at === packageDir ? "package" : at === "" ? "root" : "other", dir);
    const hits = [];
    const next = text.replace(re, (all, lead, prefix, old) => {
      const form = byOld.get(old);
      let now = `${prefix}${form.now}`;
      if (form.relative) {
        if (prefix) return all;
      } else if (prefix.includes("..")) {
        if (posix.normalize(posix.join(dir, prefix + old)) !== `${form.base}${old}`) return all;
        const rel = posix.relative(dir, `${form.base}${form.now}`);
        now = rel.startsWith(".") ? rel : `./${rel}`;
      }
      const target = form.relative ? posix.normalize(posix.join(dir, old)) : `${form.base}${old}`;
      if (!form.folder) named.add(target);
      hits.push({ from: `${prefix}${old}`, to: now, shown: `${form.relative ? posix.normalize(posix.join(dir, form.now)) : `${form.base}${form.now}`}${form.folder ? "/" : ""}` });
      return `${lead}${now}`;
    });
    return { next, hits };
  };
  // A file is read only when it holds the end of a moved path (`ouro/check`, `check/fades.ts`), however it is written.
  const tails = [...new Set(pairs.map(({ from }) => from.split("/").slice(-2).join("/")))];
  const byLine = (path, text, each) => text.split("\n").map((line, index) => each(line, index + 1)).join("\n");
  const within = (roots, path) => roots.some((root) => path.startsWith(root));
  for (const [path, bytes] of [...consumer].sort(([a], [b]) => a.localeCompare(b))) {
    const css = /\.css$/.test(path);
    if (skip.has(path) || !(TEXT.test(path) || css) || notRead.test(path) || bytes.length > REFERENCE_LIMIT || bytes.includes(0)) continue;
    const text = bytes.toString("utf8");
    if (!tails.some((tail) => text.includes(tail))) continue;
    if (isWorkflow(path) || DOCS.test(path)) {
      const lines = isWorkflow(path) ? stuck : within(ouro, path) ? [] : docs;
      byLine(path, text, (line, number) => {
        for (const hit of rewrite(path, line).hits) lines.push({ path, line: number, ...hit });
        return line;
      });
      continue;
    }
    if (within(ouro, path)) continue;
    let hits = [];
    let next;
    if (css) {
      // A stylesheet names files only in Tailwind's `@source` lines, which say which files its classes come from.
      next = byLine(path, text, (line) => {
        if (!/^\s*@source\b/.test(line)) return line;
        const done = rewrite(path, line);
        hits.push(...done.hits);
        return done.next;
      });
    } else {
      ({ next, hits } = rewrite(path, text));
      if (within(app, path) && !TESTS.test(path)) continue;
    }
    if (hits.length === 0) continue;
    files[path] = Buffer.from(next, "utf8");
    fixed.push({ path, shown: [...new Set(hits.map((hit) => hit.shown))] });
  }
  return { files, fixed, stuck, docs, named };
}

/**
 * A file left at a moved file's old path for one release: run, it runs the new file with the same arguments. It
 * imports nothing of the new file, and is not type-checked, so an old path inside the app's TypeScript project does not
 * pull the Node-only tools back into it.
 */
function forwarder(from, to) {
  let rel = posix.relative(posix.dirname(from), to);
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return `// @ts-nocheck
// Ouro UI moved this file to ${to}. This copy runs it, for one release, so a workflow or script that still names the
// old path keeps working. Point those at the new path, then delete this file.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const target = fileURLToPath(new URL("${rel}", import.meta.url));
  process.exit(spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: "inherit" }).status ?? 1);
}
`;
}

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

/** The app's stylesheet, as components.json names it (`tailwind.css`), from the folder that holds components.json. */
const stylesheetOf = (found) => (typeof found?.json?.tailwind?.css === "string" && found.json.tailwind.css ? posix.normalize(`${found.dir}${found.json.tailwind.css}`).replace(/^\.\//, "") : null);

const registryItem = (tarball, name) => (JSON.parse(tarball.get("registry.json").toString("utf8")).items ?? []).find((item) => item.name === name) ?? null;

/**
 * What `shadcn add <item>#<tag>` would add to the app's stylesheet for each theme item it has (`ouro-base`, and
 * `ouro-theme` when its colours are there): what the item at the new tag adds and the stylesheet lacks. Component
 * files alone leave a release's new theme variables out, and a component that reads one (`rounded-ouro-lg`, #1843)
 * then draws without it. Null when the app has no stylesheet Ouro Current can read; `text` null when nothing is missing.
 */
export function stylesheetUpdate(previous, next, found, read, tag, owned = () => false) {
  const path = stylesheetOf(found);
  const bytes = path && read(path);
  if (!bytes) return null;
  const original = bytes.toString("utf8");
  let text = original;
  const notes = [];
  const files = {};
  const hashes = {};
  for (const name of THEME_ITEMS) {
    const item = registryItem(next, name);
    if (!item) continue;
    if (name === "ouro-base") {
      // A stylesheet that imports ouro-base's file takes it from that file, which updates as an installed file.
      if (baseImport(text)) continue;
      const source = next.get(BASE_SOURCE);
      const at = basePath(path);
      if (source && hasItem(text, item)) {
        if (read(at) && !owned(at)) notes.push(`Leaves \`${path}\` holding ouro-base's rules: \`${at}\`, where its own file goes, is already a file of the app's.`);
        else {
          const was = previous.get(BASE_SOURCE)?.toString("utf8") ?? registryItem(previous, name) ?? item;
          const moved = importBase(text, was);
          if (moved) {
            text = moved.text;
            files[at] = source;
            hashes[at] = sha256(source);
            const named = (entry) => (entry.prop ? `\`${entry.prop}\` in ${entry.where}` : entry.where);
            // Cited, so a repository that lints its pull requests' claims passes the note: the release's file is the
            // source, and the import line this update writes is the check, found in the stylesheet once it merges.
            const release = `https://github.com/ourostack/ouro-ui/blob/${tag}/${BASE_SOURCE}`;
            notes.push(`Moves ouro-base out of \`${path}\` into \`${at}\`, [which \`${path}\` imports before its own rules, and which Ouro Current replaces whole on each release](${release} "verify:fileLine(${path}, /@import .*ouro-base\\.css/)").`);
            if (moved.kept.length) notes.push(`Keeps the app's own values after the import, where they win over ouro-base's: ${moved.kept.map(named).join(", ")}. Delete any that only copied an older ouro-base.`);
            if (moved.restored.length) notes.push(`ouro-base's file brings back what \`${path}\` lacked: ${moved.restored.map(named).join(", ")}.`);
            continue;
          }
        }
      }
    }
    if (!hasItem(text, item)) continue;
    const result = applyItem(text, item, registryItem(previous, name));
    text = result.text;
    for (const { where, names } of result.added) notes.push(names.length ? `Adds ${list(names)} to ${where} in \`${path}\`, which \`${name}\` at \`${tag}\` puts there and the stylesheet lacked, as \`shadcn add\` would.` : `Adds ${where} to \`${path}\`, which \`${name}\` at \`${tag}\` has and the stylesheet lacked, as \`shadcn add\` would.`);
    for (const reason of result.skipped) notes.push(`Leaves ${reason} out of \`${path}\` for \`${name}\`: add it by hand if the app needs it.`);
  }
  return { path, text: text === original ? null : text, notes, files, hashes };
}

/**
 * Whether an install record already on the release left the app's stylesheet behind it: a component of that release
 * reads a theme variable, keyframes or utility the stylesheet lacks, because an earlier update moved the components
 * alone or the stylesheet never had it; the stylesheet still holds ouro-base's rules rather than importing its file; or
 * a stylesheet copied as is is an older release's. Reads components.json, the stylesheet and those copies, not the
 * repository's whole tree.
 */
export async function hxStylesheetBehind(pin, text, release, ctx) {
  const record = JSON.parse(text);
  const configs = new Map();
  for (const path of ctx.consumerPaths()) if (posix.basename(path) === "components.json") configs.set(path, await ctx.consumerFile(path));
  const found = findComponentsJson(configs, Object.keys(record.files ?? {}));
  const path = stylesheetOf(found);
  const tarball = await ctx.tarball("web", release.tag);
  // A stylesheet copied as is (ouro-base's own file, a plain-CSS copy) that is still what was installed but not the
  // release's: written by an older release, or by hand, under a record on this one.
  const base = path && basePath(path);
  for (const [file, hash] of Object.entries(record.files ?? {})) {
    const from = copiedFrom(file, base, tarball, new Map());
    if (!from) continue;
    const now = await ctx.consumerFile(file);
    if (now && sha256(now) === hash && !tarball.get(from).equals(now)) return true;
  }
  if (!path) return false;
  const sheet = await ctx.consumerFile(path);
  return Boolean(stylesheetUpdate(tarball, tarball, found, (file) => (file === path ? sheet : null), release.tag)?.text);
}

/** The plain-CSS copies a page with no Tailwind links, as the site serves them and the repository holds them at a tag. */
const STATIC_CSS = "site/public/css/";

/**
 * Where an installed file copied as is comes from in the tag: ouro-base's source for the file the stylesheet imports,
 * and the plain-CSS copy of the same name for `ouro-base.css`, `ouro-theme.css` or `ouro-plain.css` anywhere else that
 * no registry item installs. Null for every other file.
 */
function copiedFrom(path, base, next, before) {
  if (path === base) return next.has(BASE_SOURCE) ? BASE_SOURCE : null;
  const name = posix.basename(path);
  if (before.has(path) || !/^ouro-(base|theme|plain)\.css$/.test(name)) return null;
  return next.has(`${STATIC_CSS}${name}`) ? `${STATIC_CSS}${name}` : null;
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
  // Ouro AX's shared files sit where the app's `#ouro-ax/*` import points. Without one they stay where the install
  // record has them (a root `lib/ouro/ax/` beside a `src/lib/`), and only an app that has none yet takes its lib folder;
  // the import this adds points there, so the two always agree.
  const pkgPath = found ? `${found.dir}package.json` : null;
  const pkgText = pkgPath ? consumer.get(pkgPath)?.toString("utf8") : undefined;
  const declaredAx = axImportOf(pkgText);
  const recordedAx = Object.entries(Object.groupBy([...before].filter(([, entry]) => entry.target.startsWith(KIT)), ([path, entry]) => path.slice(0, path.length - (entry.target.length - KIT.length)))).sort((a, b) => b[1].length - a[1].length)[0]?.[0];
  const axDir = found && declaredAx ? `${found.dir}${declaredAx}` : recordedAx ?? (nextRoots["@lib"] ? `${nextRoots["@lib"]}ouro/ax/` : null);
  const kitPath = (target) => (axDir && target.startsWith(KIT) ? `${axDir}${target.slice(KIT.length)}` : null);
  const out = {};
  const hashes = {};
  const edited = [];
  const gone = [];
  const dropped = [];
  // A file is deleted only when the release no longer ships it. One this cannot place (an app without components.json,
  // as factory's site/src/ouro/ theme) counts as shipped while the release has a file of its name, unless it is the old
  // path of a file the release renamed (`ax/command.ts`): deleting a shipped file broke factory#1138's build.
  const tail = (path) => path.split("/").slice(-2).join("/");
  const names = new Set([...next.keys()].filter((key) => key.startsWith("registry/")).map((key) => posix.basename(key)));
  const renamedTails = new Set(Object.keys(MOVED_SOURCES).map(tail));
  const shipsName = (path) => names.has(posix.basename(path)) && !renamedTails.has(tail(path));
  const moves = [];
  const blocked = [];
  const items = new Set();
  const sheetPath = stylesheetOf(found);
  const base = sheetPath && basePath(sheetPath);
  for (const path of installed) {
    hashes[path] = record.files[path];
    const now = consumer.get(path);
    const from = copiedFrom(path, base, next, before);
    if (from) {
      // A stylesheet copied as is: ouro-base's own file, which the stylesheet imports, or a plain-CSS copy for a page
      // with no Tailwind. It takes the new tag's file whole when it is still what was installed: its bytes hash to
      // the record's hash, or equal the old tag's file.
      const source = next.get(from);
      if (!now || !(sha256(now) === record.files[path] || previous.get(from)?.equals(now))) {
        edited.push(path);
        continue;
      }
      hashes[path] = sha256(source);
      if (!source.equals(now)) out[path] = source;
      continue;
    }
    const old = before.get(path);
    const wrote = old && rewrite(previous.get(old.path));
    if (now && !old && !after.has(path) && sha256(now) === record.files[path] && !shipsName(path)) {
      // A copy an earlier update kept after the release dropped or renamed its source, before Ouro Current deleted
      // such files (spoonjoy-v2#828): its bytes are still the source the record names, so it is unedited, and it goes.
      delete hashes[path];
      out[path] = null;
      dropped.push(path);
      continue;
    }
    if (!now || !wrote || !wrote.equals(now)) {
      edited.push(path);
      continue;
    }
    const entry = after.get(path);
    const kitTo = entry && kitPath(entry.target);
    if (kitTo && kitTo !== path) {
      // An Ouro AX shared file away from where `#ouro-ax/*` resolves (a root `lib/ouro/ax/` beside a `src/lib/`): it
      // moves there, unless the app already has a file at that path.
      if (consumer.has(kitTo) || kitTo in record.files || kitTo in out) {
        blocked.push({ from: path, to: kitTo });
        items.add(entry.item);
        continue;
      }
      const source = next.get(entry.path);
      delete hashes[path];
      out[path] = null;
      hashes[kitTo] = sha256(source);
      out[kitTo] = rewrite(source);
      items.add(entry.item);
      moves.push({ from: path, to: kitTo, target: entry.target });
      continue;
    }
    if (!entry) {
      // The registry still has the file at this tag, but its target moved (Node-only tools now install under scripts/):
      // the unedited file moves there, unless the app already has a file at the new path.
      // So has a file the release renamed (Ouro AX's `command.ts`, now `ax-command.ts`): it moves to the new name.
      const moved = nextByPath.get(old.path) ?? nextByPath.get(MOVED_SOURCES[old.path]);
      if (!moved && !shipsName(path)) {
        // The release no longer ships the file, under any name: the unedited copy goes, so the vendored folder mirrors
        // the release (ouroboros-website's CI diffs it against the release's, and failed on a copy left behind: #466).
        delete hashes[path];
        out[path] = null;
        dropped.push(path);
        continue;
      }
      const to = kitPath(moved.target) ?? installPath(moved.target, found, nextRoots);
      if (!to || to === path) {
        gone.push(path);
        continue;
      }
      if (consumer.has(to) || to in record.files || to in out) {
        blocked.push({ from: path, to });
        continue;
      }
      const source = next.get(moved.path);
      delete hashes[path];
      out[path] = null;
      hashes[to] = sha256(source);
      out[to] = rewrite(source);
      items.add(moved.item);
      moves.push({ from: path, to, target: moved.target, source: old.path });
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
  for (const [at, entry] of after) {
    const path = kitPath(entry.target) ?? at;
    if (path in hashes || !wanted.has(entry.item) || consumer.has(path)) continue;
    const source = next.get(entry.path);
    out[path] = rewrite(source);
    hashes[path] = sha256(source);
    added.push(path);
  }
  // Ouro AX's shared files are imported as `#ouro-ax/*`, which the app's package.json must map to its lib folder. Only
  // the package beside components.json changes, and a script that ran a moved file is pointed at where it now sits.
  const writesAx = Object.values(out).some((value) => Buffer.isBuffer(value) && value.includes("#ouro-ax/"));
  const lib = nextRoots["@lib"];
  const libIn = found && lib?.startsWith(found.dir) ? lib.slice(found.dir.length) : null;
  const inPackage = (path) => (path.startsWith(found.dir) ? path.slice(found.dir.length) : null);
  const pkg = { imports: false, scripts: false };
  if (pkgText !== undefined && (moves.length > 0 || writesAx)) {
    const scriptMoves = moves.flatMap(({ from, to }) => (inPackage(from) && inPackage(to) ? [{ from: inPackage(from), to: inPackage(to) }] : []));
    const axIn = axDir && inPackage(axDir);
    const edit = editPackage(pkgText, { axImport: writesAx && libIn !== null && axIn !== null ? `./${axIn}*` : null, moves: scriptMoves });
    if (edit.text !== pkgText) out[pkgPath] = Buffer.from(edit.text, "utf8");
    pkg.imports = edit.imports;
    pkg.scripts = edit.scripts;
  }
  // The app's own scripts and docs that name a moved file's old path are pointed at the new one; a workflow cannot be,
  // so its lines are named. A moved file that is run, or still named somewhere, keeps a forwarding file at its old path.
  const skip = new Set([...installed, ...Object.keys(out), pin.file, ...(pkgPath ? [pkgPath] : [])]);
  // The app's source folders (the top folder of each alias it resolves, `src/` or `app/`) and Ouro's install folders
  // (the `ouro/` folder each installed or moved file sits in) are the app's code and Ouro's, not its scripts.
  const appFolders = [...Object.entries(rootsOf(presentTargets(previous), installed, declared)), ...Object.entries(nextRoots)].flatMap(([alias, root]) => {
    const rest = alias !== "~" && found && root.startsWith(found.dir) ? root.slice(found.dir.length) : "";
    return rest ? [`${found.dir}${rest.split("/")[0]}/`] : [];
  });
  const ouroFolders = [...installed, ...moves.map(({ to }) => to)].flatMap((path) => {
    const at = `/${path}`.indexOf("/ouro/");
    return at >= 0 ? [path.slice(0, at + "ouro/".length)] : [];
  });
  const refs = rewriteReferences(consumer, moves, { skip, app: [...new Set(appFolders)], ouro: [...new Set(ouroFolders)], packageDir: found?.dir ?? "", installed });
  Object.assign(out, refs.files);
  // A file the release no longer ships that the repository's code, scripts, workflows or config still name stays, with
  // each line that names it listed: deleting it would break them, as a build that copies it by path (factory's site).
  const stillNamed = namedAt(consumer, dropped, skip);
  for (const { path } of stillNamed) {
    delete out[path];
    hashes[path] = record.files[path];
    dropped.splice(dropped.indexOf(path), 1);
  }
  // An import of a renamed AX file by its `#ouro-ax/` name follows it too; a relative one is a path, which the above followed.
  const renamed = moves.filter((move) => MOVED_SOURCES[move.source]);
  if (renamed.length) {
    const current = new Map([...consumer].map(([path, bytes]) => [path, Buffer.isBuffer(out[path]) ? out[path] : bytes]));
    Object.assign(out, followMovedImports(current, renamed, new Set([...skip, ...renamed.map((move) => move.to)]), { relative: false }));
  }
  const forwarded = [];
  for (const { from, to, source } of moves) {
    // A renamed file leaves nothing at its old name, which shared a name with another of Ouro's files (#2757).
    if (MOVED_SOURCES[source] || !/\.[cm]?[jt]s$/.test(from) || !Buffer.isBuffer(out[to])) continue;
    if (!refs.named.has(from) && !out[to].includes("process.argv[1]")) continue;
    out[from] = Buffer.from(forwarder(from, to), "utf8");
    forwarded.push({ from, to });
  }
  // What the theme items add to the app's stylesheet (#1843's `--radius-ouro-*`), as `shadcn add` writes it there.
  // A file at ouro-base's own path that the record holds is Ouro's own, and is written again.
  const sheet = stylesheetUpdate(previous, next, found, (path) => (typeof out[path] === "string" || Buffer.isBuffer(out[path]) ? asBytes(out[path]) : consumer.get(path)), release.tag, (path) => path in record.files);
  if (sheet?.text) out[sheet.path] = Buffer.from(sheet.text, "utf8");
  for (const [path, bytes] of Object.entries(sheet?.files ?? {})) out[path] = bytes;
  Object.assign(hashes, sheet?.hashes ?? {});
  const sorted = Object.fromEntries(Object.keys(hashes).sort().map((path) => [path, hashes[path]]));
  out[pin.file] = `${JSON.stringify({ ...record, tag: release.tag, tagCommit: release.sha, files: sorted }, null, 2)}\n`;
  const notes = [];
  // No counts or bare versions: a repository that runs Ouro UI's claims check on pull requests reads them as claims.
  const one = (paths, single, several) => (paths.length === 1 ? single : several);
  for (const { from, to, target, source } of moves) notes.push(MOVED_SOURCES[source] ? `Renames \`${from}\` to \`${to}\`, as the release renamed it.` : target.startsWith("~/") ? `Moves \`${from}\` to \`${to}\`, outside the app's TypeScript project.` : target.startsWith(KIT) ? `Moves \`${from}\` to \`${to}\`, where \`#ouro-ax/*\` resolves.` : `Moves \`${from}\` to \`${to}\`.`);
  if (pkg.imports) notes.push(`Adds \`#ouro-ax/*\` to \`imports\` in \`${pkgPath}\`, which the moved files resolve the shared Ouro AX files through.`);
  if (pkg.scripts) notes.push(`Points the \`scripts\` in \`${pkgPath}\` at the moved files.`);
  for (const { path, shown } of refs.fixed) notes.push(`Points \`${path}\` at ${listAnd(shown)}, where ${one(shown, "it", "they")} moved.`);
  for (const { path, line, from, to } of refs.stuck) notes.push(`To do: \`${path}:${line}\` names \`${from}\`; change it to \`${to}\`, where it moved.`);
  if (refs.stuck.length) notes.push(`Ouro Current leaves those workflow lines to you: ${WORKFLOWS_PERMISSION}.`);
  for (const { path, line, from, to } of refs.docs) notes.push(`Check \`${path}:${line}\`: it names \`${from}\`, which moved to \`${to}\`. Ouro Current leaves prose to you.`);
  for (const { from, to } of forwarded) notes.push(`Leaves a forwarding file at \`${from}\` that runs \`${to}\`, so what still names the old path keeps working for one release. Delete it once the old path is gone from your workflows and scripts.`);
  if (added.length) notes.push(`Adds what installed items now include: ${list(added)}.`);
  if (sheet) notes.push(...sheet.notes);
  if (edited.length) notes.push(`Leaves ${list(edited)} at \`${record.tag}\`, because ${one(edited, "it is", "they are")} not what the CLI wrote for \`${record.tag}\` (edited here, or rewritten in a way Ouro Current does not reproduce). Install ${one(edited, "it", "them")} again with the CLI, or move the change into Ouro UI.`);
  const kitApart = edited.filter((path) => before.get(path)?.target.startsWith(KIT) && axDir && !path.startsWith(axDir));
  if (kitApart.length) notes.push(`${list(kitApart)} ${one(kitApart, "stays", "stay")} where ${one(kitApart, "it is", "they are")} because ${one(kitApart, "it was", "they were")} edited here, but \`#ouro-ax/*\` resolves to \`${axDir}\`: move ${one(kitApart, "it", "them")} there, or point the import at ${one(kitApart, "it", "them")}.`);
  for (const { from, to } of blocked) notes.push(`Leaves \`${from}\` where it is, because \`${to}\` already exists in the app and is not replaced.`);
  if (gone.length) notes.push(`Keeps what the registry no longer has: ${list(gone)}.`);
  if (dropped.length) notes.push(`Deletes what the release no longer ships: ${list(dropped)}.`);
  for (const { path, at } of stillNamed) notes.push(`Keeps \`${path}\`, which the release no longer ships, because ${listAnd(at)} still ${one(at, "names", "name")} it. Change ${one(at, "that line", "those lines")}, and the next update deletes it.`);
  // The rules this release adds, whether or not the app vendors Ouro check: a live-checked app gates on them (live.mjs).
  const brought = newCheckRules(previous, next, record.tag, release);
  // A repository that vendors Ouro check lists them in its pull request, and is told when it cannot read them.
  const vendored = installed.some((path) => CHECK_INSTALLED.test(path));
  if (vendored) notes.push(...brought.notes);
  return { files: out, notes, checkRules: vendored ? brought.rules : [], newRules: brought };
}

/** Where the ouro-check item's files sit in an app: `scripts/ouro/check/` now, `lib/ouro/check/` before it moved. */
const CHECK_INSTALLED = /(^|\/)(scripts|lib)\/ouro\/check\//;
/** The rules a release of Ouro check adds, by name, each with a summary. */
const NEW_RULES = "registry/ouro/check/new-rules.json";

function readNewRules(tarball) {
  const bytes = tarball.get(NEW_RULES);
  if (!bytes) return [];
  let rules;
  try {
    rules = JSON.parse(bytes.toString("utf8"));
  } catch {
    // The parser's own message names positions, which a repository's claims lint reads as numbers to cite.
    throw new Error("it is not JSON");
  }
  const text = (value) => value === undefined || typeof value === "string";
  const valid = (rule) => rule && typeof rule.rule === "string" && text(rule.summary) && text(rule.widened);
  if (!Array.isArray(rules) || !rules.every(valid)) throw new Error("it is not a list of { rule, summary, widened }");
  return rules;
}

/**
 * The Ouro check rules new to an app between two releases: in the new tag's `new-rules.json` and not in the old's, by
 * name, each with its summary and the release's file to cite it to, since a repository may lint the body for claims.
 * An entry with `widened` names an existing rule whose reach the release widened (`"widened": "negative lengths"`), which
 * finds what the app wrote before as a new rule would; it is new to the app by its rule and `widened` together.
 * The update pull request lists them with the findings it records as known for each (known.mjs).
 */
export function newCheckRules(previous, next, from, release) {
  let before;
  let after;
  try {
    before = readNewRules(previous);
  } catch (error) {
    return { rules: [], notes: [`Leaves the new Ouro check rules out of this list: \`${NEW_RULES}\` at \`${from}\` could not be read (${error.message}). The release notes name them.`] };
  }
  try {
    after = readNewRules(next);
  } catch (error) {
    return { rules: [], notes: [`Leaves the new Ouro check rules out of this list: \`${NEW_RULES}\` at \`${release.tag}\` could not be read (${error.message}). The release notes name them.`] };
  }
  const entry = (rule) => `${rule.rule}\n${rule.widened ?? ""}`;
  const listed = new Set(before.map(entry));
  const source = `https://github.com/${release.repo ?? REPOS.web}/blob/${release.tag}/${NEW_RULES}`;
  const brought = after.filter((rule) => !listed.has(entry(rule)));
  return { rules: brought.map((rule) => ({ rule: rule.rule, summary: rule.summary, ...(rule.widened ? { widened: rule.widened } : {}), source })), notes: [] };
}

/** The release asset that holds ouro-ui-core's built `dist/`, which the repository does not commit. */
export const coreDistAsset = (tag) => `ouro-ui-core-${tag}-dist.zip`;
/** Where a core `dist/` path sits in that asset: its paths are relative to `dist/`, and `dist-manifest.json` is at its root. */
const inDistAsset = (path) => path.replace(/^dist\//, "");
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
export function editLock(text, sourceId, commit, shas, release = {}, added = []) {
  const edited = editLockValues(text, sourceId, commit, shas, release);
  if (edited === null || added.length === 0) return edited;
  // A new file goes in as a line like its neighbour's, in the order of source paths; a lock that does not keep one
  // file to a line is written whole instead (null).
  let out = edited;
  for (const file of added) {
    const id = new RegExp(String.raw`"id"\s*:\s*"${sourceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).exec(out);
    const nextId = /"id"\s*:\s*"/g;
    nextId.lastIndex = id.index + id[0].length;
    const end = nextId.exec(out)?.index ?? out.length;
    const lines = [...out.slice(id.index, end).matchAll(/^([ \t]*)(\{[^\n]*"sourcePath"\s*:\s*"([^"]*)"[^\n]*\})(,?)[ \t]*$/gm)].map((match) => ({ start: id.index + match.index, end: id.index + match.index + match[0].length, indent: match[1], body: match[2], sourcePath: JSON.parse(`"${match[3]}"`), comma: match[4] === "," }));
    if (lines.length === 0) return null;
    const line = (template) => {
      // A neighbour with keys of its own (`upstreamPath`) is no template for a new file.
      const keys = [...template.matchAll(/"([^"]+)"\s*:/g)].map((match) => match[1]);
      if (keys.some((key) => !["sourcePath", "generatedPath", "sha256"].includes(key))) return null;
      let body = template;
      for (const [key, value] of Object.entries({ sourcePath: file.sourcePath, generatedPath: file.generatedPath, sha256: file.sha256 })) {
        const re = new RegExp(String.raw`("${key}"\s*:\s*")[^"]*(")`);
        if (!re.test(body)) return null;
        body = body.replace(re, `$1${value}$2`);
      }
      return body;
    };
    const at = insertAt(lines, file.sourcePath);
    if (at === lines.length) {
      const last = lines.at(-1);
      const body = line(last.body);
      if (!body) return null;
      out = `${out.slice(0, last.end)}${last.comma ? "" : ","}\n${last.indent}${body}${last.comma ? "," : ""}${out.slice(last.end)}`;
    } else {
      const before = lines[at];
      const body = line(before.body);
      if (!body) return null;
      out = `${out.slice(0, before.start)}${before.indent}${body},\n${out.slice(before.start)}`;
    }
  }
  return out;
}

function editLockValues(text, sourceId, commit, shas, release = {}) {
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
 * Registry files a release renamed, by their old path: a vendored copy follows its source to the new path, under the new
 * name beside the old copy, which goes, and the consumer's own imports of the old copy follow it (#2757, #2777).
 */
export const MOVED_SOURCES = {
  "registry/ouro/ax/command.ts": "registry/ouro/ax/ax-command.ts",
  "registry/ouro/ax/command.test.mts": "registry/ouro/ax/ax-command.test.mts",
  "registry/ouro/ax/claims.ts": "registry/ouro/ax/ax-claims.ts",
  "registry/ouro/ax/claims.test.mts": "registry/ouro/ax/ax-claims.test.mts",
  "registry/ouro/check/register.ts": "registry/ouro/check/check-register.ts",
  "registry/ouro/ax/fixtures/images.mts": "registry/ouro/ax/fixtures/images-cli.mts",
};

const IMPORT_SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"'\n]+)\2/g;

/**
 * The consumer's own files that import a vendored copy a release renamed, by a relative path or as `#ouro-ax/<name>`,
 * rewritten to the new name. The vendored files themselves come from the release, which already imports the new names.
 */
function followMovedImports(consumer, moves, vendored, { relative = true } = {}) {
  const out = {};
  // `#ouro-ax/<name>` reaches a file at the top of the AX kit's folder, whatever the repository vendors it as.
  const axNames = new Map(moves.filter((move) => /^registry\/ouro\/ax\/[^/]+$/.test(move.source)).map((move) => [posix.basename(move.source), posix.basename(MOVED_SOURCES[move.source])]));
  const byPath = new Map(moves.map((move) => [move.from, move.to]));
  const target = (path) => byPath.get(path) ?? byPath.get(`${path}.ts`) ?? byPath.get(`${path}.mts`);
  for (const [path, bytes] of consumer) {
    if (vendored.has(path) || byPath.has(path) || !/\.[cm]?[jt]sx?$/.test(path)) continue;
    const text = bytes.toString("utf8");
    if (!text.includes("import")) continue;
    const next = text.replace(IMPORT_SPECIFIER, (whole, lead, quote, spec) => {
      if (spec.startsWith("#ouro-ax/")) {
        const name = axNames.get(spec.slice("#ouro-ax/".length));
        return name ? `${lead}${quote}#ouro-ax/${name}${quote}` : whole;
      }
      if (!relative || !spec.startsWith(".")) return whole;
      const to = target(posix.normalize(posix.join(posix.dirname(path), spec)));
      if (!to) return whole;
      // The specifier keeps its own folder and its way of writing the extension; only the file's name changes.
      const name = posix.extname(spec) === "" ? posix.basename(to, posix.extname(to)) : posix.basename(to);
      return `${lead}${quote}${spec.slice(0, spec.lastIndexOf("/") + 1)}${name}${quote}`;
    });
    if (next !== text) out[path] = Buffer.from(next, "utf8");
  }
  return out;
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
  const moves = [];
  for (const file of source.files) {
    let bytes = read(file.sourcePath);
    const moved = MOVED_SOURCES[file.sourcePath];
    if (!bytes && moved && read(moved)) {
      // The release renamed the source: the copy takes the new name beside the old one, which goes.
      const from = file.generatedPath;
      const source = file.sourcePath;
      file.sourcePath = moved;
      file.generatedPath = posix.join(posix.dirname(from), posix.basename(moved));
      files[from] = null;
      moves.push({ from, to: file.generatedPath, source });
      bytes = read(moved);
    }
    if (!bytes) {
      missing.push(file.sourcePath);
      continue;
    }
    file.sha256 = sha256(bytes);
    shas[file.sourcePath] = file.sha256;
    files[file.generatedPath] = bytes;
  }
  if (missing.length) throw new Error(`${pin.file}: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not in ${REPOS[pin.follows]} ${release.tag}${asset ? ` (${asset})` : ""}`);
  // A vendored Ouro check reads the rules this release adds or widens from new-rules.json, as an install record does:
  // the old side is the commit the lock had.
  const checking = !asset && source.files.some((file) => CHECK_SOURCE.test(file.sourcePath));
  const brought = checking ? newCheckRules(await ctx.tarball(pin.follows, pin.commit), await ctx.tarball(pin.follows, release.tag), pin.current, release) : { rules: [], notes: [] };
  // A vendored file that now imports a file beside it (`xray.ts` importing `./xray.kit.mts`) needs that file too: it is
  // vendored beside it, and so is what it imports in turn.
  const added = asset ? [] : followImports(source.files, files, read);
  const axFix = asset || !ctx.consumerFile ? { files: {}, notes: [] } : await axImportFix(async (path) => (await ctx.consumerFile(path)) ?? undefined, source.files, files);
  Object.assign(files, axFix.files);
  const followed = moves.length && ctx.consumerFiles ? followMovedImports(await ctx.consumerFiles(), moves, new Set(source.files.map((file) => file.generatedPath))) : {};
  Object.assign(files, followed);
  // Only this source's values change; the edit is kept when it reads back as the lock this run means to write.
  const edited = editLock(text, pin.source, release.sha, shas, named, added);
  const same = (value) => {
    try {
      return JSON.stringify(JSON.parse(value)) === JSON.stringify(lock);
    } catch {
      return false;
    }
  };
  files[pin.file] = edited !== null && same(edited) ? edited : `${JSON.stringify(lock, null, 2)}\n`;
  const notes = [];
  if (moves.length) notes.push(`Follows the files ${REPOS[pin.follows]} renamed: ${moves.map((move) => `\`${move.from}\` is now \`${move.to}\``).join(", ")}${Object.keys(followed).length ? `, and so do the imports in ${list(Object.keys(followed))}` : ""}.`);
  if (added.length) notes.push(`Vendors what the updated files now import: ${list(added.map((file) => file.generatedPath))}.`);
  notes.push(...axFix.notes);
  // The entry added above resolves the vendored files' `#ouro-ax/*`; otherwise the pull request says what is missing.
  if (Object.keys(axFix.files).length === 0) notes.push(...(await unresolvedAxImports(source.files, files, ctx)));
  notes.push(...brought.notes);
  return { files, notes, checkRules: brought.rules, newRules: brought };
}

/** A source file of Ouro check, which a lock that vendors it follows the release's new-rules.json for. */
const CHECK_SOURCE = /^registry\/ouro\/check\/[^/]+\.ts$/;

/**
 * Vendored files that import the shared Ouro AX files as `#ouro-ax/*` resolve them through the `imports` of the nearest
 * package.json above them, as an app's do. Where none maps it, the pull request says so and gives the entry, without
 * guessing which package.json should hold it.
 */
async function unresolvedAxImports(entries, files, ctx) {
  const importing = entries.filter((entry) => /\.[cm]?[jt]sx?$/.test(entry.generatedPath) && /["']#ouro-ax\//.test(files[entry.generatedPath]?.toString("utf8") ?? ""));
  if (importing.length === 0 || !ctx.consumerFile) return [];
  const scopes = new Map();
  const unresolved = [];
  for (const entry of importing) {
    let found = null;
    for (let dir = posix.dirname(entry.generatedPath); ; dir = posix.dirname(dir)) {
      const path = dir === "." ? "package.json" : `${dir}/package.json`;
      if (!scopes.has(path)) scopes.set(path, await ctx.consumerFile(path));
      if (scopes.get(path)) {
        found = scopes.get(path);
        break;
      }
      if (dir === ".") break;
    }
    if (!axImportOf(found?.toString("utf8"))) unresolved.push(entry.generatedPath);
  }
  if (unresolved.length === 0) return [];
  const one = (single, several) => (unresolved.length === 1 ? single : several);
  const kit = entries.find((entry) => entry.sourcePath.startsWith("registry/ouro/ax/") && entry.generatedPath.endsWith(entry.sourcePath.slice("registry/ouro/ax/".length)));
  const folder = kit ? kit.generatedPath.slice(0, kit.generatedPath.length - (kit.sourcePath.length - "registry/ouro/ax/".length)) : null;
  const where = folder ? ` that points at \`${folder}\`` : "";
  return [`${list(unresolved)} ${one("imports", "import")} the shared Ouro AX files as \`#ouro-ax/*\`, which needs an \`imports\` entry in a package.json above ${one("it", "them")}. Add one${where} to the package.json that should hold it; the vendored folder may take one of its own.`];
}

/** The relative and `#ouro-ax/` imports a module names: `from "./x.ts"`, `import "#ouro-ax/x.ts"`, `import("./x.ts")`. */
const relativeImports = (text) => [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']((?:\.{1,2}\/|#ouro-ax\/)[^"']+)["']/g)].map((match) => match[1]);

/** Ouro AX's package import, and the registry folder it names. */
const AX_IMPORT = "#ouro-ax/";
const AX_SOURCE = "registry/ouro/ax/";

/** Where a lock source vendors Ouro AX's shared files (`lib/ouro-ui/registry/ouro/ax/`), or null. */
const axFolderOf = (entries) => {
  const one = entries.find((entry) => entry.sourcePath.startsWith(AX_SOURCE) && !entry.sourcePath.slice(AX_SOURCE.length).includes("/"));
  return one ? `${posix.dirname(one.generatedPath)}/` : null;
};

/**
 * The package.json a vendored Ouro AX file resolves `#ouro-ax/*` through: the nearest one at or above the vendored
 * folder. It gets the entry, pointed at that folder, when it has none; one that points elsewhere is named, not changed;
 * with none, the folder gets its own.
 */
async function axImportFix(readFile, entries, files) {
  const ax = axFolderOf(entries);
  if (!ax || !Object.values(files).some((bytes) => Buffer.isBuffer(bytes) && bytes.includes(AX_IMPORT))) return { files: {}, notes: [] };
  let dir = ax.slice(0, -1);
  for (;;) {
    const path = dir === "." ? "package.json" : `${dir}/package.json`;
    const text = (await readFile(path))?.toString("utf8");
    if (text !== undefined) {
      const base = dir === "." ? "" : `${dir}/`;
      const want = `./${ax.slice(base.length)}*`;
      const declared = axImportOf(text);
      if (declared === null) {
        const edit = editPackage(text, { axImport: want, moves: [] });
        return { files: { [path]: Buffer.from(edit.text, "utf8") }, notes: [`Adds \`#ouro-ax/*\` to \`imports\` in \`${path}\`, pointed at \`${ax}\`, which the vendored Ouro AX files now import one another through.`] };
      }
      if (`${base}${declared}` !== ax) return { files: {}, notes: [`\`${path}\` points \`#ouro-ax/*\` at \`${base}${declared}\`, but the Ouro AX files are vendored in \`${ax}\`: point it at \`${want}\`.`] };
      return { files: {}, notes: [] };
    }
    if (dir === "." || dir === "") break;
    dir = posix.dirname(dir);
  }
  // No package.json scopes the vendored folder (a Go repository, say): the folder takes one of its own, which scopes
  // only the vendored files. They are ES modules.
  const path = `${ax}package.json`;
  const text = `${JSON.stringify({ private: true, type: "module", imports: { [`${AX_IMPORT}*`]: "./*" } }, null, 2)}\n`;
  return { files: { [path]: Buffer.from(text, "utf8") }, notes: [`Adds \`${path}\`, so that \`#ouro-ax/*\`, which the vendored Ouro AX files now import one another through, resolves to the vendored folder.`] };
}

/** The file before which a new lock entry goes: the entries are kept in the order of their source paths. */
const insertAt = (entries, sourcePath) => {
  const after = entries.findIndex((entry) => entry.sourcePath > sourcePath);
  return after === -1 ? entries.length : after;
};

/**
 * Adds to a lock source each file a vendored module imports by a relative path that the source does not list yet,
 * from the same commit, at the same place relative to its importer. Returns the entries added, in the lock's order.
 */
function followImports(entries, files, read) {
  const listed = new Set(entries.map((entry) => entry.sourcePath));
  const queue = [...entries];
  const added = [];
  while (queue.length) {
    const entry = queue.shift();
    const bytes = files[entry.generatedPath];
    if (!bytes || !/\.[cm]?[jt]sx?$/.test(entry.sourcePath)) continue;
    for (const spec of relativeImports(bytes.toString("utf8"))) {
      // `#ouro-ax/x.ts` is Ouro AX's own `registry/ouro/ax/x.ts`, vendored beside the source's other Ouro AX files.
      const ax = spec.startsWith(AX_IMPORT) ? axFolderOf(entries) : null;
      if (spec.startsWith(AX_IMPORT) && !ax) continue;
      const sourcePath = ax ? `${AX_SOURCE}${spec.slice(AX_IMPORT.length)}` : posix.normalize(posix.join(posix.dirname(entry.sourcePath), spec));
      if (listed.has(sourcePath)) continue;
      const found = read(sourcePath);
      if (!found) continue;
      listed.add(sourcePath);
      const generatedPath = ax ? `${ax}${spec.slice(AX_IMPORT.length)}` : posix.normalize(posix.join(posix.dirname(entry.generatedPath), spec));
      const next = { sourcePath, generatedPath, sha256: sha256(found) };
      entries.splice(insertAt(entries, sourcePath), 0, next);
      files[generatedPath] = found;
      added.push(next);
      queue.push(next);
    }
  }
  return added;
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
  return { files, notes: [] };
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
  nuget: updateNuget,
  gradle: updateGradle,
};

/** The text of a file to write: a Buffer stays bytes, anything else is text. */
export const asBytes = (value) => (Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8"));
