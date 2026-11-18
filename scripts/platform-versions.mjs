// The Platforms pages (docs/platforms/README.md, apple.md, windows.md and android.md) state three versions: the core release their parity
// tables are built from and web's release that core's parity check compares against, both from the copies in
// scripts/parity-data (parity.json's webTag, provenance.json's coreTag and coreCommit), and the release of each native kit
// (ouro-ui-apple, ouro-ui-windows and ouro-ui-android) the pages document, pinned in scripts/parity-data/versions.json. The pinned kit releases
// are held to GitHub by --live (the scheduled Apple check runs it). Core's newest release is not checked against anything,
// because the Pages build writes it (--write) before the site builds, so it cannot go stale on main.
//
//   node scripts/platform-versions.mjs                   fail when a page differs from what the committed data renders (offline)
//   node scripts/platform-versions.mjs --render          rewrite the pages from the committed data (offline)
//   node scripts/platform-versions.mjs --live            also fail when a pinned kit release differs from GitHub (network)
//   node scripts/platform-versions.mjs --write           read core's newest release, then rewrite its copies and the pages (network; the Pages build runs it)
//   node scripts/platform-versions.mjs --apple <tag>     pin ouro-ui-apple's release <tag>, then rewrite versions.json and the pages (network)
//   node scripts/platform-versions.mjs --windows <tag>   pin ouro-ui-windows's release <tag>, then rewrite versions.json and the pages (network)
//   node scripts/platform-versions.mjs --android <tag>   pin ouro-ui-android's release <tag>, then rewrite versions.json and the pages (network)
//
//   Exits 1 on drift (and writes behind=true to GITHUB_OUTPUT), 2 when GitHub cannot be read, which is no drift. --write
//   reports a 2 as a warning and writes nothing, so the build keeps the copies main has.
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL_CACHE = "scripts/claims-urls.json";

/** An address's HTTP status, as the claims check reads it: HEAD, then GET, three tries; 0 when nothing answers. */
async function urlStatus(url) {
  let last = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      for (const method of ["HEAD", "GET"]) {
        const response = await globalThis.fetch(url, { method, redirect: "follow", signal: globalThis.AbortSignal.timeout(15000), headers: { "user-agent": "ouro-ui claims check" } });
        last = response.status;
        if (response.ok) return last;
      }
    } catch {
      last = 0;
    }
    await delay(1000 * (attempt + 1));
  }
  return last;
}
const CORE = "ourostack/ouro-ui-core";
const APPLE = "ourostack/ouro-ui-apple";
const WINDOWS = "ourostack/ouro-ui-windows";
const ANDROID = "ourostack/ouro-ui-android";
const WEB = "ourostack/ouro-ui";
const VERSIONS = "scripts/parity-data/versions.json";
const PARITY = "scripts/parity-data/parity.json";
const PROVENANCE = "scripts/parity-data/provenance.json";
const PLATFORMS = "docs/platforms/README.md";
const APPLE_PAGE = "docs/platforms/apple.md";
const WINDOWS_PAGE = "docs/platforms/windows.md";
const ANDROID_PAGE = "docs/platforms/android.md";
/** Where ouro-ui-apple's CI checks the provenance hashes: a pinned permalink, since the check is unchanged. */
const APPLE_CI = "https://github.com/ourostack/ouro-ui-apple/blob/9931f6d284f44014648482bde69b114e48b7b7de/.github/workflows/ci.yml#L74-L96";
const FIX = "Run node scripts/platform-versions.mjs --render and commit what it changes.";
/** The native kits versions.json pins, by the flag that pins each. */
const KITS = { apple: APPLE, windows: WINDOWS, android: ANDROID };
const pinFix = (kit, tag) => `Run node scripts/platform-versions.mjs --${kit} ${tag} and commit what it changes.`;
const TAG = /^v\d+\.\d+\.\d+$/;

