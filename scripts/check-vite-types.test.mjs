// Ouro check runs in Node, and lands in a Vite app's src/lib/ouro/check/, where the app's own
// tsconfig.app.json ("types": ["vite/client"]) has no Node types. The guide, llms.txt and the
// item's install message tell a Vite app to leave the folder out of its type check; this proves
// that the folder fails the app's `tsc` without that line and passes with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scratchDir } from "./scratch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXCLUDE = '"exclude": ["src/lib/ouro/check"]';

/** The registry files an add of `name` writes into lib/ouro: its own and its Ouro dependencies', from registry.json. */
function installedFiles(name) {
  const items = new Map(JSON.parse(readFileSync(join(root, "registry.json"), "utf8")).items.map((item) => [item.name, item]));
  const seen = new Set();
  const visit = (each) => {
    if (seen.has(each)) return;
    seen.add(each);
    for (const dependency of items.get(each)?.registryDependencies ?? []) visit(dependency.replace(/^.*\//, "").replace(/#.*$/, ""));
  };
  visit(name);
  return [...seen].flatMap((each) => items.get(each)?.files ?? []).map((file) => file.path).filter((path) => /^registry\/ouro\/(check|ax)\/[\w-]+\.ts$/.test(path));
}

/** A Vite app's type-check project with Ouro check and the Ouro AX kit installed where the CLI puts them. */
function viteAppWithCheck(exclude) {
  const app = scratchDir("ouro-check-vite-");
  for (const path of installedFiles("ouro-check")) {
    const into = join(app, "src/lib/ouro", path.slice("registry/ouro/".length));
    mkdirSync(dirname(into), { recursive: true });
    cpSync(join(root, path), into);
  }
  writeFileSync(join(app, "src/main.ts"), "export {};\n");
  const config = JSON.parse(readFileSync(join(root, "test/install-fixture/tsconfig.app.json"), "utf8"));
  delete config.compilerOptions.tsBuildInfoFile;
  if (exclude) Object.assign(config, JSON.parse(`{${EXCLUDE}}`));
  writeFileSync(join(app, "tsconfig.app.json"), JSON.stringify(config, null, 2));
  symlinkSync(join(root, "node_modules"), join(app, "node_modules"), "dir");
  return app;
}

const tsc = (app) => spawnSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.app.json", "--noEmit"], { cwd: app, encoding: "utf8" });

test("a Vite app type-checks with Ouro check installed once its folder is left out, as the docs say, and fails without that line", () => {
  assert.ok(installedFiles("ouro-check").some((path) => path.startsWith("registry/ouro/ax/")), "ouro-check installs Ouro AX files beside it");
  const without = tsc(viteAppWithCheck(false));
  assert.notEqual(without.status, 0, "without the exclude, the app's tsc fails on Ouro check's Node imports");
  assert.match(without.stdout, /src\/lib\/ouro\/check\/[\w-]+\.ts\(\d+,\d+\): error TS/);
  assert.doesNotMatch(without.stdout, /src\/lib\/ouro\/ax\//, "the Ouro AX kit itself type-checks in a Vite app");
  const withLine = tsc(viteAppWithCheck(true));
  assert.equal(withLine.status, 0, withLine.stdout);
  for (const file of ["docs/guides/guardrails.md", "site/llms.txt", "scripts/registry.mts"]) {
    assert.ok(readFileSync(join(root, file), "utf8").includes(EXCLUDE), `${file} gives the line`);
  }
});
