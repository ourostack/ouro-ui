import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The landing page and docs site, built from the repository's own dependencies (no
// package of its own). Pages serves it at https://ourostack.github.io/ouro-ui/.
// `pnpm site:build` builds the client, then a server bundle that prerenders every route
// to static HTML (site/scripts/prerender.mts), so each docs URL is readable without
// JavaScript, by people and by agents.
const repo = fileURLToPath(new URL("..", import.meta.url));

/** Build-only attribution, without publishing absolute machine or dependency-cache paths. */
export function chunkEvidence(root: string): Plugin {
  const prefix = `${root.replaceAll("\\", "/").replace(/\/$/, "")}/`;
  const sourceName = (id: string) => {
    const path = id.replace(/^\0/, "").replaceAll("\\", "/");
    const dependency = path.lastIndexOf("/node_modules/");
    if (dependency !== -1) return path.slice(dependency + 1);
    if (path.startsWith(prefix)) return path.slice(prefix.length);
    if (path.startsWith("/") || /^[A-Za-z]:\//.test(path)) throw new Error("Build evidence cannot publish a module outside the source/dependency roots");
    return path;
  };
  return {
    name: "site-chunk-evidence",
    apply: "build",
    generateBundle(_options, bundle) {
      const modules = Object.fromEntries(Object.values(bundle).flatMap((chunk) =>
        chunk.type === "chunk" ? [[chunk.fileName, Object.keys(chunk.modules).map(sourceName).sort()]] : [],
      ));
      this.emitFile({ type: "asset", fileName: ".vite/chunk-modules.json", source: JSON.stringify(modules) });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/ouro-ui/",
  plugins: [react(), tailwindcss(), chunkEvidence(repo)],
  // `@/` is the repo root, as in the registry source, so the site imports components the
  // way an app's components.json alias does.
  resolve: { alias: { "@": repo } },
  server: { fs: { allow: [repo] } },
  build: { outDir: "dist", emptyOutDir: true, manifest: true },
});
