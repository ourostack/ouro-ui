import { readFileSync } from "node:fs";
import { defineConfig } from "tsdown";

// One config, one `clean`. Only the `index` and `parts` entry chunks carry the
// "use client" directive, because they re-export client components. The theme
// entry stays server-safe so `defineTheme` can run in a server module.
const clientChunks = new Set(["index.js", "parts.js"]);

// The type bundler drops src/index.ts's leading JSDoc, the component catalog that
// scripts/gen-docs.mts writes (spec section 4.9: the root index.d.ts opens with it).
// Copy it to the top of dist/index.d.ts.
const source = readFileSync(new URL("src/index.ts", import.meta.url), "utf8");
const catalog = source.slice(0, source.indexOf("*/") + 2);
if (!catalog.startsWith("/**")) throw new Error("src/index.ts must open with its catalog JSDoc (run pnpm run docs)");

function banner(fileName: string): string {
  if (fileName === "index.d.ts") return catalog;
  return clientChunks.has(fileName) ? '"use client";' : "";
}

export default defineConfig({
  entry: {
    index: "src/index.ts",
    parts: "src/parts.ts",
    "theme/index": "src/theme/index.ts",
  },
  format: "esm",
  platform: "neutral",
  dts: true,
  sourcemap: true,
  minify: false,
  clean: true,
  deps: { neverBundle: ["react", "react-dom", "motion", /^motion\//, /^@base-ui\/react/] },
  banner: (chunk) => banner(chunk.fileName),
});
