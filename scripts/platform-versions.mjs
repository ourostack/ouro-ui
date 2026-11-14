// The versions the Platforms pages state (docs/platforms/README.md's version table, docs/platforms/apple.md's
// release line) and the core release the site's parity tables are built from, generated from the releases
// themselves so they cannot fall behind unnoticed: core's newest release, the web release its parity check
// compares against (parity.json at that tag), ouro-ui-apple's newest release and the core tags its
// core-provenance.json names. scripts/parity-data/versions.json records those facts; the pages are rendered
// from it.
//
//   node scripts/platform-versions.mjs           fail when a page differs from versions.json (offline)
//   node scripts/platform-versions.mjs --live    also fail when versions.json differs from GitHub (network)
//   node scripts/platform-versions.mjs --write   read GitHub, then rewrite versions.json, the pages and the
//                                                parity tables' copies of core's files (network)
//
//   Exits 1 on drift (and writes behind=true to GITHUB_OUTPUT), 2 when GitHub cannot be read, which is no drift.
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
const PLATFORMS = "docs/platforms/README.md";
const APPLE_PAGE = "docs/platforms/apple.md";
const PROVENANCE = "scripts/parity-data/provenance.json";
/** Where ouro-ui-apple's CI checks the provenance hashes: a pinned permalink, since the check is unchanged. */
const APPLE_CI = "https://github.com/ourostack/ouro-ui-apple/blob/9931f6d284f44014648482bde69b114e48b7b7de/.github/workflows/ci.yml#L74-L96";
const FIX = "Run node scripts/platform-versions.mjs --write and commit what it changes.";

const tagUrl = (repo, tag) => `https://github.com/${repo}/releases/tag/${tag}`;
const blobUrl = (repo, commit, path) => `https://github.com/${repo}/blob/${commit}/${path}`;
const urlOk = (url) => `verify:urlOk(${url})`;
const equals = (field, value) => `verify:equals(${VERSIONS}#${field})=${value}`;

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
    `[^web-release]: ${tagUrl(WEB, web.tag)} ${urlOk(tagUrl(WEB, web.tag))} ${equals("web.tag", web.tag)}`,
    `[^web-core]: ${parity}; ${tagUrl(CORE, core.tag)} ${urlOk(parity)} ${urlOk(tagUrl(CORE, core.tag))} ${equals("web.tag", web.tag)} ${equals("core.tag", core.tag)}`,
    `[^apple-release]: ${tagUrl(APPLE, apple.tag)} ${urlOk(tagUrl(APPLE, apple.tag))} ${equals("apple.tag", apple.tag)}`,
    `[^apple-core]: ${provenance}; ${APPLE_CI} ${urlOk(provenance)} ${urlOk(APPLE_CI)} ${equals("apple.coreTag", apple.coreTag)}`,
    `[^core-latest]: ${tagUrl(CORE, core.tag)} ${urlOk(tagUrl(CORE, core.tag))} ${equals("core.tag", core.tag)}`,
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
  const note = `[^core]: ${tagUrl(APPLE, apple.tag)}; ${provenance}; ${APPLE_CI} ${urlOk(tagUrl(APPLE, apple.tag))} ${urlOk(provenance)} ${urlOk(APPLE_CI)} ${equals("apple.coreTag", apple.coreTag)}`;
  return page
    .replace(/^Release \[v[^\]]*\]\([^)]*\) meets [^:]*:/m, `Release [${apple.tag}](${tagUrl(APPLE, apple.tag)}) meets ${appleCore(apple)}:`)
    .replace(/^\[\^core\]: .*$/m, note);
}

/** versions.json's text for `facts`. */
function versionsFile(facts) {
  const comment = "Generated by node scripts/platform-versions.mjs --write from the releases on GitHub; do not edit. The Platforms pages are rendered from it, and the Apple release workflow checks it against GitHub hourly.";
  return `${JSON.stringify({ $comment: comment, ...facts }, null, 2)}\n`;
}

/** Every file the facts render, by path from the repository root. `read` takes such a path. */
export function render(facts, read) {
  return {
    [VERSIONS]: versionsFile(facts),
    [PLATFORMS]: renderPlatforms(read(PLATFORMS), facts),
    [APPLE_PAGE]: renderApple(read(APPLE_PAGE), facts),
  };
}

const factsOf = ({ core, web, apple }) => ({ core, web, apple });

