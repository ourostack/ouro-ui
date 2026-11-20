import assert from "node:assert/strict";
import test from "node:test";
import { stale } from "./waivers.mjs";
import { WAIVERS, waived, waivedPages } from "../site/e2e/waivers.ts";

test("every sweep waiver names its component, part, page, property, reason and source", () => {
  for (const w of WAIVERS) {
    for (const field of ["component", "page", "property", "reason", "source"]) assert.ok(w[field], `${JSON.stringify(w)} lacks ${field}`);
    assert.equal(typeof w.part, "string", `${JSON.stringify(w)} lacks part`);
    assert.ok(w.page.startsWith("/") && w.page.endsWith("/"), `${w.page} is one page`);
  }
});

test("a waiver covers one page only and a sweep finding on several is not waived", () => {
  WAIVERS.push({ component: "switch", part: "track", variant: "", state: "", page: "/apple/feel/", property: "border", reason: "test", source: "test" });
  const line = "switch|track|span|data-unchecked|h24|pearl|1,1,1,1 on /apple/feel/, /docs/dialog/: border 1px solid ";
  assert.equal(waived(line), false);
  assert.equal(waived(line.replace(", /docs/dialog/", "")), true);
  WAIVERS.pop();
});

test("a waiver for every state covers a hover read on its page, and one for the page at rest does not", () => {
  const hover = "switch|track|button|aria-checked=false,data-unchecked=|36x20|pearl||hover on /apple/feel/: border 1px solid 81,81,85,255";
  const kept = WAIVERS.splice(0);
  try {
    WAIVERS.push({ component: "switch", part: "track", variant: "", state: "", page: "/apple/feel/", property: "border", reason: "test", source: "test" });
    assert.equal(waived(hover), false);
    WAIVERS[0].state = "*";
    assert.equal(waived(hover), true);
  } finally {
    WAIVERS.splice(0, WAIVERS.length, ...kept);
  }
});

test("a look's samples on a waived page are the odd one out of a tie, so its waiver can match (#2249)", () => {
  const key = "switch|track|button|aria-checked=false,data-unchecked=|36x20|pearl||hover";
  const kept = WAIVERS.splice(0);
  try {
    WAIVERS.push({ component: "switch", part: "track", variant: "", state: "*", page: "/apple/feel/", property: "border", reason: "test", source: "test" });
    assert.equal(waivedPages(key, ["/apple/feel/"]), true);
    assert.equal(waivedPages(key, ["/docs/porthole/"]), false);
    assert.equal(waivedPages(key, ["/apple/feel/", "/docs/porthole/"]), false);
  } finally {
    WAIVERS.splice(0, WAIVERS.length, ...kept);
  }
});

test("a waiver no sweep used is stale", () => {
  assert.equal(stale(new Set(WAIVERS.keys())).length, 0);
  assert.equal(stale(new Set()).length, WAIVERS.length);
});
