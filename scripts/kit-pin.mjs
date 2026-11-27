// The kit pin: a sibling kit's newest release (ouro-ui-apple, ouro-ui-windows and ouro-ui-android), pinned on main through
// its own pull request, one per kit (kit-pin.yml), so a release lands without anyone bumping the pages by hand, and one
// kit's broken release holds up no other kit's pin. kit-pin.yml runs these steps for each kit:
//
//   node scripts/kit-pin.mjs --check <kit>               network: writes result=behind or current, tag=v<newest> and
//                                                        from=<the version versions.json pins> to GITHUB_OUTPUT; exits 2
//                                                        when GitHub cannot be read, which is no drift
//   node scripts/platform-versions.mjs --<kit> <tag>     network: pins the release in versions.json and renders the Platforms pages
//   node scripts/parity-matrix.mjs --write               network, Apple only: the parity matrix's Apple components, at that release
//   node scripts/kit-pin.mjs --bump <kit> <from> <to>    offline, but network for each new claim address: moves every statement of
//                                                        <from> in the kit's pages to <to> and keeps claims-urls.json in step
//
//                                                        Apple's bump also copies Feel's check catalog from the new release
//                                                        into site/src/apple/feel-checks.json, which the Feel page lists
//
// The statements moved are the kit's own pages (site/src/<kit>, docs/platforms/<kit>.md) and, on lines that name the kit, the
// README, the Platforms README and parity page, site/llms.txt and the kit's change fragments. A "since <from>" statement keeps
// its release: it names the release a feature came in.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compare, latestRelease, ReleaseUnreadable } from "./apple-release.mjs";
import { syncUrlCache, urlStatus } from "./platform-versions.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSIONS = "scripts/parity-data/versions.json";
const URL_CACHE = "scripts/claims-urls.json";

/** Each sibling kit's repository, and the word that names it on a line. */
export const KITS = {
  apple: { repo: "ourostack/ouro-ui-apple", word: /apple/i },
  windows: { repo: "ourostack/ouro-ui-windows", word: /windows/i },
  android: { repo: "ourostack/ouro-ui-android", word: /android/i },
};
const linkOf = (kit) => `https://github.com/${KITS[kit].repo}/releases/tag/`;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const minor = (version) => version.split(".").slice(0, 2).join(".");

/** One line with its statements of `from` moved to `to`: the release link's minor version too, and not a "since" one. */
export function bumpLine(line, from, to, link = linkOf("apple")) {
  return line
    .replace(new RegExp(`\\[${escape(minor(from))}\\]\\((${escape(link)})v${escape(from)}\\)`, "g"), `[${minor(to)}]($1v${to})`)
    .replace(new RegExp(`(?<![Ss]ince v?)(?<![\\d.])(v?)${escape(from)}(?![\\d]|\\.\\d)`, "g"), `$1${to}`);
}

/** A line that says "since <from>": the release a feature came in, which its prose and its sources keep. */
const sinceOf = (from) => new RegExp(`since v?${escape(from)}(?![\\d]|\\.\\d)`, "i");
/** The current-release check, `verify:equals(site/src/apple/kit.json#release)=` or `is: "` in a TypeScript claim: every statement moves it. */
const currentCheck = (from) => new RegExp(`(kit\\.json#release(?:\\)=|", is: "))${escape(from)}(?![\\d]|\\.\\d)`, "g");

