import { defineConfig } from "tsdown";

// One config, one `clean`. Only the `index` and `parts` entry chunks carry the
// "use client" directive, because they re-export client components. The theme
// entry stays server-safe so `defineTheme` can run in a server module.
const clientChunks = new Set(["index.js", "parts.js"]);

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
  banner: (chunk) => (clientChunks.has(chunk.fileName) ? '"use client";' : ""),
});
