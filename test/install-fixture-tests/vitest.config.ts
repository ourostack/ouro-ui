import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";
import { ouroTestProjects } from "./src/lib/ouro/testing/vitest.ts";

// A dependency found mid-run reloads the page and drops the next test file, so bundle it up front.
export default mergeConfig(
  viteConfig,
  defineConfig({
    optimizeDeps: { include: ["class-variance-authority"] },
    test: { projects: ouroTestProjects({ css: "./src/index.css" }) },
  }),
);
