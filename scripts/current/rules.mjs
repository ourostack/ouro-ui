// What a repository asks of every change, declared in its own `.github/ouro-current.json` (as Dependabot reads
// `.github/dependabot.yml`), so the update pull request passes the repository's checks the first time:
//
//   {
//     "version": [{ "path": "Sources/App/Release.swift", "pattern": "static let version = \"([0-9]+\\.[0-9]+\\.[0-9]+)\"" }],
//     "changelog": { "path": "changes/ouro-ui-{version}.md", "text": "Uses {releases}.\n" },
//     "npm": "@acme/app",
//     "ignore": ["scripts/agent-benchmark/vendor/"],
//     "review": { "team": "acme/design-system" }
//   }
//
// version: files that carry the app's version, each with a pattern whose first group is the version. When the
//   repository has a published release at or past that version, the update moves every one of them to the next
//   version: the next patch, or for a prerelease such as `0.1.0-alpha.1183` the next number, `0.1.0-alpha.1184`. A
//   file may be named more than once, with a pattern for each place it carries the version.
// npm: the package the app publishes to npm. A version the registry already serves counts as released, whatever the
//   repository's latest release says, so the update starts the next version rather than adding to the published one.
// changelog: a fragment the update adds. {releases} is the releases it moves to ("Ouro UI v1.3.204"), {version} the
//   newest release's tag without the `v`, {versionSlug} the same with dashes for dots (`1-3-204`), for a repository
//   whose fragment names allow only letters, digits and dashes (ourostack/gatefold's changelog.d/). With "json": "versions", the path is instead a JSON changelog whose
//   `versions` array starts with the newest version (ourostack/ouroboros's changelog.json): the text is added to the
//   entry for the app's version, which is put first when it is not there yet.
// ignore: pin files to leave alone, each a path or a folder ending in `/`.
// review: `{ "team": "<slug>" }` (or `"<organisation>/<slug>"`) leaves auto-merge off and asks that team to review the
//   update pull request, for a repository whose governance wants a person to approve each change.

export const RULES_PATH = ".github/ouro-current.json";

const parts = (version) => String(version).replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
/** Whether version `a` is after version `b`, part by part. */
export function isAfter(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let index = 0; index < Math.max(x.length, y.length); index += 1) {
    if ((x[index] ?? 0) !== (y[index] ?? 0)) return (x[index] ?? 0) > (y[index] ?? 0);
  }
  return false;
}
/** The patch after `version`: `0.9.118` to `0.9.119`. */
export const nextPatch = (version) => {
  const [major = 0, minor = 0, patch = 0] = parts(version);
  return `${major}.${minor}.${patch + 1}`;
};
/** The version after `version`: the next prerelease number (`0.1.0-alpha.1183` to `0.1.0-alpha.1184`), else the next patch. */
export const nextVersion = (version) => {
  const pre = /^v?(\d+\.\d+\.\d+-[0-9A-Za-z-]+\.)(\d+)$/.exec(String(version));
  return pre ? `${pre[1]}${Number(pre[2]) + 1}` : nextPatch(version);
};

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (all, key) => (key in values ? values[key] : all));

/**
 * The files a repository's rules add to the update: its version moved past its latest published release, and its
 * changelog fragment. `read(path)` gives a file's text at the base commit (null when absent), `latestRelease()` the
 * repository's latest published release tag (null when it has none).
 */
