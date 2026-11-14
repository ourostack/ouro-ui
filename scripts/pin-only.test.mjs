import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isPinFile } from "./pin-only.mjs";
import { latestRelease } from "./latest-release.mjs";
import { scratchDir } from "./scratch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts/pin-only.mjs");

const git = (dir, args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();

/** A repository whose commits are written by `commit`, each a set of files at their new text. */
function repository() {
  const dir = scratchDir("ouro-pin-only-");
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "maintainer@example.com"]);
  git(dir, ["config", "user.name", "Maintainer"]);
  return dir;
}

function commit(dir, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "--allow-empty", "-m", "change"]);
  return git(dir, ["rev-parse", "HEAD"]);
}

const packageJson = (tag, extra = {}) => `${JSON.stringify({ name: "ouro-ui", description: `Install: npx shadcn@latest add ourostack/ouro-ui/<item>#${tag}`, ...extra, ouro: { latestRelease: tag } }, null, 2)}\n`;

const base = {
  "package.json": packageJson("v1.3.17"),
  "README.md": "Install `ourostack/ouro-ui/dialog#v1.3.17`.\n",
  "docs/guides/install.md": "Add `@v1.3.17` to the registry.\n",
  "docs/decisions/0001.md": "Shipped at v1.2.0, as history.\n",
  "registry/ouro/lib/ouro/dev.ts": 'export const add = "npx shadcn@latest add ourostack/ouro-ui/ouro-base#v1.3.17";\n',
  "src/app.ts": "export const count = 1;\n",
};

/** The commits `pnpm run docs` makes after `set v1.3.56`: the pin and each file that names it. */
const pin = {
  "package.json": packageJson("v1.3.56"),
  "README.md": "Install `ourostack/ouro-ui/dialog#v1.3.56`.\n",
  "docs/guides/install.md": "Add `@v1.3.56` to the registry.\n",
  "registry/ouro/lib/ouro/dev.ts": 'export const add = "npx shadcn@latest add ourostack/ouro-ui/ouro-base#v1.3.56";\n',
};

/** Runs the script on `head` against its parent, with the reasons it prints. */
function classify(dir, head) {
  const result = spawnSync(process.execPath, [script, `${head}^`, head], { cwd: dir, encoding: "utf8" });
  return { status: result.status, reasons: result.stderr.trim() };
}

/** The result of the pin commit with `changes` applied over the pin's files. */
function classifyPin(changes = {}) {
  const dir = repository();
  commit(dir, base);
  return classify(dir, commit(dir, { ...pin, ...changes }));
}

test("a pin changes package.json's release and description, and the version literals of the files that name it", () => {
  assert.deepEqual(classifyPin(), { status: 0, reasons: "" });
});

test("a pin that also changes any other word, package.json field or file is not a pin", () => {
  assert.match(classifyPin({ "README.md": "Install `ourostack/ouro-ui/dialog#v1.3.56` now.\n" }).reasons, /README\.md changes more than a version literal/);
  assert.match(classifyPin({ "package.json": packageJson("v1.3.56", { name: "other" }) }).reasons, /package\.json changes more than ouro\.latestRelease and description/);
  assert.match(classifyPin({ "src/app.ts": "export const count = 2;\n" }).reasons, /src\/app\.ts is not a file the docs pin changes/);
  assert.match(classifyPin({ "docs/decisions/0001.md": "Shipped at v1.3.56, as history.\n" }).reasons, /docs\/decisions\/0001\.md is not a file the docs pin changes/);
  assert.match(classifyPin({ "registry/ouro/lib/ouro/dev.ts": 'export const add = "npx shadcn@latest add ourostack/ouro-ui/ouro-base#v1.3.56 --dry";\n' }).reasons, /dev\.ts changes more than a version literal/);
});

test("a commit that moves no pin, or changes no file, is not a pin", () => {
  const dir = repository();
  commit(dir, base);
  const literalOnly = commit(dir, { "README.md": "Install `ourostack/ouro-ui/dialog#v1.3.18`.\n" });
  assert.deepEqual(classify(dir, literalOnly), { status: 1, reasons: "not a docs pin: package.json is not changed on both sides, so it holds no pin" });
  const empty = commit(dir, {});
  assert.deepEqual(classify(dir, empty), { status: 1, reasons: "not a docs pin: the commit changes no file" });
});

test("every tracked file that pnpm run docs writes the release into is one a docs pin may change", () => {
  const tag = latestRelease();
  const names = new RegExp(`[#@]${tag.replaceAll(".", "\\.")}(?!\\d)`);
  // The generator's surfaces; scripts/model-reviews holds recorded transcripts, which name old releases on purpose.
  const generated = (path) => (path === "README.md" || path === "site/llms.txt" || path.startsWith("docs/") || path.startsWith("registry/")) && !path.startsWith("docs/decisions/");
  const tracked = git(root, ["ls-files"]).split("\n").filter((path) => generated(path) && path !== "package.json");
  const outside = tracked.filter((path) => names.test(readFileSync(join(root, path), "utf8")) && !isPinFile(path));
  assert.deepEqual(outside, [], `Make isPinFile in scripts/pin-only.mjs cover these, which name ${tag} and that pnpm run docs writes.`);
});
