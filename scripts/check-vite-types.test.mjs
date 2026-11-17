// Ouro check, and parts of the Ouro AX kit (its X-ray, flows and tests), run only in Node, and land in a Vite
// app's src/lib/ouro/, where the app's own tsconfig.app.json ("types": ["vite/client"]) has no Node types. The
// guides, llms.txt and the items' install messages tell a Vite app to leave those folders out of its type check;
// this proves each install fails the app's `tsc` without that line and passes with it, while what the app imports
// from the folder is still checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scratchDir } from "./scratch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The registry files an add of `names` writes into lib/ouro: theirs and their Ouro dependencies', from registry.json. */
function installedFiles(...names) {
  const items = new Map(JSON.parse(readFileSync(join(root, "registry.json"), "utf8")).items.map((item) => [item.name, item]));
  const seen = new Set();
  const visit = (each) => {
    if (seen.has(each)) return;
    assert.ok(items.has(each), `registry.json has ${each}`);
    seen.add(each);
    for (const dependency of items.get(each).registryDependencies ?? []) visit(dependency.replace(/^.*\//, "").replace(/#.*$/, ""));
  };
  for (const name of names) visit(name);
  return [...seen].flatMap((each) => items.get(each).files ?? []).map((file) => file.path).filter((path) => /^registry\/ouro\/(check|ax)\/[\w./-]+\.m?ts$/.test(path));
}

/** A Vite app's type-check project with `files` where the CLI puts them, an app file importing `imports`, and `exclude`. */
function viteApp(files, exclude, imports) {
  const app = scratchDir("ouro-node-items-vite-");
  for (const path of files) {
    const into = join(app, "src/lib/ouro", path.slice("registry/ouro/".length));
    mkdirSync(dirname(into), { recursive: true });
    cpSync(join(root, path), into);
  }
  writeFileSync(join(app, "src/main.ts"), imports ? `import { defineCommand } from "./lib/ouro/ax/command.ts";\nexport const made = defineCommand;\n` : "export {};\n");
  const config = JSON.parse(readFileSync(join(root, "test/install-fixture/tsconfig.app.json"), "utf8"));
  delete config.compilerOptions.tsBuildInfoFile;
  if (exclude) config.exclude = exclude;
  writeFileSync(join(app, "tsconfig.app.json"), JSON.stringify(config, null, 2));
  symlinkSync(join(root, "node_modules"), join(app, "node_modules"), "dir");
  return app;
}

const tsc = (app) => spawnSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.app.json", "--noEmit"], { cwd: app, encoding: "utf8" });
const documents = (files, exclude) => {
  const line = `"exclude": ${JSON.stringify(exclude).replaceAll(",", ", ")}`;
  for (const file of files) assert.ok(readFileSync(join(root, file), "utf8").includes(line), `${file} gives ${line}`);
};

test("a Vite app type-checks with Ouro check installed once its folders are left out, as the docs say, and fails without that line", () => {
  const files = installedFiles("ouro-check");
  assert.ok(files.some((path) => path.startsWith("registry/ouro/ax/")), "ouro-check installs Ouro AX files beside it");
  const without = tsc(viteApp(files));
  assert.notEqual(without.status, 0, "without the exclude, the app's tsc fails on Ouro check's Node imports");
  assert.match(without.stdout, /src\/lib\/ouro\/check\/[\w-]+\.ts\(\d+,\d+\): error TS/);
  assert.doesNotMatch(without.stdout, /src\/lib\/ouro\/ax\//, "the Ouro AX files ouro-check installs type-check in a Vite app");
  const exclude = ["src/lib/ouro/check", "src/lib/ouro/ax"];
  const withLine = tsc(viteApp(files, exclude));
  assert.equal(withLine.status, 0, withLine.stdout);
  documents(["docs/guides/guardrails.md", "site/llms.txt", "scripts/registry.mts"], exclude);
});

test("a Vite app type-checks with Ouro check, the Ouro AX kit and its tests installed once their folders are left out, still checking what it imports, and fails without that line", () => {
  const files = installedFiles("ouro-check", "ouro-ax", "ouro-ax-tests");
  const without = tsc(viteApp(files, undefined, true));
  assert.notEqual(without.status, 0, "without the exclude, the app's tsc fails on the kit's Node-only files");
  assert.match(without.stdout, /src\/lib\/ouro\/ax\/[\w.-]+\.m?ts\(\d+,\d+\): error TS/);
  const exclude = ["src/lib/ouro/check", "src/lib/ouro/ax"];
  const withLine = tsc(viteApp(files, exclude, true));
  assert.equal(withLine.status, 0, withLine.stdout);
  const broken = viteApp(files, exclude, true);
  writeFileSync(join(broken, "src/main.ts"), `import { defineCommand } from "./lib/ouro/ax/command.ts";\nexport const made: number = defineCommand;\n`);
  assert.notEqual(tsc(broken).status, 0, "an app's mistake with what it imports from the excluded folder is still a type error");
  documents(["docs/guides/ax.md", "site/llms.txt", "scripts/registry.mts"], exclude);
});
