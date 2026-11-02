// The one walk, and the one copy, of the repository's own folders for the scripts and tests that
// scan or copy them (registry/, site/, test/, scripts/): neither enters a folder .gitignore ignores, such as a test's scratch folder
// (registry/ouro/ax/.tmp/), which another test can make and remove while the walk is under way.
import { cpSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The folder names .gitignore ignores at any depth, from its bare `name/` lines (`.tmp`, `node_modules`, …). */
export const ignoredFolders = new Set(
  readFileSync(join(root, ".gitignore"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[^#!/*\s][^/*\s]*\/$/.test(line))
    .map((line) => line.slice(0, -1)),
);

/**
 * Every file under `dir`, at any depth, as a forward-slash path relative to it, sorted. An ignored
 * folder is never read, so one that is removed during the walk cannot fail it.
 */
export function treeFiles(dir) {
  const files = [];
  const visit = (sub) => {
    for (const entry of readdirSync(sub ? join(dir, sub) : dir, { withFileTypes: true })) {
      const path = sub ? `${sub}/${entry.name}` : entry.name;
      if (!entry.isDirectory()) files.push(path);
      else if (!ignoredFolders.has(entry.name)) visit(path);
    }
  };
  visit("");
  return files.sort();
}

/**
 * Copies `from` to `to` as `cpSync(from, to, { recursive: true })` does, leaving out the folders
 * .gitignore ignores, so a scratch folder removed during the copy cannot fail it.
 */
export function copyTree(from, to) {
  cpSync(from, to, { recursive: true, filter: (source) => source === from || !ignoredFolders.has(basename(source)) });
}
