// The Apple version this repository states, against ouro-ui-apple's newest release, so ui.ouroboros.bot
// cannot go on saying 0.2.1 after 0.4.1 is out. It reads the version from every place that states one
// (the site's Apple pages through site/src/apple/kit.json, and the Platforms pages in docs/platforms),
// asks GitHub for the newest release, and fails when any of them names another.
//
//   node scripts/apple-release.mjs   needs network; GH_TOKEN optional on a public repository.
//   Exits 1 when a page states another version (and writes behind=true to GITHUB_OUTPUT), 2 when GitHub
//   cannot be read, which is no drift.
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY = "ourostack/ouro-ui-apple";

/** A version as numbers, or undefined when it is not X.Y.Z. A leading "v" is allowed. */
export function parse(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

/** Negative when `a` is older than `b`, positive when newer, zero when equal. */
export function compare(a, b) {
  const [x, y] = [parse(a), parse(b)];
  if (!x || !y) throw new Error(`Not versions: ${a}, ${b}`);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/**
 * Every version the repository states for ouro-ui-apple, as { where, version } with no "v": the site's kit.json
 * (its release, its release address and its package line) and the Platforms pages' version table, release links
 * and install line. `read` takes a path from the repository root.
 */
export function statedVersions(read) {
  const found = [];
  const kit = JSON.parse(read("site/src/apple/kit.json"));
  found.push({ where: "site/src/apple/kit.json release", version: kit.release });
  const url = /releases\/tag\/v(\d+\.\d+\.\d+)$/.exec(kit.releaseUrl);
  found.push({ where: "site/src/apple/kit.json releaseUrl", version: url?.[1] ?? kit.releaseUrl });
  const line = /from: "(\d+\.\d+\.\d+)"/.exec(kit.packageLine);
  found.push({ where: "site/src/apple/kit.json packageLine", version: line?.[1] ?? kit.packageLine });
  const platforms = read("docs/platforms/README.md");
  const row = /^\| For Apple \| \[v(\d+\.\d+\.\d+)\]/m.exec(platforms);
  found.push({ where: "docs/platforms/README.md, the For Apple row", version: row?.[1] ?? "(no For Apple row)" });
  const apple = read("docs/platforms/apple.md");
  const release = /Release \[v(\d+\.\d+\.\d+)\]/.exec(apple);
  found.push({ where: "docs/platforms/apple.md, Release", version: release?.[1] ?? "(no Release link)" });
  const install = /from: "(\d+\.\d+\.\d+)"/.exec(apple);
  found.push({ where: "docs/platforms/apple.md, the install line", version: install?.[1] ?? "(no install line)" });
  return found;
}

/** The statements that name a version other than `latest`: "behind" when older, "ahead" when newer, "unreadable" otherwise. */
export function staleness(found, latest) {
  return found.flatMap(({ where, version }) => {
    if (!parse(version)) return [{ where, version, kind: "unreadable" }];
    const order = compare(version, latest);
    return order === 0 ? [] : [{ where, version, kind: order < 0 ? "behind" : "ahead" }];
  });
}

/** Words for one stale statement, with what to do. */
export function describe({ where, version, kind }, latest) {
  if (kind === "unreadable") return `${where} says "${version}", which is no version number.`;
  if (kind === "behind") return `${where} says ${version}, and ouro-ui-apple's newest release is ${latest}. Update the Apple pages and the Platforms pages to ${latest}.`;
  return `${where} says ${version}, which is newer than ouro-ui-apple's newest release (${latest}). State only a release that exists.`;
}

/** GitHub could not be read: the API failed, which is not drift. */
class ReleaseUnreadable extends Error {
  name = "ReleaseUnreadable";
}

/**
 * ouro-ui-apple's newest release tag from the API (GET /repos/{repository}/releases/latest), asked up to `attempts`
 * times, `delayMs` apart and doubling, after a network failure, a server error or a rate limit (403 or 429).
 * Throws ReleaseUnreadable when it cannot be read.
 */
export async function latestRelease({ fetch = globalThis.fetch, token, attempts = 3, delayMs = 2000, repository = REPOSITORY } = {}) {
  const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  let last = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) await delay(delayMs * 2 ** (attempt - 2));
    let response;
    try {
      response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers });
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      continue;
    }
    if (response.ok) {
      const tag = (await response.json()).tag_name;
      if (!parse(tag ?? "")) throw new ReleaseUnreadable(`The newest release of ${repository} is tagged "${tag}", which is no version number`);
      return tag.replace(/^v/, "");
    }
    last = `${response.status} ${await response.text()}`;
    if (!(response.status >= 500 || response.status === 429 || response.status === 403)) break;
  }
  throw new ReleaseUnreadable(`The newest release of ${repository} could not be read: ${last}`);
}

async function main() {
  let latest;
  try {
    latest = await latestRelease({ token: process.env.GH_TOKEN });
  } catch (error) {
    if (!(error instanceof ReleaseUnreadable)) throw error;
    console.log(`::error::${error.message}. Not drift: run it again later.`);
    return 2;
  }
  const found = statedVersions((path) => readFileSync(join(root, path), "utf8"));
  const stale = staleness(found, latest);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `behind=${stale.length > 0}\n`);
  if (stale.length === 0) {
    console.log(`Every page that states an Apple version says ${latest}, ouro-ui-apple's newest release (${found.length} places checked).`);
    return 0;
  }
  for (const item of stale) console.log(`::error::${describe(item, latest)}`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main();