/** The lines of each TypeScript claim (from its `claim(` line to the first line after it that starts with `})`) whose text says "since <from>". */
function sinceClaims(lines, since) {
  const kept = new Set();
  for (let start = 0; start < lines.length; start += 1) {
    if (!/claim\(/.test(lines[start])) continue;
    let end = start;
    while (end < lines.length - 1 && !lines[end].trim().startsWith("})")) end += 1;
    if (since.test(lines.slice(start, end + 1).join("\n"))) for (let line = start; line <= end; line += 1) kept.add(line);
    start = end;
  }
  return kept;
}

/**
 * A page's text with `bumpLine` applied, except for the statements of a "since <from>" release: a line that says it, a claim
 * whose text does (TypeScript) and the footnote a line of it cites. Those keep their prose and sources, and only their check
 * of the current release moves. In a `mixed` file only the lines that name the kit (`word`) are bumped.
 */
export function bumpText(text, from, to, { mixed = false, typescript = false, word = KITS.apple.word, link = linkOf("apple") } = {}) {
  const lines = text.split("\n");
  const since = sinceOf(from);
  const check = currentCheck(from);
  const kept = typescript ? sinceClaims(lines, since) : new Set();
  const labels = new Set(
    lines.flatMap((line, index) => (since.test(line) || kept.has(index) ? [...line.matchAll(/\[\^([\w-]+)\]/g)].map((match) => match[1]) : [])),
  );
  return lines
    .map((line, index) => {
      const label = /^\[\^([\w-]+)\]:/.exec(line)?.[1];
      if (kept.has(index) || since.test(line) || (label !== undefined && labels.has(label))) return line.replace(check, `$1${to}`);
      if (mixed && !word.test(line)) return line;
      // A mixed table row can name more than one kit on the same line (parity.md's Kit row holds every kit's cell): bump
      // only the cell that names this kit, so another kit's cell at the same version is not swept up by the line-wide
      // replace. A row that names only this kit (the Platforms README's one-row-per-kit table) still moves the whole line,
      // since its version cell doesn't repeat the kit's own word.
      if (mixed && line.includes("|") && Object.values(KITS).filter((kit) => kit.word.test(line)).length > 1) {
        return line.split("|").map((cell) => (word.test(cell) ? bumpLine(cell, from, to, link) : cell)).join("|");
      }
      return bumpLine(line, from, to, link);
    })
    .join("\n");
}

/** The claim addresses a text cites: `verify:urlOk(…)` in Markdown, `urlOk: "…"` in a TypeScript claim. */
export function urlsIn(text) {
  return new Set([...text.matchAll(/verify:urlOk\(([^)\s]+)\)/g), ...text.matchAll(/urlOk: "([^"]+)"/g)].map((match) => match[1]));
}

/** Every file that may state a kit's version, by path from the repository root, and whether only its lines that name the kit do. */
export function kitPages(kit, listing) {
  const site = listing(`site/src/${kit}`)
    .filter((name) => /\.(tsx|ts|json)$/.test(name))
    .map((name) => ({ path: `site/src/${kit}/${name}`, mixed: false, typescript: /\.tsx?$/.test(name) }));
  const fragments = listing("changes")
    .filter((name) => new RegExp(`^${kit}-.*\\.md$`).test(name))
    .map((name) => ({ path: `changes/${name}`, mixed: true, typescript: false }));
  return [
    ...site,
    { path: `docs/platforms/${kit}.md`, mixed: false, typescript: false },
    { path: "README.md", mixed: true, typescript: false },
    { path: "docs/platforms/README.md", mixed: true, typescript: false },
    { path: "docs/platforms/parity.md", mixed: true, typescript: false },
    { path: "site/llms.txt", mixed: true, typescript: false },
    ...fragments,
  ];
}

/**
 * The verdict of `--check`: "behind" when versions.json pins an older release than GitHub's newest, else "current", with
 * the newest tag and the version pinned now. A pin ahead of GitHub's newest release is current: nothing to pin.
 */
export function pinOf(pinned, latest) {
  return { result: compare(pinned, latest) < 0 ? "behind" : "current", tag: `v${latest}`, from: pinned };
}

/** The Feel page's copy of Ouro Feel's check catalog (docs/ouro-feel/checks.json in ouro-ui-apple). */
export const FEEL_CATALOG = "site/src/apple/feel-checks.json";

/** Feel's catalog as the release `version` ships it, or null when that release has none or GitHub won't serve it. */
export async function feelCatalogAt(version, fetchText = globalThis.fetch) {
  try {
    const response = await fetchText(`https://raw.githubusercontent.com/${KITS.apple.repo}/v${version}/docs/ouro-feel/checks.json`);
    if (!response.ok) return null;
    const text = await response.text();
    return Array.isArray(JSON.parse(text).principles) ? text : null;
  } catch {
    return null;
  }
}

const listing = (dir) => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)) : []);

