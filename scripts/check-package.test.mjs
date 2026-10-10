import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const required = [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/parts.js",
  "dist/theme/index.js",
  "dist/styles.css",
  "src/index.ts",
  "README.md",
  "LICENSE",
];

function packedFiles() {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: root,
    encoding: "utf8",
  });
  return JSON.parse(out)[0].files.map((file) => file.path);
}

test("npm pack includes the files consumers and agents need", () => {
  const files = packedFiles();
  for (const path of required) {
    assert.ok(files.includes(path), `${path} is missing from the package`);
  }
});

test("client entry chunks start with the use client directive", () => {
  for (const path of ["dist/index.js", "dist/parts.js"]) {
    const source = readFileSync(join(root, path), "utf8");
    assert.match(source, /^"use client";/, `${path} must start with "use client";`);
  }
  const theme = readFileSync(join(root, "dist/theme/index.js"), "utf8");
  assert.doesNotMatch(theme, /^"use client"/, "the theme entry must stay server-safe");
});

test("the check script accepts this package and rejects a broken one", async () => {
  const { checkPackage } = await import("./check-package.mjs");
  assert.deepEqual(checkPackage(root), []);
  const problems = checkPackage(root, { files: ["README.md"], read: () => "export {}" });
  assert.ok(problems.some((problem) => problem.includes("dist/index.js")));
  assert.ok(problems.some((problem) => problem.includes("use client")));
});

test("built styles.css starts with the layer-order statement", () => {
  const css = readFileSync(join(root, "dist/styles.css"), "utf8");
  const firstStatement = css.replace(/\/\*[\s\S]*?\*\//g, "").trimStart();
  assert.ok(
    firstStatement.startsWith("@layer theme, base, components, utilities;"),
    "dist/styles.css must open with @layer theme, base, components, utilities;",
  );
});
