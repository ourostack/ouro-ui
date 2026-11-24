import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as ts from "./ts71.mts";
import { bundleCore } from "./core-bundle.mts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const tree = { path: "src/composed.mts", source: 'export const VERSION = "1";\n\n// Tree.\nexport const isObj = (v) => typeof v === "object";\nexport type Node = { id: string };\n' };
const app = { path: "src/mcp-app.mts", source: 'export const MIME = "text/html";\n\nimport { VERSION, type Node } from "./composed.mts";\n\nexport const result = (node: Node) => ({ VERSION, node });\n' };
const adapter = {
  path: "src/a2ui.mts",
  source: 'export const A2UI = "1.0";\n\nimport { isObj } from "./composed.mts";\n\nexport { VERSION, type Node } from "./composed.mts";\nexport { MIME } from "./mcp-app.mts";\nexport const check = (v: unknown) => isObj(v);\n',
};

test("core-bundle joins core's modules in order, with the imports between them taken out and the banner after the first statement", () => {
  const out = bundleCore([tree, app, adapter], "// Banner.");
  assert.equal(
    out,
    [
      'export const VERSION = "1";',
      "",
      "// Banner.",
      "",
      "// Tree.",
      'export const isObj = (v) => typeof v === "object";',
      "export type Node = { id: string };",
      "",
      'export const MIME = "text/html";',
      "",
      "export const result = (node: Node) => ({ VERSION, node });",
      "",
      'export const A2UI = "1.0";',
      "",
      "export const check = (v: unknown) => isObj(v);",
      "",
    ].join("\n"),
  );
  const imports = ts.importedFiles("out.ts", out);
  assert.deepEqual(imports, []);
});

test("core-bundle refuses modules that declare the same name, import a module not given, or rename a re-export", () => {
  const twice = { path: "src/a2ui.mts", source: 'export const A2UI = "1.0";\nconst isObj = 1;\n' };
  assert.throws(() => bundleCore([tree, twice], ""), /src\/a2ui\.mts and src\/composed\.mts both declare isObj/);
  const stray = { path: "src/a2ui.mts", source: 'export const A2UI = "1.0";\nimport { x } from "./other.mts";\n' };
  assert.throws(() => bundleCore([tree, stray], ""), /imports \.\/other\.mts, which is not bundled/);
  const renamed = { path: "src/a2ui.mts", source: 'export const A2UI = "1.0";\nexport { isObj as obj } from "./composed.mts";\n' };
  assert.throws(() => bundleCore([tree, renamed], ""), /under another name/);
});

test("the vendored a2ui-core.ts has no relative import, so an app needs no allowImportingTsExtensions", () => {
  const source = readFileSync(join(root, "registry/ouro/lib/ouro/a2ui-core.ts"), "utf8");
  assert.deepEqual(
    ts.importedFiles("a2ui-core.ts", source),
    [],
  );
});
