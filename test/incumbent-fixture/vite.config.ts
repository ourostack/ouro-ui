import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const registry = `${repo}registry/ouro/`;

// The Ouro components come from this repository's registry source, which an app has copied into its own
// components/ouro and lib/ouro; the aliases stand in for that copy.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@/registry/ouro/", replacement: registry },
      { find: "~/components/ouro/", replacement: `${registry}components/ouro/` },
      { find: "~/lib/ouro/", replacement: `${registry}lib/ouro/` },
      { find: "~", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
    dedupe: ["react", "react-dom"],
  },
  server: { fs: { allow: [repo] } },
  build: {
    rollupOptions: { input: { index: "index.html", billing: "billing.html" } },
  },
});
