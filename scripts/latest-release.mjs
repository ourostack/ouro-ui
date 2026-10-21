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
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** UPGRADING.md's stand-in for the tag, filled in wherever the note is shown. */
export const PLACEHOLDER = "{{latestRelease}}";

/** Files whose install commands name the tag; gen-docs keeps them in step. */
export const syncedFiles = ["README.md", "site/public/llms.txt", "package.json", "docs/guides/installing.md", "docs/guides/testing.md", "docs/guides/forms.md", "docs/guides/guardrails.md", "registry/ouro/lib/ouro/dev.ts", "registry/ouro/lib/ouro/dev.test.ts"];

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, tag] = process.argv.slice(2);
  if (mode === "set") {
    if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "")) throw new Error("usage: latest-release.mjs set v<x.y.z>");
    const path = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(path, "utf8"));
    pkg.ouro = { ...pkg.ouro, latestRelease: tag };
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  } else {
    console.log(latestRelease());
  }
}
