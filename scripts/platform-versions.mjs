// The Platforms pages (docs/platforms/README.md and apple.md) state three versions: the core release their parity tables
// are built from and web's release that core's parity check compares against, both from the copies in scripts/parity-data
// (parity.json's webTag, provenance.json's coreTag and coreCommit), and the ouro-ui-apple release the Apple pages document,
// pinned in scripts/parity-data/versions.json. Only that Apple release is pinned: the scheduled Apple check holds it to
// GitHub. Core's newest release is not checked against anything, because the Pages build writes it (--write) before the
// site builds, so it cannot go stale on main.
//
//   node scripts/platform-versions.mjs                 fail when a page differs from what the committed data renders (offline)
//   node scripts/platform-versions.mjs --render        rewrite the pages from the committed data (offline)
//   node scripts/platform-versions.mjs --live          also fail when the pinned Apple release differs from GitHub (network)
//   node scripts/platform-versions.mjs --write         read core's newest release, then rewrite its copies and the pages (network; the Pages build runs it)
//   node scripts/platform-versions.mjs --apple <tag>   pin ouro-ui-apple's release <tag>, then rewrite versions.json and the pages (network)
//
//   Exits 1 on drift (and writes behind=true to GITHUB_OUTPUT), 2 when GitHub cannot be read, which is no drift. --write
//   reports a 2 as a warning and writes nothing, so the build keeps the copies main has.
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORE = "ourostack/ouro-ui-core";
const APPLE = "ourostack/ouro-ui-apple";
const WEB = "ourostack/ouro-ui";
const VERSIONS = "scripts/parity-data/versions.json";
const PARITY = "scripts/parity-data/parity.json";
const PROVENANCE = "scripts/parity-data/provenance.json";
const PLATFORMS = "docs/platforms/README.md";
const APPLE_PAGE = "docs/platforms/apple.md";
/** Where ouro-ui-apple's CI checks the provenance hashes: a pinned permalink, since the check is unchanged. */
const APPLE_CI = "https://github.com/ourostack/ouro-ui-apple/blob/9931f6d284f44014648482bde69b114e48b7b7de/.github/workflows/ci.yml#L74-L96";
const FIX = "Run node scripts/platform-versions.mjs --render and commit what it changes.";
const pinFix = (tag) => `Run node scripts/platform-versions.mjs --apple ${tag} and commit what it changes.`;
const TAG = /^v\d+\.\d+\.\d+$/;

const tagUrl = (repo, tag) => `https://github.com/${repo}/releases/tag/${tag}`;
const blobUrl = (repo, commit, path) => `https://github.com/${repo}/blob/${commit}/${path}`;
const urlOk = (url) => `verify:urlOk(${url})`;
const equals = (file, field, value) => `verify:equals(${file}#${field})=${value}`;

/** The core an Apple release meets, in words: one tag, or the tag for its tokens and claims and another for its A2UI cases. */
function appleCore({ coreTag, treeCoreTag }) {
  return treeCoreTag && treeCoreTag !== coreTag ? `core ${coreTag}, and ${treeCoreTag} for its A2UI conformance cases` : `core ${coreTag}`;
}

const GENERATED_NOTES = /^\[\^(web-release|web-core|apple-release|apple-core|core-latest|core-v\d+\.\d+\.\d+)\]: .*\n?/gm;

/** docs/platforms/README.md with its version table, the newest-core line and their footnotes rendered from `facts`. */
export function renderPlatforms(page, { core, web, apple }) {
  const table = [
    "| Ouro HX & AX | Release checked | The core it meets | How we know |",
    "| --- | --- | --- | --- |",
    `| For web | [${web.tag}](${tagUrl(WEB, web.tag)})[^web-release] | core ${core.tag}, for its tokens[^web-core] | Core's parity check compares its web stylesheets with web's, byte for byte.[^web-core] |`,
    `| For Apple | [${apple.tag}](${tagUrl(APPLE, apple.tag)})[^apple-release] | ${appleCore(apple)}[^apple-core] | The release's \`core-provenance.json\` names the tag and each file's SHA-256, and CI checks the hashes.[^apple-core] |`,
    "| For Android | none yet | none yet | [Build it](android.md) |",
    "| For Windows | none yet | none yet | [Build it](windows.md) |",
  ].join("\n");
  const newest = `Core's newest release is ${core.tag}.[^core-latest] Web's row names the web release that core's parity check compares against, which can be older than web's [latest release](https://github.com/ourostack/ouro-ui/releases/latest).`;
  const parity = blobUrl(CORE, core.commit, "parity.json");
  const provenance = blobUrl(APPLE, apple.commit, "core-provenance.json");
  const notes = [
    `[^web-release]: ${tagUrl(WEB, web.tag)} ${urlOk(tagUrl(WEB, web.tag))} ${equals(PARITY, "webTag", web.tag)}`,
    `[^web-core]: ${parity}; ${tagUrl(CORE, core.tag)} ${urlOk(parity)} ${urlOk(tagUrl(CORE, core.tag))} ${equals(PARITY, "webTag", web.tag)} ${equals(PROVENANCE, "coreTag", core.tag)}`,
    `[^apple-release]: ${tagUrl(APPLE, apple.tag)} ${urlOk(tagUrl(APPLE, apple.tag))} ${equals(VERSIONS, "apple.tag", apple.tag)}`,
    `[^apple-core]: ${provenance}; ${APPLE_CI} ${urlOk(provenance)} ${urlOk(APPLE_CI)} ${equals(VERSIONS, "apple.coreTag", apple.coreTag)}`,
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
    .replace(/^Release \[v[^\]]*\]\([^)]*\) meets [^:]*:/m, `Release [${apple.tag}](${tagUrl(APPLE, apple.tag)}) meets ${appleCore(apple)}:`)
    .replace(/^\[\^core\]: .*$/m, note);
}