/** Writes the moved statements and syncs the claim cache for the addresses they cite: a new one is checked, a dropped one leaves. */
async function bump(kit, from, to) {
  const pages = kitPages(kit, listing).filter((page) => existsSync(join(root, page.path)));
  const changed = [];
  if (kit === "apple") {
    const catalog = await feelCatalogAt(to);
    if (catalog !== null && catalog !== readFileSync(join(root, FEEL_CATALOG), "utf8")) {
      writeFileSync(join(root, FEEL_CATALOG), catalog);
      changed.push(FEEL_CATALOG);
    }
  }
  const before = new Set();
  const after = new Set();
  for (const page of pages) {
    const text = readFileSync(join(root, page.path), "utf8");
    const next = bumpText(text, from, to, { mixed: page.mixed, typescript: page.typescript, word: KITS[kit].word, link: linkOf(kit) });
    if (next === text) continue;
    changed.push(page.path);
    for (const url of urlsIn(text)) before.add(url);
    for (const url of urlsIn(next)) after.add(url);
    writeFileSync(join(root, page.path), next);
  }
  if (changed.length === 0) return changed;
  const citedElsewhere = (url) => {
    try {
      execFileSync("git", ["grep", "-q", "-F", "-e", `verify:urlOk(${url})`, "-e", `urlOk: "${url}"`, "-e", `urlOk: '${url}'`, "--", ".", ...changed.map((path) => `:!${path}`)], { cwd: root });
      return true;
    } catch {
      return false;
    }
  };
  const cache = JSON.parse(readFileSync(join(root, URL_CACHE), "utf8"));
  const synced = await syncUrlCache(cache, { before, after, citedElsewhere, statusOf: urlStatus, today: new Date().toISOString().slice(0, 10) });
  if (JSON.stringify(synced) !== JSON.stringify(cache)) writeFileSync(join(root, URL_CACHE), `${JSON.stringify(synced, null, 2)}\n`);
  return changed;
}

async function check(kit) {
  let release;
  try {
    release = await latestRelease({ token: process.env.GH_TOKEN, repository: KITS[kit].repo });
  } catch (error) {
    if (!(error instanceof ReleaseUnreadable)) throw error;
    console.log(`::notice::${error.message}. Not drift: the pin is checked again next hour.`);
    return 2;
  }
  const pinned = JSON.parse(readFileSync(join(root, VERSIONS), "utf8"))[kit].tag.replace(/^v/, "");
  const verdict = pinOf(pinned, release.version);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `result=${verdict.result}\ntag=${verdict.tag}\nfrom=${verdict.from}\n`);
  console.log(verdict.result === "behind" ? `main pins ${KITS[kit].repo} ${pinned}; its newest release is ${release.version}, published ${release.publishedAt}.` : `main pins ${KITS[kit].repo} ${pinned}, its newest release.`);
  return 0;
}

async function main(args) {
  if (args[0] === "--check" && Object.hasOwn(KITS, args[1])) return check(args[1]);
  if (args[0] === "--bump" && args.length === 4 && Object.hasOwn(KITS, args[1])) {
    const changed = await bump(args[1], args[2], args[3]);
    console.log(changed.length === 0 ? `No ${args[1]} page states ${args[2]}.` : `Moved ${args[2]} to ${args[3]} in ${changed.join(", ")}.`);
    return 0;
  }
  console.log(`::error::Usage: node scripts/kit-pin.mjs --check <kit>, or --bump <kit> <from> <to>, with kit ${Object.keys(KITS).join(", ")}.`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
