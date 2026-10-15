import { defineConfig } from "vitest/config";
import base from "../vitest.config";
import { ouroTestProjects } from "../registry/ouro/lib/ouro/testing/vitest";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    projects: ouroTestProjects({
      css: process.env["PROBE_STYLE"] === "stock" ? "./proof/native-input-stock.css" : "./app.css",
    }),
  },
});
