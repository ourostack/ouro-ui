import assert from "node:assert/strict";
import { test } from "node:test";
import { ouroTestProjects } from "../registry/ouro/lib/ouro/testing/vitest.ts";

// The Vitest projects an app gets from the test kit (lib/ouro/testing/vitest.ts).

const pageOf = (project) => project.test.browser.provider.options?.contextOptions?.viewport;

test("ouroTestProjects leaves the page size to Vitest unless the app sets one", () => {
  const projects = ouroTestProjects({ css: "./src/index.css" });
  assert.deepEqual(projects.map((project) => project.test.name), ["ouro-chromium", "ouro-webkit", "ouro-touch"]);
  assert.deepEqual(projects.map(pageOf), [undefined, undefined, { width: 390, height: 844 }]);
  assert.deepEqual(projects[2].test.browser.viewport, { width: 390, height: 844 });
  assert.equal(projects[2].test.browser.provider.options.contextOptions.hasTouch, true);
  assert.equal(projects[2].test.browser.provider.options.contextOptions.isMobile, true);
});

test("page sizes every Playwright host while the touch frame keeps its phone viewport and input", () => {
  const projects = ouroTestProjects({ css: "./src/index.css", page: { width: 1600, height: 1200 } });
  assert.deepEqual(pageOf(projects[0]), { width: 1600, height: 1200 });
  assert.deepEqual(pageOf(projects[1]), { width: 1600, height: 1200 });
  assert.deepEqual(pageOf(projects[2]), { width: 1600, height: 1200 });
  assert.deepEqual(projects[2].test.browser.viewport, { width: 390, height: 844 });
  assert.equal(projects[2].test.browser.provider.options.contextOptions.hasTouch, true);
  assert.equal(projects[2].test.browser.provider.options.contextOptions.isMobile, true);
});
