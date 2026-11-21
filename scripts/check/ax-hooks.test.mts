import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { dir, root } from "./kit.mts";

// The check's resolver (registry/ouro/check/ax-hooks.ts, registered by register.ts): #ouro-ax/<file> resolves to the app's
// own kit when package.json has no imports entry for it, so the check runs in an app as the CLI installs it.

const register = pathToFileURL(join(root, "registry/ouro/check/check-register.ts")).href;
const node = (cwd: string, args: string[]) => spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
const MOVED = ["xray.ts", "flows.ts", "surfaces.ts"];

/** An app's folder: a package.json with no imports entry, and the files given, by path from the folder. */
function app(files: Record<string, string>): string {
  const path = dir("ax-hooks");
  writeFileSync(join(path, "package.json"), `{ "type": "module" }\n`);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(path, name)), { recursive: true });
    writeFileSync(join(path, name), text);
  }
  return path;
}

test("the check finds the app's Ouro AX kit through components.json and the tsconfig paths, with no imports entry", () => {
  const path = app({
    "components.json": `{ "aliases": { "lib": "@/lib" } }\n`,
    // tsconfig.json may hold comments and trailing commas.
    "tsconfig.json": `{\n  // the app\n  "compilerOptions": { "paths": { "@/*": ["./src/*"], }, },\n}\n`,
    "src/lib/ouro/ax/answer.ts": `export const answer = "answered";\n`,
    "run.mjs": `import ${JSON.stringify(register)};\nconsole.log((await import("#ouro-ax/answer.ts")).answer);\n`,
  });
  const result = node(path, ["run.mjs"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "answered\n");
});

test("without a components.json, the check names the package.json imports line to add", () => {
  const path = app({ "run.mjs": `import ${JSON.stringify(register)};\nawait import("#ouro-ax/answer.ts");\n` });
  const result = node(path, ["run.mjs"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\[ouro-ui\] Ouro check: #ouro-ax\/answer\.ts is not in package\.json "imports"/);
  assert.match(result.stderr, /"#ouro-ax\/\*": "\.\/src\/lib\/ouro\/ax\/\*"/);
});

test("the check runs as a command in an app with no imports entry for the kit", () => {
  const path = app({
    "components.json": `{ "aliases": { "lib": "@/lib" } }\n`,
    "tsconfig.json": `{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }\n`,
  });
  // Where the CLI installs the check and the shared kit: the check under scripts/ouro/, the kit beside the app's lib.
  mkdirSync(join(path, "scripts/ouro/check"), { recursive: true });
  for (const name of readdirSync(join(root, "registry/ouro/check"))) copyFileSync(join(root, "registry/ouro/check", name), join(path, "scripts/ouro/check", name));
  mkdirSync(join(path, "src/lib/ouro/ax"), { recursive: true });
  for (const name of readdirSync(join(root, "registry/ouro/ax")).filter((file) => file.endsWith(".ts") && !MOVED.includes(file))) {
    copyFileSync(join(root, "registry/ouro/ax", name), join(path, "src/lib/ouro/ax", name));
  }
  const result = node(path, ["scripts/ouro/check/check.ts", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ouro-check/);
});
