// Ouro Current on an app on disk, as an update reaches a product: the app's files go into a GitHub in memory
// (fake-github.mjs), keepRepo opens its pull request there exactly as it does on GitHub, and the pull request's change
// is written back to the app. The install test's current variant (scripts/install-test.sh) runs it.
//
//   node scripts/current/local-update.mjs <app> --record <tag>
//       writes <app>/.github/ouro-hx-installed.json as a product's install record at <tag>: every file of the tag's
//       registry the app holds as the CLI wrote it, with the sha256 of the registry's source.
//   node scripts/current/local-update.mjs <app> --to next --registry <built registry.json>
//       updates the app to this checkout's registry (named "next"), and prints the pull request's title and notes.
//
// A tag's files come from git (`git archive <tag> registry registry.json`); "next" is this checkout's registry/ with the
// built registry.json beside it, since main commits none.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { BRANCH, keepRepo } from "./current.mjs";
import { fakeRepo } from "./fake-github.mjs";
import { readTarball } from "./tar.mjs";
import { treeFiles } from "../tree.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const RECORD = ".github/ouro-hx-installed.json";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", ["-C", root, ...args], { maxBuffer: 512 * 1024 * 1024 });

/** A tag's registry files, as a Map of path to bytes; "next" is this checkout's, with the built registry.json. */
export function registryAt(tag, builtRegistry) {
  if (tag !== "next") return readTarball(git("archive", "--format=tar.gz", "--prefix=tag/", tag, "registry", "registry.json"));
  if (!builtRegistry) throw new Error('"next" needs --registry <built registry.json> (pnpm registry, or scripts/registry.mts --out)');
  const files = new Map(treeFiles(join(root, "registry")).map((path) => [`registry/${path}`, readFileSync(join(root, "registry", path))]));
  files.set("registry.json", readFileSync(builtRegistry));
  return files;
}

/** The app's files, as Current reads a repository: without node_modules, builds and test output (scripts/tree.mjs). */
export function appFiles(app) {
  return new Map(treeFiles(app).map((path) => [path, readFileSync(join(app, path))]));
}

/**
 * A product's install record at `tag`, as products keep it: each file of the tag's registry the app holds, at the app
 * path that ends with the file's target, with the sha256 of the registry's source. The record lists what the CLI
 * installed, however the CLI rewrote it; Ouro Current decides which files it can update.
 */
export function installRecord(files, tag, registry) {
  const items = JSON.parse(registry.get("registry.json").toString("utf8")).items ?? [];
  const paths = [...files.keys()];
  const record = {};
  for (const item of items) {
    for (const file of item.files ?? []) {
      const rest = file.target?.replace(/^(@[a-z]+|~)\//, "");
      const source = registry.get(file.path);
      if (!rest || !source) continue;
      for (const path of paths) if (path === rest || path.endsWith(`/${rest}`)) record[path] = sha256(source);
    }
  }
  const sorted = Object.fromEntries(Object.keys(record).sort().map((path) => [path, record[path]]));
  return { tag, tagCommit: tag === "next" ? git("rev-parse", "HEAD").toString().trim() : git("rev-parse", `${tag}^{commit}`).toString().trim(), files: sorted };
}

/** Runs keepRepo on the app, writes its pull request's change back, and returns what it did. */
export async function updateApp(app, to, builtRegistry) {
  const files = appFiles(app);
  const repo = fakeRepo(Object.fromEntries(files));
  const sha = git("rev-parse", "HEAD").toString().trim();
  const releases = {
    web: { repo: "ourostack/ouro-ui", name: "Ouro UI", tag: to, sha, url: "https://example.test/web" },
    core: { repo: "ourostack/ouro-ui-core", name: "Ouro UI core", tag: "v0.0.0", sha: "0".repeat(40), url: "https://example.test/core" },
    apple: { repo: "ourostack/ouro-ui-apple", name: "Ouro UI for Apple", tag: "v0.0.0", sha: "0".repeat(40), url: "https://example.test/apple" },
  };
  const registries = new Map();
  const sources = {
    tarball: async (follows, tag) => {
      if (follows !== "web") throw new Error(`the app follows ${follows}, which this test does not serve`);
      if (!registries.has(tag)) registries.set(tag, registryAt(tag, builtRegistry));
      return registries.get(tag);
    },
  };
  const result = await keepRepo(repo.gh, "o/r", releases, sources);
  const changed = [];
  if (result.state === "pr") {
    const after = repo.filesAt(BRANCH);
    for (const [path, bytes] of after) {
      if (files.get(path)?.equals(bytes)) continue;
      mkdirSync(dirname(join(app, path)), { recursive: true });
      writeFileSync(join(app, path), bytes);
      changed.push(path);
    }
    for (const path of files.keys()) {
      if (after.has(path)) continue;
      rmSync(join(app, path));
      changed.push(path);
    }
  }
  return { state: result.state, reason: result.reason ?? null, title: result.pr?.title ?? null, body: repo.pulls[0]?.body ?? null, changed: changed.sort() };
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { record: { type: "string" }, to: { type: "string" }, registry: { type: "string" } } });
  const [app] = positionals;
  if (!app || Boolean(values.record) === Boolean(values.to)) throw new Error("usage: local-update.mjs <app> (--record <tag> | --to <tag|next> [--registry <built registry.json>])");
  if (values.record) {
    const record = installRecord(appFiles(app), values.record, registryAt(values.record, values.registry));
    mkdirSync(join(app, ".github"), { recursive: true });
    writeFileSync(join(app, RECORD), `${JSON.stringify(record, null, 2)}\n`);
    console.log(`${RECORD}: ${Object.keys(record.files).length} files at ${values.record}`);
    return;
  }
  const done = await updateApp(app, values.to, values.registry);
  console.log(JSON.stringify(done, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
