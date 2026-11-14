import { resolve } from "node:path";
import { build } from "vite";
import { expect, test } from "@playwright/test";
import { LATENCY, expectPressesWithinBudget, medianCeiling } from "./latency";

// Typing with the squircle polyfill running. Playwright's engines draw corner-shape natively, so the polyfill's
// fallback never runs in them and its cost went unseen: in an engine without it (Tandem's WKWebView) typing took
// 192 ms at the 95th percentile with it registered and 38 ms without. This hides native support before the page
// loads, registers the vendored engine (registry/ouro/lib/ouro/squircle/) as an app that opts in does, and types into a docs demo's field on a CPU throttled
// LATENCY.throttle×, held to latency.ts's budget.

// The vendored engine, bundled into one script the page evaluates.
async function bundledEngine(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: { write: false, minify: false, lib: { entry: resolve("registry/ouro/lib/ouro/squircle/register.ts"), formats: ["iife"], name: "ouroSquircle" } },
  });
  const output = (Array.isArray(result) ? result[0] : result) as { output: Array<{ type: string; code?: string }> };
  return output.output.find((chunk) => chunk.type === "chunk")!.code!;
}

/** The median, in ms, the typing measured in CI's latency job; re-measure when the polyfill gets faster. */
const BASELINE_MEDIAN = 16;

test.describe("interaction latency", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");

  test(`typing with the squircle polyfill forced on stays within ${LATENCY.p95} ms (p95 of ${LATENCY.samples} or ${LATENCY.samples + LATENCY.more}, median within ${medianCeiling(BASELINE_MEDIAN)} ms) on a ${LATENCY.throttle}× slower CPU`, async ({ page }) => {
    await page.addInitScript(() => {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = ((property: string, value?: string) => (property === "corner-shape" || String(property).includes("corner-shape") ? false : value === undefined ? supports(property) : supports(property, value))) as typeof CSS.supports;
    });
    await page.goto("docs/text-field/");
    await expect(page.locator("html[data-site-ready]")).toBeAttached();
    // The same guard registerSquirclePolyfill installs before it loads the polyfill.
    await page.evaluate(
      `for (const t of ["transitionrun", "transitionend"]) document.addEventListener(t, (e) => { if (/^(border-.*-color|outline-color|box-shadow)$/.test(e.propertyName)) e.stopImmediatePropagation(); }, true);`,
    );
    await page.evaluate(`${await bundledEngine()}\n;ouroSquircle.registerHyperellipse();`);
    await expect.poll(() => page.locator("[data-hyperellipse-host]").count()).toBeGreaterThan(0);
    const field = page.getByLabel("Email");
    await field.focus();
    await expectPressesWithinBudget(page, "typing with the polyfill", { press: () => page.keyboard.press("a") }, BASELINE_MEDIAN);
    await expect(field).not.toHaveValue("");
  });
});
