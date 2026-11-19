import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { fragmentFocusScript } from "../../registry/ouro/lib/ouro/fragment-focus-script";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const registry = `${repo}registry/ouro/`;

// The Ouro components come from this repository's registry source, which an app has copied into its own
// components/ouro and lib/ouro; the aliases stand in for that copy.
// Ouro check's fragment-focus rule asks for this script first in <body>, after the stylesheets.
function fragmentFocus(): Plugin {
  return {
    name: "fragment-focus",
    transformIndexHtml: () => [{ tag: "script", children: fragmentFocusScript(), injectTo: "body-prepend" }],
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), fragmentFocus()],
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