const tagUrl = (repo, tag) => `https://github.com/${repo}/releases/tag/${tag}`;
const blobUrl = (repo, commit, path) => `https://github.com/${repo}/blob/${commit}/${path}`;
const urlOk = (url) => `verify:urlOk(${url})`;
const equals = (file, field, value) => `verify:equals(${file}#${field})=${value}`;
/** Where ouro-ui-windows's `generated` job checks the vendored core files' hashes, at the commit its release names. */
const windowsCi = (commit) => blobUrl(WINDOWS, commit, ".github/workflows/ci.yml#L37-L48");
/** Where ouro-ui-android's `generated` job checks the vendored core files' hashes, at the commit its release names. */
const androidCi = (commit) => blobUrl(ANDROID, commit, ".github/workflows/ci.yml#L37-L48");

/** The core a kit's release meets, in words: one tag, or the tag for its tokens and claims and another for its A2UI cases. */
function kitCore({ coreTag, treeCoreTag }) {
  return treeCoreTag && treeCoreTag !== coreTag ? `core ${coreTag}, and ${treeCoreTag} for its A2UI conformance cases` : `core ${coreTag}`;
}

const GENERATED_NOTES = /^\[\^(web-release|web-core|apple-release|apple-core|windows-release|windows-core|android-release|android-core|core-latest|core-v\d+\.\d+\.\d+)\]: .*\n?/gm;

/** docs/platforms/README.md with its version table, the newest-core line and their footnotes rendered from `facts`. */
export function renderPlatforms(page, { core, web, apple, windows, android }) {
  const table = [
    "| Ouro HX & AX | Release checked | The core it meets | How we know |",
    "| --- | --- | --- | --- |",
    `| For web | [${web.tag}](${tagUrl(WEB, web.tag)})[^web-release] | core ${core.tag}, for its tokens[^web-core] | Core's parity check compares its web stylesheets with web's, byte for byte.[^web-core] |`,
    `| For Apple | [${apple.tag}](${tagUrl(APPLE, apple.tag)})[^apple-release] | ${kitCore(apple)}[^apple-core] | The release's \`core-provenance.json\` names the tag and each file's SHA-256, and CI checks the hashes.[^apple-core] |`,
    `| For Android | [${android.tag}](${tagUrl(ANDROID, android.tag)})[^android-release] | ${kitCore(android)}[^android-core] | The release's \`core-provenance.json\` names the tag and each file's SHA-256, and CI checks the hashes.[^android-core] |`,
    `| For Windows | [${windows.tag}](${tagUrl(WINDOWS, windows.tag)})[^windows-release] | ${kitCore(windows)}[^windows-core] | The release's \`core-provenance.json\` names the tag and each file's SHA-256, and CI checks the hashes.[^windows-core] |`,
  ].join("\n");
  const newest = `Core's newest release is ${core.tag}.[^core-latest] Web's row names the web release that core's parity check compares against, which can be older than web's [latest release](https://github.com/ourostack/ouro-ui/releases/latest).`;
  const parity = blobUrl(CORE, core.commit, "parity.json");
  const provenance = blobUrl(APPLE, apple.commit, "core-provenance.json");
  const windowsProvenance = blobUrl(WINDOWS, windows.commit, "core-provenance.json");
  const androidProvenance = blobUrl(ANDROID, android.commit, "core-provenance.json");
  const notes = [
    `[^web-release]: ${tagUrl(WEB, web.tag)} ${urlOk(tagUrl(WEB, web.tag))} ${equals(PARITY, "webTag", web.tag)}`,
    `[^web-core]: ${parity}; ${tagUrl(CORE, core.tag)} ${urlOk(parity)} ${urlOk(tagUrl(CORE, core.tag))} ${equals(PARITY, "webTag", web.tag)} ${equals(PROVENANCE, "coreTag", core.tag)}`,
    `[^apple-release]: ${tagUrl(APPLE, apple.tag)} ${urlOk(tagUrl(APPLE, apple.tag))} ${equals(VERSIONS, "apple.tag", apple.tag)}`,
    `[^apple-core]: ${provenance}; ${APPLE_CI} ${urlOk(provenance)} ${urlOk(APPLE_CI)} ${equals(VERSIONS, "apple.coreTag", apple.coreTag)}`,
    `[^windows-release]: ${tagUrl(WINDOWS, windows.tag)} ${urlOk(tagUrl(WINDOWS, windows.tag))} ${equals(VERSIONS, "windows.tag", windows.tag)}`,
    `[^windows-core]: ${windowsProvenance}; ${windowsCi(windows.commit)} ${urlOk(windowsProvenance)} ${urlOk(windowsCi(windows.commit))} ${equals(VERSIONS, "windows.coreTag", windows.coreTag)}`,
    `[^android-release]: ${tagUrl(ANDROID, android.tag)} ${urlOk(tagUrl(ANDROID, android.tag))} ${equals(VERSIONS, "android.tag", android.tag)}`,
    `[^android-core]: ${androidProvenance}; ${androidCi(android.commit)} ${urlOk(androidProvenance)} ${urlOk(androidCi(android.commit))} ${equals(VERSIONS, "android.coreTag", android.coreTag)}`,
    `[^core-latest]: ${tagUrl(CORE, core.tag)} ${urlOk(tagUrl(CORE, core.tag))} ${equals(PROVENANCE, "coreTag", core.tag)}`,
  ].join("\n");
  const body = page
    .replace(/^\| Ouro HX & AX \| Release checked \|[\s\S]*?\n(?=\n)/m, `${table}\n`)
    .replace(/^Core's newest release.*$/m, newest)
    .replace(GENERATED_NOTES, "")
    .replace(/\n*$/, "\n");
  return `${body}${notes}\n`;
}

/** docs/platforms/apple.md with its release line's core and its [^core] footnote rendered from `facts`. */
export function renderApple(page, { apple }) {
  const provenance = blobUrl(APPLE, apple.commit, "core-provenance.json");
  const note = `[^core]: ${tagUrl(APPLE, apple.tag)}; ${provenance}; ${APPLE_CI} ${urlOk(tagUrl(APPLE, apple.tag))} ${urlOk(provenance)} ${urlOk(APPLE_CI)} ${equals(VERSIONS, "apple.coreTag", apple.coreTag)}`;
  return page
    .replace(/^Release \[v[^\]]*\]\([^)]*\) meets [^:]*:/m, `Release [${apple.tag}](${tagUrl(APPLE, apple.tag)}) meets ${kitCore(apple)}:`)
    .replace(/^\[\^core\]: .*$/m, note);
}

