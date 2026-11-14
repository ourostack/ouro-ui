import assert from "node:assert/strict";
import test from "node:test";
import { stale } from "./waivers.mjs";
import { WAIVERS, waived } from "../site/e2e/waivers.ts";

test("every sweep waiver names its component, part, page, property, reason and source", () => {
  for (const w of WAIVERS) {
    for (const field of ["component", "part", "page", "property", "reason", "source"]) assert.ok(w[field], `${JSON.stringify(w)} lacks ${field}`);
    assert.ok(w.page.startsWith("/") && w.page.endsWith("/"), `${w.page} is one page`);
  }
});

test("a waiver covers one page only and a sweep finding on several is not waived", () => {
  const line = "button|root|button|data-variant=outline|h36|pearl|1,1,1,1 on /docs/card/, /docs/dialog/: border 1px solid ";
  assert.equal(waived(line), false);
  assert.equal(waived(line.replace(", /docs/dialog/", "")), true);
});

test("a waiver no sweep used is stale", () => {
  assert.equal(stale(new Set(WAIVERS.keys())).length, 0);
  assert.equal(stale(new Set()).length, WAIVERS.length);
});
