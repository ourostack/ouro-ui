import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { treeFiles } from "./tree.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// A package the browser tests import that vitest.config.ts does not pre-bundle is found while the run is under way, and
// Vite then re-optimizes and reloads the page, which can load React twice for one file (issue #4220).
const prebundled = (specifier) => specifier.startsWith("@base-ui/react/") ? specifier !== "@base-ui/react/types" : ["clsx", "tailwind-merge", "react-dom/client", "react-dom/server"].includes(specifier);

test("vitest.config.ts pre-bundles every Base UI entry point and helper package the registry's files import", () => {
  const config = readFileSync(join(root, "vitest.config.ts"), "utf8");
  const listed = new Set([...config.slice(config.indexOf("include: [")).split("],")[0].matchAll(/"([^"]+)"/g)].map((match) => match[1]));
  const imported = new Set();
  for (const folder of ["registry", "test"]) {
    for (const file of treeFiles(join(root, folder)).filter((name) => /\.tsx?$/.test(name))) {
      for (const match of readFileSync(join(root, folder, file), "utf8").matchAll(/^import (?!type )[^;]*?from "([^"]+)"/gms)) if (prebundled(match[1])) imported.add(match[1]);
    }
  }
  assert.deepEqual([...imported].filter((specifier) => !listed.has(specifier)).sort(), []);
});