/** docs/platforms/windows.md with its release line's core and its [^core] footnote rendered from `facts`. */
export function renderWindows(page, { windows }) {
  const provenance = blobUrl(WINDOWS, windows.commit, "core-provenance.json");
  const note = `[^core]: ${tagUrl(WINDOWS, windows.tag)}; ${provenance}; ${windowsCi(windows.commit)} ${urlOk(tagUrl(WINDOWS, windows.tag))} ${urlOk(provenance)} ${urlOk(windowsCi(windows.commit))} ${equals(VERSIONS, "windows.coreTag", windows.coreTag)}`;
  return page
    .replace(/^Release \[v[^\]]*\]\([^)]*\) meets [^:]*:/m, `Release [${windows.tag}](${tagUrl(WINDOWS, windows.tag)}) meets ${kitCore(windows)}:`)
    .replace(/^\[\^core\]: .*$/m, note);
}

/** docs/platforms/android.md with its release line's core and its [^core] footnote rendered from `facts`. */
export function renderAndroid(page, { android }) {
  const provenance = blobUrl(ANDROID, android.commit, "core-provenance.json");
  const note = `[^core]: ${tagUrl(ANDROID, android.tag)}; ${provenance}; ${androidCi(android.commit)} ${urlOk(tagUrl(ANDROID, android.tag))} ${urlOk(provenance)} ${urlOk(androidCi(android.commit))} ${equals(VERSIONS, "android.coreTag", android.coreTag)}`;
  return page
    .replace(/^Release \[v[^\]]*\]\([^)]*\) meets [^:]*:/m, `Release [${android.tag}](${tagUrl(ANDROID, android.tag)}) meets ${kitCore(android)}:`)
    .replace(/^\[\^core\]: .*$/m, note);
}

