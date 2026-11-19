// The newest released tag has one source: `ouro.latestRelease` in package.json. Everything
// that names it reads it from there:
//
// - gen-docs.mts writes it into the install commands in README.md, site/public/llms.txt and
//   package.json's description, and into the command lib/ouro/dev.ts prints when an app has
//   no ouro-base and its exact-message test, and fills UPGRADING.md's {{latestRelease}} placeholder in
//   the README copy of the note;
// - the site imports it (site/src/release.ts);
// - pages.yml builds the @ouro namespace (/r/) from that tag;
// - release.yml fills the placeholder with the tag it cuts, then updates the field in the
//   "Prepare main for the next release" PR.
//
// `releaseMismatches` is the check: every #vX.Y.Z or @vX.Y.Z literal in the docs must name
// the source's tag (scripts/latest-release.test.mjs, and `pnpm run docs --check`).
//
//   node scripts/latest-release.mjs           print the tag
//   node scripts/latest-release.mjs set <tag> set the tag in package.json
//   node scripts/latest-release.mjs check     list the docs' literals that name another tag; exit 1 if any
// docs-pin.yml runs `check` on each push to main, and the pin job points the docs at the tag when it fails.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** UPGRADING.md's stand-in for the tag, filled in wherever the note is shown. */
export const PLACEHOLDER = "{{latestRelease}}";

/** Files whose install commands name the tag; gen-docs keeps them in step. */
export const syncedFiles = ["README.md", "site/llms.txt", "package.json", "docs/guides/installing.md", "docs/guides/testing.md", "docs/guides/forms.md", "docs/guides/guardrails.md", "docs/guides/theming.md", "docs/guides/ax.md", "docs/guides/ax-conformance.md", "docs/guides/ax-adopt.md", "registry/ouro/lib/ouro/dev.ts", "registry/ouro/lib/ouro/dev.test.ts"];

const literal = /([#@])v\d+\.\d+\.\d+\b/g;

/** The newest released tag, such as "v0.3.0", from package.json. */
export function latestRelease(dir = root) {
  const tag = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).ouro?.latestRelease;
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "")) throw new Error(`package.json ouro.latestRelease must be a tag such as v0.3.0 (got ${tag}).`);
  return tag;
}

/** `text` with every #vX.Y.Z and @vX.Y.Z literal naming `tag`. */
export function withRelease(text, tag) {
  return text.replace(literal, (_, mark) => `${mark}${tag}`);
}

/** `text` with UPGRADING.md's placeholder replaced by `tag`. */
export function fillPlaceholder(text, tag) {
  return text.replaceAll(PLACEHOLDER, tag);
}

/** Literals in `text` that name another tag than `tag`, as "line: literal". */
export function releaseMismatches(text, tag) {
  const problems = [];
  text.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(literal)) {
      if (match[0].slice(1) !== tag) problems.push(`${index + 1}: ${match[0]}`);
    }
  });
  return problems;
}

/** The public docs whose tag literals the release test and `check` read. */
export const publicDocGlobs = ["README.md", "changes/*.md", "package.json", "docs/*.md", "site/public/*", "site/src/*.ts", "site/src/*.tsx", "site/index.html"];

/** The tracked files that match publicDocGlobs. */
export function publicDocs(dir = root) {
  return execFileSync("git", ["ls-files", "--", ...publicDocGlobs], { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n").filter(Boolean);
}

/** The literals in `paths` (relative to `dir`) that name another tag than ouro.latestRelease, as "path:line: literal". */
export function staleReferences(paths, dir = root) {
  const tag = latestRelease(dir);
  return paths.flatMap((path) => releaseMismatches(readFileSync(join(dir, path), "utf8"), tag).map((problem) => `${path}:${problem}`));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, tag] = process.argv.slice(2);
  if (mode === "set") {
    if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "")) throw new Error("usage: latest-release.mjs set v<x.y.z>");
    const path = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(path, "utf8"));
    pkg.ouro = { ...pkg.ouro, latestRelease: tag };
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  } else if (mode === "check") {
    const stale = staleReferences(publicDocs());
    for (const line of stale) console.log(line);
    if (stale.length > 0) console.log(`Name ${latestRelease()} (package.json ouro.latestRelease), or run pnpm run docs.`);
    process.exitCode = stale.length === 0 ? 0 : 1;
  } else {
    console.log(latestRelease());
  }
}
