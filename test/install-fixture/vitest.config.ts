import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";
import { ouroTestProjects } from "./src/lib/ouro/testing/vitest.ts";

export default mergeConfig(viteConfig, defineConfig({ test: { projects: ouroTestProjects({ css: "./src/index.css" }) } }));