/** versions.json's text for the pinned kit releases. */
function versionsFile({ apple, windows, android }) {
  const comment = "Generated by node scripts/platform-versions.mjs --apple <tag>, --windows <tag> and --android <tag> from each kit's release; do not edit. It pins the Apple, Windows and Android releases the Platforms pages document, which the Apple release workflow holds to GitHub. Core's newest release is not recorded here: the Pages build reads it.";
  return `${JSON.stringify({ $comment: comment, apple, windows, android }, null, 2)}\n`;
}

/**
 * The facts the committed data states: the kit releases versions.json pins, and core's and web's from the parity copies
 * and their provenance. `read` takes a path from the repository root.
 */
export function factsOf(versions, read) {
  const provenance = JSON.parse(read(PROVENANCE));
  const parity = JSON.parse(read(PARITY));
  return { core: { tag: provenance.coreTag, commit: provenance.coreCommit }, web: { tag: parity.webTag }, apple: versions.apple, windows: versions.windows, android: versions.android };
}

/** Every file the facts render, by path from the repository root. `read` takes such a path. */
export function render(facts, read) {
  return {
    [VERSIONS]: versionsFile(facts),
    [PLATFORMS]: renderPlatforms(read(PLATFORMS), facts),
    [APPLE_PAGE]: renderApple(read(APPLE_PAGE), facts),
    [WINDOWS_PAGE]: renderWindows(read(WINDOWS_PAGE), facts),
    [ANDROID_PAGE]: renderAndroid(read(ANDROID_PAGE), facts),
  };
}

/** The addresses a text's urlOk checks name. */
export const urlOks = (text) => new Set([...text.matchAll(/verify:urlOk\(([^)\s]+)\)/g)].map((match) => match[1]));

/**
 * The claim cache (scripts/claims-urls.json) after the pages are rendered again: an address the pages no longer cite and
 * no other file's claim cites (`citedElsewhere`: a `verify:urlOk(…)` in prose, or `urlOk: "…"` in a TypeScript claim) leaves it, and one they now cite that it lacks joins it with the status
 * `statusOf` reads, so the claims check passes on the rendered pages with no hand edit.
 */
export async function syncUrlCache(cache, { before, after, citedElsewhere, statusOf, today }) {
  const next = { ...cache };
  for (const url of before) if (!after.has(url) && !citedElsewhere(url)) delete next[url];
  for (const url of after) if (!(url in next)) next[url] = { status: await statusOf(url), checked: today };
  return Object.fromEntries(Object.entries(next).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** What differs between the committed data and the pages and versions.json as they are, each with what to do. */
export function drift(versions, read) {
  return Object.entries(render(factsOf(versions, read), read))
    .filter(([path, text]) => read(path) !== text)
    .map(([path]) => `${path} differs from what the committed data renders. ${FIX}`);
}

/** GitHub could not be read: the API failed, which is not drift. */
class VersionsUnreadable extends Error {
  name = "VersionsUnreadable";
}

/** One address's body, retried `attempts` times after a network failure, a server error or a rate limit. */
async function get(url, { fetch, token, attempts, delayMs }) {
  const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  let last = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) await delay(delayMs * 2 ** (attempt - 2));
    let response;
    try {
      response = await fetch(url, { headers });
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      continue;
    }
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    last = `${response.status} ${await response.text()}`;
    if (!(response.status >= 500 || response.status === 429 || response.status === 403)) break;
  }
  throw new VersionsUnreadable(`${url} could not be read: ${last}`);
}

const jsonOf = (options) => async (url) => JSON.parse((await get(url, options)).toString("utf8"));
/** The request options every reader takes: the fetch and token, and how often a read is retried. */
const readOptions = ({ fetch = globalThis.fetch, token, attempts = 3, delayMs = 2000 } = {}) => ({ fetch, token, attempts, delayMs });

