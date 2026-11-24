import assert from "node:assert/strict";
import { test } from "node:test";
import { inlineStyles, linkedStyles, pages, readCeilings, readMargin } from "./size-budget.mjs";

test("the CSS ceilings are read in bytes for every kind of page", () => {
  assert.deepEqual(readCeilings("const CSS_CEILINGS = { voyage: 47 * 1024, docs: 50 * 1024, docsShell: 26 * 1024, docsPage: 36 * 1024 } as const;"), {
    voyage: 47 * 1024,
    docs: 50 * 1024,
    docsShell: 26 * 1024,
    docsPage: 36 * 1024,
  });
  assert.throws(() => readCeilings("const other = 1;"), /no CSS_CEILINGS/);
});

test("the CSS growth budget is read from CSS_MARGIN, in bytes", () => {
  assert.equal(readMargin("const CSS_MARGIN = 512;"), 512);
  assert.throws(() => readMargin("const other = 1;"), /no CSS_MARGIN/);
});

test("each page is judged with the same size-gate.mjs check name catalog.spec.ts writes for the same key", () => {
  // page-css is the closure test's key for home/nautilus/docs; shell-css is the shell test's key for every docs page,
  // badge included (it shares the shell test's "badge CSS, gzip bytes" key, not the closure test's).
  assert.deepEqual(
    pages.map(({ name, check }) => `${check}:${name}`),
    ["page-css:home", "page-css:nautilus", "page-css:docs", "shell-css:badge", "shell-css:docs-shell"],
  );
});

test("a page's inline CSS is the <style> in its head, not one in its body", () => {
  assert.equal(inlineStyles("<html><head><style>a{b:c}</style></head><body><style>x{y:z}</style></body></html>"), "a{b:c}");
});

test("a page's linked stylesheets are read from its built HTML", () => {
  assert.deepEqual(linkedStyles('<link rel="stylesheet" crossorigin href="/assets/docs-shell-1.css" /><link rel="modulepreload" href="/x.js">'), [
    "assets/docs-shell-1.css",
  ]);
});
