import assert from "node:assert/strict";
import { test } from "node:test";
import { ouroTestProjects } from "../registry/ouro/lib/ouro/testing/vitest.ts";

// The Vitest projects an app gets from the test kit (lib/ouro/testing/vitest.ts).

const pageOf = (project) => project.test.browser.provider.options?.contextOptions?.viewport;

test("ouroTestProjects leaves the page size to Vitest unless the app sets one", () => {
  const projects = ouroTestProjects({ css: "./src/index.css" });
  assert.deepEqual(projects.map((project) => project.test.name), ["ouro-chromium", "ouro-webkit", "ouro-touch"]);
  assert.equal(pageOf(projects[0]), undefined);
  assert.deepEqual(pageOf(projects[2]), { width: 390, height: 844 });
});

test("page sets the Playwright page of the browser projects, for Vitest 4, and never the phone's", () => {
  const projects = ouroTestProjects({ css: "./src/index.css", page: { width: 1600, height: 1200 } });
  assert.deepEqual(pageOf(projects[0]), { width: 1600, height: 1200 });
  assert.deepEqual(pageOf(projects[1]), { width: 1600, height: 1200 });
  assert.deepEqual(pageOf(projects[2]), { width: 390, height: 844 });
});