export async function applyRules(rules, { read, latestRelease, published = async () => false, releases, newest }) {
  const files = {};
  const notes = [];
  let version = null;
  if (!rules) return { files, notes };
  if (Array.isArray(rules.version) && rules.version.length) {
    const texts = [];
    for (const entry of rules.version) {
      const text = await read(entry.path);
      if (text === null) throw new Error(`${RULES_PATH}: ${entry.path} is not in the repository`);
      const pattern = new RegExp(entry.pattern, "m");
      const match = pattern.exec(text);
      if (!match || match[1] === undefined) throw new Error(`${RULES_PATH}: ${entry.path} has no version matching ${entry.pattern}`);
      texts.push({ entry, pattern, match });
    }
    const current = texts[0].match[1];
    version = current;
    const latest = await latestRelease();
    const behind = Boolean(latest) && !isAfter(current, latest);
    if (behind || (typeof rules.npm === "string" && (await published(rules.npm, current)))) {
      const next = nextVersion(latest && isAfter(latest, current) ? latest : current);
      version = next;
      // Each entry is applied to the file as the entries before it left it, so one file can carry the version twice.
      for (const { entry, pattern } of texts) {
        const text = files[entry.path] ?? (await read(entry.path));
        const match = pattern.exec(text);
        const start = match.index + match[0].indexOf(match[1]);
        files[entry.path] = text.slice(0, start) + next + text.slice(start + match[1].length);
      }
      notes.push(`The app's version moves to \`${next}\`, after ${behind ? `its latest release \`${latest}\`` : `\`${current}\`, which the npm registry already serves`}, as this repository asks of a change to the app.`);
    }
  }
  if (rules.changelog?.path && typeof rules.changelog.text === "string") {
    const values = { releases, version: String(newest).replace(/^v/, ""), versionSlug: String(newest).replace(/^v/, "").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase() };
    const path = fill(rules.changelog.path, values);
    const text = fill(rules.changelog.text, values);
    if (rules.changelog.json === "versions") {
      if (!version) throw new Error(`${RULES_PATH}: a "json" changelog needs "version" files to say which version it is for`);
      const changelog = JSON.parse((await read(path)) ?? "null");
      if (!Array.isArray(changelog?.versions)) throw new Error(`${RULES_PATH}: ${path} has no versions array`);
      const top = changelog.versions[0]?.version === version ? changelog.versions[0] : null;
      const entry = top ?? { version, changes: [] };
      if (!top) changelog.versions.unshift(entry);
      if (!Array.isArray(entry.changes)) entry.changes = [];
      if (!entry.changes.includes(text)) entry.changes.push(text);
      files[path] = `${JSON.stringify(changelog, null, 2)}\n`;
      notes.push(`It adds what it changes to \`${version}\` in \`${path}\`, as this repository asks.`);
    } else {
      files[path] = text;
      notes.push(`It adds the changelog fragment \`${path}\` this repository asks for.`);
    }
  }
  return { files, notes };
}

/**
 * Whether the repository's rules leave a pin file alone (`"ignore": ["scripts/agent-benchmark/vendor/"]`): a path, or
 * a folder ending in `/` and everything under it. A copy pinned on purpose, such as a benchmark's, stays where it is.
 */
export function isIgnored(rules, path) {
  if (!Array.isArray(rules?.ignore)) return false;
  return rules.ignore.some((entry) => typeof entry === "string" && (entry === path || (entry.endsWith("/") && path.startsWith(entry))));
}

/**
 * The team a repository's rules ask to review every update (`"review": { "team": "acme/design-system" }`), as the slug
 * GitHub's review request takes, or null when the repository merges updates on its own. The organisation, when
 * written, must be the repository's owner, since a team reviews only inside its own organisation.
 */
export function reviewTeam(rules, owner) {
  if (rules?.review === undefined) return null;
  const team = rules.review?.team;
  const [org, slug, ...extra] = typeof team === "string" ? (team.includes("/") ? team.split("/") : [owner, team]) : [];
  if (!slug || extra.length || !/^[A-Za-z0-9_.-]+$/.test(slug)) throw new Error(`${RULES_PATH}: "review" needs a "team", a team slug such as "design-system" or "${owner}/design-system"`);
  if (org.toLowerCase() !== String(owner).toLowerCase()) throw new Error(`${RULES_PATH}: the review team ${team} is not in ${owner}, which owns this repository`);
  return slug;
}
