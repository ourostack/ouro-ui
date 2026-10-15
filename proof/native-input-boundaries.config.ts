import { defineConfig } from "vitest/config";
import base from "../vitest.config.ts";
import { ouroTestProjects } from "../registry/ouro/lib/ouro/testing/vitest.ts";

const projects = ouroTestProjects({ css: "./app.css" });
if (process.env["PROBE_STYLE"] === "stock") {
  for (const project of projects) {
    if (!project.test || !Array.isArray(project.test.setupFiles)) throw new Error("Expected the shipped setup-file list");
    project.test.setupFiles = [...project.test.setupFiles, "./proof/native-input-stock.ts"];
  }
}

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    projects,
  },
});
