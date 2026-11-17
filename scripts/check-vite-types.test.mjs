// Ouro check, Ouro images and the Node-only parts of the Ouro AX kit (the X-ray, the flow runner, the surfaces check and
// their tests) run only in Node. They install under scripts/ouro/, outside the app's TypeScript project, so a Vite app's
// tsconfig.app.json (`"types": ["vite/client"]`, `"include": ["src"]`) never reads their node:* imports, process or Buffer.
// This proves each install passes the app's `tsc` where the CLI puts it, that the same files left in src fail it, and
// that what the app imports from the kit is still type-checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scratchDir } from "./scratch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The files an add of `names` writes, from registry.json, with their repository path and where the CLI puts them in an app. */
function installed(...names) {
  const items = new Map(JSON.parse(readFileSync(join(root, "registry.json"), "utf8")).items.map((item) => [item.name, item]));
  const seen = new Set();
  const visit = (each) => {
    if (seen.has(each)) return;
    assert.ok(items.has(each), `registry.json has ${each}`);
    seen.add(each);
    for (const dependency of items.get(each).registryDependencies ?? []) visit(dependency.replace(/^.*\//, "").replace(/#.*$/, ""));
  };
  for (const name of names) visit(name);
  return [...seen].flatMap((each) => items.get(each).files ?? []).map((file) => ({ from: file.path, to: file.target.replace(/^~\//, "").replace(/^@lib\//, "src/lib/") }));
}

/** A Vite app's type-check project with `files` written where given, and an app file that imports the kit wrongly if `broken`. */
function viteApp(files, broken) {
  const app = scratchDir("ouro-node-items-vite-");
  for (const { from, to } of files) {
    mkdirSync(dirname(join(app, to)), { recursive: true });
    cpSync(join(root, from), join(app, to));
  }
  mkdirSync(join(app, "src"), { recursive: true });
  writeFileSync(join(app, "src/main.ts"), broken ? `import { defineCommand } from "./lib/ouro/ax/command.ts";\nexport const made: number = defineCommand;\n` : "export {};\n");
  const config = JSON.parse(readFileSync(join(root, "test/install-fixture/tsconfig.app.json"), "utf8"));
  delete config.compilerOptions.tsBuildInfoFile;
  writeFileSync(join(app, "tsconfig.app.json"), JSON.stringify(config, null, 2));
  symlinkSync(join(root, "node_modules"), join(app, "node_modules"), "dir");
  return app;
}

const tsc = (app) => spawnSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.app.json", "--noEmit"], { cwd: app, encoding: "utf8" });

test("a Vite app type-checks with Ouro check and Ouro images installed where the CLI puts them, outside src, and fails with their Node files in src", () => {
  const files = installed("ouro-check", "ouro-images");
  assert.ok(files.some((file) => file.to.startsWith("scripts/ouro/check/")), "ouro-check installs outside src");
  assert.ok(files.some((file) => file.to.startsWith("src/lib/ouro/ax/")), "ouro-check installs the Ouro AX kit beside the lib");
  assert.equal(tsc(viteApp(files, false)).status, 0, "the app's tsc passes with no exclude");
  const inSrc = files.map((file) => ({ ...file, to: file.to.replace(/^scripts\/ouro\//, "src/lib/ouro/") }));
  const failed = tsc(viteApp(inSrc, false));
  assert.notEqual(failed.status, 0, "the same Node files in src fail the app's tsc");
  assert.match(failed.stdout, /src\/lib\/ouro\/check\/[\w-]+\.ts\(\d+,\d+\): error TS/);
});

test("a Vite app type-checks with the Ouro AX kit and its tests installed, and still checks what it imports from the kit", () => {
  const files = installed("ouro-ax", "ouro-ax-tests");
  assert.ok(files.some((file) => file.to === "scripts/ouro/ax/xray.ts"), "the X-ray installs outside src");
  assert.ok(files.some((file) => file.to === "scripts/ouro/ax/flows.test.mts"), "the flow runner's tests install outside src");
  assert.ok(files.some((file) => file.to === "src/lib/ouro/ax/command.ts"), "the shared kit installs in src");
  assert.equal(tsc(viteApp(files, false)).status, 0, "the app's tsc passes with the kit and its tests installed");
  const result = tsc(viteApp(files, true));
  assert.notEqual(result.status, 0, "an app's mistake with what it imports from the kit is still a type error");
  assert.match(result.stdout, /src\/main\.ts\(2,\d+\): error TS/);
});