/** What differs between versions.json's facts and the pages as they are, each with what to do. */
export function drift(versions, read) {
  const facts = factsOf(versions);
  const problems = Object.entries(render(facts, read))
    .filter(([path, text]) => path !== VERSIONS && read(path) !== text)
    .map(([path]) => `${path} differs from what ${VERSIONS} renders. ${FIX}`);
  const provenance = JSON.parse(read(PROVENANCE));
  if (provenance.coreTag !== facts.core.tag) problems.push(`${PROVENANCE} says core ${provenance.coreTag}, and core's newest release is ${facts.core.tag}. ${FIX}`);
  return problems;
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

/** The facts, read from GitHub: core's newest release, the web tag its parity.json names, Apple's newest release and its provenance. */
export async function gather({ fetch = globalThis.fetch, token, attempts = 3, delayMs = 2000 } = {}) {
  const options = { fetch, token, attempts, delayMs };
  const json = async (url) => JSON.parse((await get(url, options)).toString("utf8"));
  const release = async (repo) => {
    const tag = (await json(`https://api.github.com/repos/${repo}/releases/latest`)).tag_name;
    if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "")) throw new VersionsUnreadable(`The newest release of ${repo} is tagged "${tag}", which is no version number`);
    return { tag, commit: (await json(`https://api.github.com/repos/${repo}/commits/${tag}`)).sha };
  };
  const core = await release(CORE);
  const parity = await json(`https://raw.githubusercontent.com/${CORE}/${core.commit}/parity.json`);
  const apple = await release(APPLE);
  const provenance = await json(`https://raw.githubusercontent.com/${APPLE}/${apple.commit}/core-provenance.json`);
  return {
    core,
    web: { tag: parity.webTag },
    apple: { ...apple, coreTag: provenance.coreTag, treeCoreTag: provenance.tree?.coreTag ?? provenance.coreTag },
  };
}

const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

/** The parity tables' copies of core's files at `core`: the claim files from its release, parity.json from its commit. */
async function refreshParityData(core, options) {
  const provenance = JSON.parse(readFileSync(join(root, PROVENANCE), "utf8"));
  if (provenance.coreTag === core.tag) return;
  const files = {
    "components.claims.json": `https://github.com/${CORE}/releases/download/${core.tag}/components.claims.json`,
    "actions.claims.json": `https://github.com/${CORE}/releases/download/${core.tag}/actions.claims.json`,
    "parity.json": `https://raw.githubusercontent.com/${CORE}/${core.commit}/parity.json`,
  };
  const hashes = {};
  for (const [name, url] of Object.entries(files)) {
    const bytes = await get(url, options);
    writeFileSync(join(root, "scripts/parity-data", name), bytes);
    hashes[name] = sha(bytes);
  }
  writeFileSync(join(root, PROVENANCE), `${JSON.stringify({ ...provenance, coreTag: core.tag, files: hashes }, null, 2)}\n`);
}

async function main(args) {
  const read = (path) => readFileSync(join(root, path), "utf8");
  const versions = () => JSON.parse(read(VERSIONS));
  const behind = (problems) => {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `behind=${problems.length > 0}\n`);
    for (const problem of problems) console.log(`::error::${problem}`);
    return problems.length > 0 ? 1 : 0;
  };
  if (!args.includes("--live") && !args.includes("--write")) {
    const recorded = versions();
    const code = behind(drift(recorded, read));
    if (code === 0) console.log(`The Platforms pages state what ${VERSIONS} records (core ${recorded.core.tag}, Apple ${recorded.apple.tag}).`);
    return code;
  }
  const options = { token: process.env.GH_TOKEN, fetch: globalThis.fetch, attempts: 3, delayMs: 2000 };
  let facts;
  try {
    facts = await gather(options);
  } catch (error) {
    if (!(error instanceof VersionsUnreadable)) throw error;
    console.log(`::error::${error.message}. Not drift: run it again later.`);
    return 2;
  }
  if (args.includes("--write")) {
    await refreshParityData(facts.core, options);
    for (const [path, text] of Object.entries(render(facts, read))) writeFileSync(join(root, path), text);
    console.log(`Wrote ${VERSIONS} and the Platforms pages: core ${facts.core.tag}, web ${facts.web.tag}, Apple ${facts.apple.tag} on core ${facts.apple.coreTag}.`);
    return 0;
  }
  const recorded = versions();
  const live = versionsFile(facts) === versionsFile(factsOf(recorded)) ? [] : [`${VERSIONS} records core ${recorded.core.tag}, web ${recorded.web.tag} and Apple ${recorded.apple.tag} on core ${recorded.apple.coreTag}; GitHub says core ${facts.core.tag}, web ${facts.web.tag} and Apple ${facts.apple.tag} on core ${facts.apple.coreTag}. ${FIX}`];
  const code = behind([...live, ...drift(recorded, read)]);
  if (code === 0) console.log(`${VERSIONS} and the Platforms pages match GitHub (core ${facts.core.tag}, Apple ${facts.apple.tag}).`);
  return code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
