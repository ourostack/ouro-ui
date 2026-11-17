// What a repository asks of every change, declared in its own `.github/ouro-current.json` (as Dependabot reads
// `.github/dependabot.yml`), so the update pull request passes the repository's checks the first time:
//
//   {
//     "version": [{ "path": "Sources/App/Release.swift", "pattern": "static let version = \"([0-9]+\\.[0-9]+\\.[0-9]+)\"" }],
//     "changelog": { "path": "changes/ouro-ui-{version}.md", "text": "Uses {releases}.\n" },
//     "ignore": ["scripts/agent-benchmark/vendor/"]
//   }
//
// version: files that carry the app's version, each with a pattern whose first group is the version. When the
//   repository has a published release at or past that version, the update moves every one of them to the next patch.
// changelog: a fragment the update adds. {releases} is the releases it moves to ("Ouro UI v1.3.204"), {version} the
//   newest release's tag without the `v`.
// ignore: pin files to leave alone, each a path or a folder ending in `/`.

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

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (all, key) => (key in values ? values[key] : all));

/**
 * The files a repository's rules add to the update: its version moved past its latest published release, and its
 * changelog fragment. `read(path)` gives a file's text at the base commit (null when absent), `latestRelease()` the
 * repository's latest published release tag (null when it has none).
 */
export async function applyRules(rules, { read, latestRelease, releases, newest }) {
  const files = {};
  const notes = [];
  if (!rules) return { files, notes };
  if (Array.isArray(rules.version) && rules.version.length) {
    const texts = [];
    for (const entry of rules.version) {
      const text = await read(entry.path);
      if (text === null) throw new Error(`${RULES_PATH}: ${entry.path} is not in the repository`);
      const pattern = new RegExp(entry.pattern, "m");
      const match = pattern.exec(text);
      if (!match || match[1] === undefined) throw new Error(`${RULES_PATH}: ${entry.path} has no version matching ${entry.pattern}`);
      texts.push({ entry, text, pattern, match });
    }
    const current = texts[0].match[1];
    const latest = await latestRelease();
    if (latest && !isAfter(current, latest)) {
      const next = nextPatch(isAfter(latest, current) ? latest : current);
      for (const { entry, text, match } of texts) {
        const start = match.index + match[0].indexOf(match[1]);
        files[entry.path] = text.slice(0, start) + next + text.slice(start + match[1].length);
      }
      notes.push(`The app's version moves to \`${next}\`, after its latest release \`${latest}\`, as this repository asks of a change to the app.`);
    }
  }
  if (rules.changelog?.path && typeof rules.changelog.text === "string") {
    const values = { releases, version: String(newest).replace(/^v/, "") };
    const path = fill(rules.changelog.path, values);
    files[path] = fill(rules.changelog.text, values);
    notes.push(`It adds the changelog fragment \`${path}\` this repository asks for.`);
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
