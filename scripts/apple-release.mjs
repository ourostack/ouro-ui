// The Apple version this repository states, against ouro-ui-apple's newest release, so ui.ouroboros.bot
// cannot go on saying 0.2.1 after 0.4.1 is out. It reads the version from every place that states one
// (the site's Apple pages through site/src/apple/kit.json, and the Platforms pages in docs/platforms),
// asks GitHub for the newest release, and fails when any of them names another.
//
//   node scripts/apple-release.mjs                 needs network; GH_TOKEN optional on a public repository.
//   node scripts/apple-release.mjs --base <dir>    on a pull request, with the base branch checked out at <dir>.
//   Exits 1 when a page states another version (and writes behind=true to GITHUB_OUTPUT), 2 when GitHub
//   cannot be read, which is no drift. On a pull request, judge() decides: a fresh release only warns.
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
  if (kind === "behind") return `${where} says ${version}, and ouro-ui-apple's newest release is ${latest}. Update the Apple pages to ${latest}, then pin it with node scripts/platform-versions.mjs --apple v${latest}.`;
  return `${where} says ${version}, which is newer than ouro-ui-apple's newest release (${latest}). State only a release that exists.`;
}

/** GitHub could not be read: the API failed, which is not drift. */
export class ReleaseUnreadable extends Error {
  name = "ReleaseUnreadable";
}

/**
 * ouro-ui-apple's newest release from the API (GET /repos/{repository}/releases/latest), as { version, publishedAt }, asked
 * up to `attempts` times, `delayMs` apart and doubling, after a network failure, a server error or a rate limit (403 or 429).
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
      const release = await response.json();
      if (!parse(release.tag_name ?? "")) throw new ReleaseUnreadable(`The newest release of ${repository} is tagged "${release.tag_name}", which is no version number`);
      if (!Date.parse(release.published_at ?? "")) throw new ReleaseUnreadable(`The newest release of ${repository} has no publication time`);
      return { version: release.tag_name.replace(/^v/, ""), publishedAt: release.published_at };
    }
    last = `${response.status} ${await response.text()}`;
    if (!(response.status >= 500 || response.status === 429 || response.status === 403)) break;
  }
  throw new ReleaseUnreadable(`The newest release of ${repository} could not be read: ${last}`);
}

/**
 * When the pin's lag began: the publication time of the oldest release newer than the oldest version a behind statement
 * states (`releases` as { version, publishedAt }), so a newer release never resets the clock. Falls back to `fallback`.
 */
export function lagStart(releases, stale, fallback) {
  const behind = stale.filter((item) => item.kind === "behind" && parse(item.version)).map((item) => item.version);
  if (behind.length === 0) return fallback;
  const oldest = behind.reduce((a, b) => (compare(a, b) <= 0 ? a : b));
  const newer = releases.filter((r) => parse(r.version) && Date.parse(r.publishedAt) && compare(r.version, oldest) > 0);
  if (newer.length === 0) return fallback;
  return newer.reduce((a, b) => (compare(a.version, b.version) <= 0 ? a : b)).publishedAt;
}

/** ouro-ui-apple's published releases as { version, publishedAt }; [] when they cannot be read. */
export async function listReleases({ fetch = globalThis.fetch, token, repository = REPOSITORY } = {}) {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=50`, { headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    if (!response.ok) return [];
    return (await response.json()).filter((r) => !r.draft && !r.prerelease).map((r) => ({ version: String(r.tag_name ?? "").replace(/^v/, ""), publishedAt: r.published_at }));
  } catch {
    return [];
  }
}

/** How long a behind pin may stay a warning after the newest release came out, on a pull request and on main. */
export const LAG_LIMIT_MS = 2 * 60 * 60 * 1000;

/**
 * What the check says and whether it fails. On main, a statement behind the newest release is a warning until LAG_LIMIT_MS
 * after it came out, and then fails the check (and files the issue the workflow opens): the pin workflow has had its window.
 * Anything else that is stale (`ahead` or `unreadable`) fails at once. On a pull request a statement fails it when the pull
 * request makes it wrong (`ahead` or `unreadable`, or behind where the base is not), and a statement that is behind on the base
 * too is main's lag: a warning until the newest release is over LAG_LIMIT_MS old, then a failure, since the pin pull request
 * should have landed it by then. Without `baseStale` every behind statement is the pull request's own.
 */
export function judge({ event, latest, stale, baseStale, publishedAt, now = Date.now() }) {
  const age = now - Date.parse(publishedAt);
  const hours = (age / 3_600_000).toFixed(1);
  if (event !== "pull_request") {
    const grace = stale.length > 0 && stale.every((item) => item.kind === "behind") && age <= LAG_LIMIT_MS;
    const messages = stale.map((item) => ({
      level: grace ? "warning" : "error",
      text: grace ? `${describe(item, latest)} The newest release came out ${hours} hours ago, so the pin has until two hours after it, and no issue is filed before then.` : describe(item, latest),
    }));
    return { fail: stale.length > 0 && !grace, messages };
  }
  const behindOnBase = new Set((baseStale ?? []).filter((item) => item.kind === "behind").map((item) => item.where));
  const own = stale.filter((item) => item.kind !== "behind" || !behindOnBase.has(item.where));
  const lag = stale.filter((item) => !own.includes(item));
  const messages = own.map((item) => ({ level: "error", text: describe(item, latest) }));
  if (lag.length > 0) {
    const where = lag.map((item) => item.where).join("; ");
    if (age > LAG_LIMIT_MS) {
      messages.push({ level: "error", text: `main has been behind ouro-ui-apple's newest release, ${latest}, for ${hours} hours (since it came out at ${publishedAt}), more than 2: ${where}. The Apple pin pull request (kit-pin.yml) should have landed it; check that workflow.` });
    } else {
      messages.push({ level: "warning", text: `main is behind ouro-ui-apple's newest release, ${latest}, which came out ${hours} hours ago: ${where}. The Apple pin pull request will catch it up, so this pull request is not held for it.` });
    }
  }
  return { fail: messages.some((message) => message.level === "error"), messages };
}

async function main(args) {
  let release;
  try {
    release = await latestRelease({ token: process.env.GH_TOKEN });
  } catch (error) {
    if (!(error instanceof ReleaseUnreadable)) throw error;
    console.log(`::error::${error.message}. Not drift: run it again later.`);
    return 2;
  }
  const latest = release.version;
  const found = statedVersions((path) => readFileSync(join(root, path), "utf8"));
  const stale = staleness(found, latest);
  const baseAt = args.indexOf("--base");
  let baseStale;
  if (baseAt !== -1) {
    try {
      baseStale = staleness(statedVersions((path) => readFileSync(join(args[baseAt + 1], path), "utf8")), latest);
    } catch (error) {
      console.log(`::notice::The base branch's pages could not be read (${error.message}), so every stale statement is held against this pull request.`);
    }
  }
  const verdict = judge({ event: process.env.GITHUB_EVENT_NAME, latest, stale, baseStale, publishedAt: lagStart(await listReleases({ token: process.env.GH_TOKEN }), stale, release.publishedAt), now: Date.now() });
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `behind=${verdict.fail}\n`);
  for (const message of verdict.messages) console.log(`::${message.level}::${message.text}`);
  if (verdict.fail) return 1;
  if (stale.length === 0) console.log(`Every page that states an Apple version says ${latest}, ouro-ui-apple's newest release (${found.length} places checked).`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
