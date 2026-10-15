import { defineConfig } from "vitest/config";
import base from "../vitest.config.ts";
import { ouroTestProjects } from "../registry/ouro/lib/ouro/testing/vitest.ts";

const projects = ouroTestProjects({
  css: "./app.css",
  page: { width: 1600, height: 1200 },
  include: [
    "registry/ouro/components/ouro/swipe-actions/swipe-actions.test.tsx",
    "proof/native-sheet-focus-boundary.test.tsx",
  ],
});
for (const project of projects) {
  if (!project.test || !Array.isArray(project.test.setupFiles)) throw new Error("Expected the shipped setup-file list");
  project.test.setupFiles = [...project.test.setupFiles, "./proof/native-input-rtl.ts"];
}
export default defineConfig({ ...base, test: { ...base.test, projects } });
