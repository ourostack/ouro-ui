// What the ouro-testing item's docs tell an app to add.
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";
import { ouroTestProjects } from "./src/lib/ouro/testing/vitest";

export default mergeConfig(viteConfig, defineConfig({ test: { projects: ouroTestProjects({ css: "./src/index.css" }) } }));
