import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

// ourostack/ouro-ui#3491: Chromium 149 to 157 drops every later rule in a stylesheet when a
// `shape()` in an ordinary property has a segment that is only a `var()` reference. Fixed in
// Chromium 158. Ouro UI documents no minimum-supported-browser-version matrix, so the only
// guard against that range is the static check below (bareVarShapeDecls in source-rules.test.mjs)
// plus this: it reads CI's actual installed Chromium, not a guess, so a future Playwright
// downgrade that reintroduces the 149-157 range is caught here rather than assumed away.
test("CI's installed Chromium (from Playwright, pinned in package.json) is past the 149 to 157 shape()/var() regression range", async () => {
  const browser = await chromium.launch();
  try {
    const [major] = browser.version().split(".").map(Number);
    assert.ok(major >= 158, `Chromium ${browser.version()} is in or before the 149-157 shape()/var() regression range (ourostack/ouro-ui#3491); CI's live-browser tests cannot exercise it, so the static bareVarShapeDecls check is the only guard until this reads 158 or higher again.`);
  } finally {
    await browser.close();
  }
});