/** Core's newest release from GitHub: its tag and commit, and the bytes of the parity copies at it (the claim files from the release, parity.json from the commit). */
export async function gatherCore(options = {}) {
  const readerOptions = readOptions(options);
  const json = jsonOf(readerOptions);
  const tag = (await json(`https://api.github.com/repos/${CORE}/releases/latest`)).tag_name;
  if (!TAG.test(tag ?? "")) throw new VersionsUnreadable(`The newest release of ${CORE} is tagged "${tag}", which is no version number`);
  const commit = (await json(`https://api.github.com/repos/${CORE}/commits/${tag}`)).sha;
  const files = {
    "components.claims.json": `https://github.com/${CORE}/releases/download/${tag}/components.claims.json`,
    "actions.claims.json": `https://github.com/${CORE}/releases/download/${tag}/actions.claims.json`,
    "parity.json": `https://raw.githubusercontent.com/${CORE}/${commit}/parity.json`,
  };
  const copies = {};
  for (const [name, url] of Object.entries(files)) copies[name] = await get(url, readerOptions);
  return { core: { tag, commit }, copies };
}

/** A native kit's release at `tag` from GitHub: its commit, and the core its core-provenance.json names. */
export async function gatherKit(repo, tag, options = {}) {
  const json = jsonOf(readOptions(options));
  const commit = (await json(`https://api.github.com/repos/${repo}/commits/${tag}`)).sha;
  const provenance = await json(`https://raw.githubusercontent.com/${repo}/${commit}/core-provenance.json`);
  return { tag, commit, coreTag: provenance.coreTag, treeCoreTag: provenance.tree?.coreTag ?? provenance.coreTag };
}
export const gatherApple = (tag, options) => gatherKit(APPLE, tag, options);
export const gatherWindows = (tag, options) => gatherKit(WINDOWS, tag, options);
export const gatherAndroid = (tag, options) => gatherKit(ANDROID, tag, options);

/** The pinned kit releases against GitHub: drift when the commit a pinned tag names, or the cores its provenance names, differ. */
export async function pinnedProblems(versions, options = {}) {
  const problems = [];
  for (const [kit, repo] of Object.entries(KITS)) {
    const pinned = versions[kit];
    const now = await gatherKit(repo, pinned.tag, options);
    const same = ["commit", "coreTag", "treeCoreTag"].every((field) => now[field] === pinned[field]);
    if (!same) problems.push(`${VERSIONS} pins ${repo} ${pinned.tag} at ${pinned.commit} on core ${pinned.coreTag} (${pinned.treeCoreTag}), and GitHub says ${now.commit} on core ${now.coreTag} (${now.treeCoreTag}). ${pinFix(kit, pinned.tag)}`);
  }
  return problems;
}

const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

/** The parity tables' copies of core's files and the release they are from, written together once every copy was read. */
function writeCopies({ core, copies }) {
  const provenance = JSON.parse(readFileSync(join(root, PROVENANCE), "utf8"));
  for (const [name, bytes] of Object.entries(copies)) writeFileSync(join(root, "scripts/parity-data", name), bytes);
  const files = Object.fromEntries(Object.entries(copies).map(([name, bytes]) => [name, sha(bytes)]));
  const { $comment, coreRepo } = provenance;
  writeFileSync(join(root, PROVENANCE), `${JSON.stringify({ $comment, coreRepo, coreTag: core.tag, coreCommit: core.commit, files }, null, 2)}\n`);
}

/** GitHub could not be read: exit 2, reported at `level` (a warning where the build keeps what it has). Anything else is a bug. */
function unreadable(error, level) {
  if (!(error instanceof VersionsUnreadable)) throw error;
  console.log(`::${level}::${error.message}. Not drift: run it again later.`);
  return 2;
}

