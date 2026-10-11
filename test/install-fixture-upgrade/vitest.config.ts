import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";
import { ouroTestProjects } from "./src/lib/ouro/testing/vitest.ts";

// An app on v0.1.0 with tests of its own (src/app/*.spec.ts, named so this repository's
// test projects skip them): its project runs beside Ouro UI's.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        { extends: true, test: { name: "app", include: ["src/app/**/*.spec.ts"] } },
        ...ouroTestProjects({ css: "./src/index.css" }),
      ],
    },
  }),
);