/** versions.json's text for the pinned Apple release. */
function versionsFile(apple) {
  const comment = "Generated by node scripts/platform-versions.mjs --apple <tag> from ouro-ui-apple's release; do not edit. It pins the Apple release the Apple pages document, which the Apple release workflow holds to GitHub. Core's newest release is not recorded here: the Pages build reads it.";
  return `${JSON.stringify({ $comment: comment, apple }, null, 2)}\n`;
}

/**
 * The facts the committed data states: the Apple release versions.json pins, and core's and web's from the parity copies
 * and their provenance. `read` takes a path from the repository root.
 */
export function factsOf(versions, read) {
  const provenance = JSON.parse(read(PROVENANCE));
  const parity = JSON.parse(read(PARITY));
  return { core: { tag: provenance.coreTag, commit: provenance.coreCommit }, web: { tag: parity.webTag }, apple: versions.apple };
}

/** Every file the facts render, by path from the repository root. `read` takes such a path. */
export function render(facts, read) {
  return {
    [VERSIONS]: versionsFile(facts.apple),
    [PLATFORMS]: renderPlatforms(read(PLATFORMS), facts),
    [APPLE_PAGE]: renderApple(read(APPLE_PAGE), facts),
  };
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

/** The Apple release at `tag` from GitHub: its commit, and the core its core-provenance.json names. */
export async function gatherApple(tag, options = {}) {
  const json = jsonOf(readOptions(options));
  const commit = (await json(`https://api.github.com/repos/${APPLE}/commits/${tag}`)).sha;
  const provenance = await json(`https://raw.githubusercontent.com/${APPLE}/${commit}/core-provenance.json`);
  return { tag, commit, coreTag: provenance.coreTag, treeCoreTag: provenance.tree?.coreTag ?? provenance.coreTag };
}

/** The pinned Apple release against GitHub: drift when the commit its tag names, or the cores its provenance names, differ. */
export async function pinnedProblems(versions, options = {}) {
  const { apple } = versions;
  const now = await gatherApple(apple.tag, options);
  const same = ["commit", "coreTag", "treeCoreTag"].every((field) => now[field] === apple[field]);
  return same ? [] : [`${VERSIONS} pins ouro-ui-apple ${apple.tag} at ${apple.commit} on core ${apple.coreTag} (${apple.treeCoreTag}), and GitHub says ${now.commit} on core ${now.coreTag} (${now.treeCoreTag}). ${pinFix(apple.tag)}`];
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
  const renderPages = () => {
    for (const [path, text] of Object.entries(render(factsOf(versions(), read), read))) writeFileSync(join(root, path), text);
  };
  const options = { token: process.env.GH_TOKEN, fetch: globalThis.fetch, attempts: 3, delayMs: 2000 };

  if (args.includes("--render")) {
    renderPages();
    console.log(`Rendered ${PLATFORMS}, ${APPLE_PAGE} and ${VERSIONS} from the committed data.`);
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
    renderPages();
    console.log(`Wrote core ${core.core.tag}'s copies and the Platforms pages that name it. The Apple release stays ${versions().apple.tag}.`);
    return 0;
  }
  if (args.includes("--apple")) {
    const tag = args[args.indexOf("--apple") + 1] ?? "";
    if (!TAG.test(tag)) {
      console.log(`::error::--apple takes a release tag such as v0.6.1, not "${tag}".`);
      return 1;
    }
    let apple;
    try {
      apple = await gatherApple(tag, options);
    } catch (error) {
      return unreadable(error, "error");
    }
    writeFileSync(join(root, VERSIONS), versionsFile(apple));
    renderPages();
    console.log(`Pinned ouro-ui-apple ${tag} (core ${apple.coreTag}, and ${apple.treeCoreTag} for its A2UI cases) and rewrote the Platforms pages. Update the Apple pages' release by hand when this moved their version.`);
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
    if (code === 0) console.log(`${VERSIONS} pins ouro-ui-apple ${versions().apple.tag} as GitHub has it, and the Platforms pages state it.`);
    return code;
  }
  const code = behind(drift(versions(), read));
  if (code === 0) console.log(`The Platforms pages state what the committed data records (core ${factsOf(versions(), read).core.tag}, Apple ${versions().apple.tag}).`);
  return code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