async function main(args) {
  const read = (path) => readFileSync(join(root, path), "utf8");
  const versions = () => JSON.parse(read(VERSIONS));
  const behind = (problems) => {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `behind=${problems.length > 0}\n`);
    for (const problem of problems) console.log(`::error::${problem}`);
    return problems.length > 0 ? 1 : 0;
  };
  const renderPages = async () => {
    const pages = render(factsOf(versions(), read), read);
    const paths = Object.keys(pages).filter((path) => path.endsWith(".md"));
    const before = new Set(paths.flatMap((path) => [...urlOks(read(path))]));
    const after = new Set(paths.flatMap((path) => [...urlOks(pages[path])]));
    for (const [path, text] of Object.entries(pages)) writeFileSync(join(root, path), text);
    const citedElsewhere = (url) => {
      try {
        execFileSync("git", ["grep", "-q", "-F", "-e", `verify:urlOk(${url})`, "-e", `urlOk: "${url}"`, "-e", `urlOk: '${url}'`, "--", ".", ...paths.map((path) => `:!${path}`)], { cwd: root });
        return true;
      } catch {
        return false;
      }
    };
    const cache = JSON.parse(read(URL_CACHE));
    const today = new Date().toISOString().slice(0, 10);
    const synced = await syncUrlCache(cache, { before, after, citedElsewhere, statusOf: urlStatus, today });
    if (JSON.stringify(synced) !== JSON.stringify(cache)) writeFileSync(join(root, URL_CACHE), `${JSON.stringify(synced, null, 2)}\n`);
  };
  const options = { token: process.env.GH_TOKEN, fetch: globalThis.fetch, attempts: 3, delayMs: 2000 };

  if (args.includes("--render")) {
    await renderPages();
    console.log(`Rendered ${PLATFORMS}, ${APPLE_PAGE}, ${WINDOWS_PAGE}, ${ANDROID_PAGE} and ${VERSIONS} from the committed data.`);
    return 0;
  }
  if (args.includes("--write")) {
    let core;
    try {
      core = await gatherCore(options);
    } catch (error) {
      return unreadable(error, "warning");
    }
    writeCopies(core);
    await renderPages();
    console.log(`Wrote core ${core.core.tag}'s copies and the Platforms pages that name it. The kit releases stay ${versions().apple.tag} (Apple), ${versions().windows.tag} (Windows) and ${versions().android.tag} (Android).`);
    return 0;
  }
  const pin = Object.keys(KITS).map((kit) => `--${kit}`).find((flag) => args.includes(flag));
  if (pin) {
    const kit = pin.slice(2);
    const repo = KITS[kit];
    const tag = args[args.indexOf(pin) + 1] ?? "";
    if (!TAG.test(tag)) {
      console.log(`::error::${pin} takes a release tag such as v0.6.1, not "${tag}".`);
      return 1;
    }
    let pinned;
    try {
      pinned = await gatherKit(repo, tag, options);
    } catch (error) {
      return unreadable(error, "error");
    }
    const current = versions();
    writeFileSync(join(root, VERSIONS), versionsFile({ ...current, [kit]: pinned }));
    await renderPages();
    console.log(`Pinned ${repo} ${tag} (${kitCore(pinned)}) and rewrote the Platforms pages that state it.`);
    return 0;
  }
  if (args.includes("--live")) {
    let pinned;
    try {
      pinned = await pinnedProblems(versions(), options);
    } catch (error) {
      return unreadable(error, "error");
    }
    const code = behind([...pinned, ...drift(versions(), read)]);
    if (code === 0) console.log(`${VERSIONS} pins ${APPLE} ${versions().apple.tag}, ${WINDOWS} ${versions().windows.tag} and ${ANDROID} ${versions().android.tag} as GitHub has them, and the Platforms pages state them.`);
    return code;
  }
  const code = behind(drift(versions(), read));
  if (code === 0) console.log(`The Platforms pages state what the committed data records (core ${factsOf(versions(), read).core.tag}, Apple ${versions().apple.tag}, Windows ${versions().windows.tag}, Android ${versions().android.tag}).`);
  return code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
