import assert from "node:assert/strict";
import fs, { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkDirectives } from "./install-check.mjs";
import { scratchDir } from "./scratch.mjs";
import { ignoredFolders, treeFiles } from "./tree.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const write = (dir, file, text = "") => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
};

/**
 * Runs `walk` while every listing that shows a `.tmp` folder removes it before the walk can go in,
 * as registry/ouro/ax/flows.test.mts's after() does from another test process.
 */
function removingScratchMidWalk(walk) {
  const original = fs.readdirSync;
  fs.readdirSync = function (path, options) {
    const entries = original.call(this, path, options);
    if (entries.some((entry) => (typeof entry === "string" ? entry : entry.name) === ".tmp")) rmSync(join(String(path), ".tmp"), { recursive: true, force: true });
    return entries;
  };
  syncBuiltinESMExports();
  try {
    return walk();
  } finally {
    fs.readdirSync = original;
    syncBuiltinESMExports();
  }
}

const naiveWalk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? naiveWalk(join(dir, entry.name)) : [join(dir, entry.name)]));

test("a walk of the repository's folders never enters a folder .gitignore ignores, so a test's scratch folder removed mid-walk cannot fail it", () => {
  for (const name of [".tmp", "node_modules", "dist", "coverage"]) assert.ok(ignoredFolders.has(name), `${name} is a bare folder line in .gitignore`);
  const dir = scratchDir("ouro-tree-");
  write(dir, "ouro/ax/flows.ts");
  write(dir, "ouro/ax/.tmp/flows-2546/cmd/cli.mts");
  write(dir, "ouro/components/ouro/button/button.tsx");
  write(dir, "ouro/components/ouro/button/node_modules/pkg/index.js");
  write(dir, "a.json");
  // The harness reproduces CI's failure: a walk that goes into .tmp/ finds it gone.
  assert.throws(() => removingScratchMidWalk(() => naiveWalk(dir)), { code: "ENOENT" });
  write(dir, "ouro/ax/.tmp/flows-2546/cmd/cli.mts");
  assert.deepEqual(removingScratchMidWalk(() => treeFiles(dir)), ["a.json", "ouro/ax/flows.ts", "ouro/components/ouro/button/button.tsx"]);
});

test("the install check's \"use client\" scan never reads a test's scratch folder under registry/", () => {
  const repo = scratchDir("ouro-tree-repo-");
  const app = scratchDir("ouro-tree-app-");
  const source = readFileSync(join(root, "registry/ouro/components/ouro/button/button.tsx"), "utf8");
  write(repo, "registry/ouro/components/ouro/button/button.tsx", source);
  write(app, "src/components/ouro/button/button.tsx", source.replace(/^"use client";\n\n/, ""));
  // A folder the walk cannot read stands in for one removed while the walk is under way: a walk
  // that goes into .tmp/ fails on it (CI saw ENOENT), as Node's recursive readdirSync did here.
  const cmd = join(repo, "registry/ouro/ax/.tmp/flows-2546/cmd");
  mkdirSync(cmd, { recursive: true });
  chmodSync(cmd, 0o000);
  try {
    assert.deepEqual(checkDirectives(app, repo), ['src/components/ouro/button/button.tsx lost "use client" from registry/ouro/components/ouro/button/button.tsx']);
  } finally {
    chmodSync(cmd, 0o755);
  }
});

test("every recursive walk in scripts/ of the repository's own folders goes through treeFiles (scripts/tree.mjs)", () => {
  // These walk what a run made (an installed app, timings, coverage and motion artifacts, an agent's workspace), not the repository.
  const artifacts = new Set(["scripts/install-check.mjs", "scripts/shard.mjs", "scripts/coverage-merge.mjs", "scripts/motion-coverage.mts", "scripts/agent-usability/static.mts", "scripts/agent-usability/workspace.mts"]);
  const walks = treeFiles(join(root, "scripts"))
    .filter((file) => /\.m?[jt]s$/.test(file) && !file.startsWith("agent-usability/runs/") && !file.startsWith("agent-usability/screens/"))
    .flatMap((file) =>
      readFileSync(join(root, "scripts", file), "utf8")
        .split("\n")
        .filter((line) => /readdirSync\(.*recursive: true/.test(line))
        .map((line) => ({ file: `scripts/${file}`, line: line.trim() })),
    );
  assert.deepEqual(walks.filter(({ file }) => !artifacts.has(file)), [], "walk the repository with treeFiles, which never enters a gitignored folder such as a test's .tmp/");
  const installCheck = walks.filter(({ file }) => file === "scripts/install-check.mjs");
  assert.deepEqual(installCheck.map(({ line }) => /readdirSync\(join\(app, dir\)/.test(line)), [true], "install-check.mjs walks only the installed app itself");
});
