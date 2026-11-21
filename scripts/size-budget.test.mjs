import assert from "node:assert/strict";
import { test } from "node:test";
import { inlineStyles, linkedStyles, readCeilings } from "./size-budget.mjs";

test("the CSS ceilings are read in bytes for every kind of page", () => {
  assert.deepEqual(readCeilings("const CSS_CEILINGS = { voyage: 47 * 1024, docs: 50 * 1024, docsShell: 26 * 1024, docsPage: 36 * 1024 } as const;"), {
    voyage: 47 * 1024,
    docs: 50 * 1024,
    docsShell: 26 * 1024,
    docsPage: 36 * 1024,
  });
  assert.throws(() => readCeilings("const other = 1;"), /no CSS_CEILINGS/);
});

test("a page's inline CSS is the <style> in its head, not one in its body", () => {
  assert.equal(inlineStyles("<html><head><style>a{b:c}</style></head><body><style>x{y:z}</style></body></html>"), "a{b:c}");
});

test("a page's linked stylesheets are read from its built HTML", () => {
  assert.deepEqual(linkedStyles('<link rel="stylesheet" crossorigin href="/assets/docs-shell-1.css" /><link rel="modulepreload" href="/x.js">'), [
    "assets/docs-shell-1.css",
  ]);
});
