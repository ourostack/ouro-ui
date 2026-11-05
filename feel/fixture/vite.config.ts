import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The page Ouro Feel's hosts open, built as an app would build it: the registry source compiled
// with Tailwind (app.css), in production mode, so dev-only checks cost nothing in the measures.
const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": repo } },
  build: { outDir: `${repo}.tmp/feel/page`, emptyOutDir: true },
  logLevel: "warn",
});
