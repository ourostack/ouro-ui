import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
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

test("npm pack ships the generated docs, one page per component plus parts", () => {
  const files = packedFiles();
  const docs = readdirSync(join(root, "docs")).filter((file) => file.endsWith(".md"));
  assert.ok(docs.length >= 8, "docs/ holds the generated pages (run pnpm run docs)");
  for (const file of docs) assert.ok(files.includes(`docs/${file}`), `docs/${file} is missing from the package`);
  for (const file of ["docs/Button.md", "docs/Sheet.md", "docs/parts.md"]) assert.ok(files.includes(file), file);
});

test("dist/index.d.ts opens with the component catalog", () => {
  const types = readFileSync(join(root, "dist/index.d.ts"), "utf8");
  assert.match(types, /^\/\*\*\n \* Ouro UI/, "the catalog comment must come first");
  assert.match(types.slice(0, types.indexOf("*/")), / \* - \*\*Button\*\* — /);
});

test("the check script accepts this package and rejects a broken one", async () => {
  const { checkPackage } = await import("./check-package.mjs");
  assert.deepEqual(checkPackage(root), []);
  const problems = checkPackage(root, { files: ["README.md"], read: () => "export {}" });
  assert.ok(problems.some((problem) => problem.includes("dist/index.js")));
  assert.ok(problems.some((problem) => problem.includes("use client")));
  const withStory = checkPackage(root, {
    files: ["src/components/Sheet/Sheet.stories.tsx"],
    read: () => '"use client";',
  });
  assert.ok(withStory.some((problem) => problem.includes("Sheet.stories.tsx is a story")));
  const noDocs = checkPackage(root, { files: ["README.md"], read: () => '"use client";' });
  assert.ok(noDocs.some((problem) => problem.includes("docs/Button.md is missing")));
  assert.ok(noDocs.some((problem) => problem.includes("dist/index.d.ts must open with the component catalog")));
});

test("npm pack ships no screenshot baselines", () => {
  const screenshots = packedFiles().filter((path) => path.includes("__screenshots__"));
  assert.deepEqual(screenshots, [], "baselines are test data, not package contents");
});

test("npm pack ships no stories", () => {
  const stories = packedFiles().filter((path) => /\.stories\./.test(path));
  assert.deepEqual(stories, [], "stories import story-only code that does not ship");
});

test("built styles.css starts with the layer-order statement", () => {
  const css = readFileSync(join(root, "dist/styles.css"), "utf8");
  const firstStatement = css.replace(/\/\*[\s\S]*?\*\//g, "").trimStart();
  // Tailwind may first declare `properties` (its @property fallbacks), which is the
  // lowest layer and so does not change the order the app's utilities rely on.
  assert.match(
    firstStatement,
    /^(@layer properties;\s*)?@layer theme, base, components, utilities;/,
    "dist/styles.css must open with @layer theme, base, components, utilities;",
  );
});
