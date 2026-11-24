import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { squircleCorners } from "../../registry/ouro/lib/ouro/squircle-corners.ts";

// The nav lab: five header mockups, built apart from the site so its build and its pages stay as they are.
// `NAV_LAB_BASE` is where it is served (the preview repository's Pages path).
const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: process.env.NAV_LAB_BASE ?? "/",
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react(), tailwindcss()],
  css: { postcss: { plugins: [squircleCorners()] } },
  resolve: { alias: { "@": repo } },
  define: { "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production") },
  build: { outDir: fileURLToPath(new URL("../../.tmp/nav-lab", import.meta.url)), emptyOutDir: true },
});
