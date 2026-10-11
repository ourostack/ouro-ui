import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The landing page and docs site, built from the repository's own dependencies (no
// package of its own). Pages serves it at https://ourostack.github.io/ouro-ui/.
// `pnpm site:build` builds the client, then a server bundle that prerenders every route
// to static HTML (site/scripts/prerender.mts), so each docs URL is readable without
// JavaScript, by people and by agents.
const repo = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/ouro-ui/",
  plugins: [react(), tailwindcss()],
  // `@/` is the repo root, as in the registry source, so the site imports components the
  // way an app's components.json alias does.
  resolve: { alias: { "@": repo } },
  server: { fs: { allow: [repo] } },
  build: { outDir: "dist", emptyOutDir: true },
});
