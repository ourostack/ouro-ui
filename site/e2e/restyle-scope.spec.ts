import { expect, test, type Page } from "@playwright/test";
import { siteReady } from "./ready";

// A switch between keyboard and pointer restyles the focused element and its field, never the page. Ouro's last-input
// tracker records the switch, and a rule that reads it from <html> restyles every element its right side can match:
// ourostack/ouro-ui#2524, where that cost a Code sheet press about 70 ms at 4× throttle and the latency budgets, which
// judge time on a shared runner, let it through. This counts restyled elements, which no runner's speed changes.

/** The most elements one switch may restyle: the focused control, its field and their parts. */
const SCOPE = 24;

const PAGES = ["nautilus/", "docs/text-field/", "docs/composer/"];

/** How many elements the style recalculations during `act` touched, from Chromium's trace. */
async function restyled(page: Page, act: () => Promise<void>): Promise<number> {
  const browser = page.context().browser()!;
  // Style the page now, and let two frames pass, so a recalculation left over from setting up is not counted.
  await page.evaluate(() => new Promise((done) => {
    void getComputedStyle(document.documentElement).color;
    requestAnimationFrame(() => requestAnimationFrame(done));
  }));
  await browser.startTracing(page, { categories: ["devtools.timeline"] });
  await act();
  // Two frames, so the recalculation the switch scheduled has run.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const trace = JSON.parse((await browser.stopTracing()).toString("utf8")) as { traceEvents: { name: string; args?: { elementCount?: number } }[] };
  return trace.traceEvents.filter((event) => event.name === "UpdateLayoutTree").reduce((sum, event) => sum + (event.args?.elementCount ?? 0), 0);
}

test.describe("restyle scope of an input switch", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "the element count comes from Chromium's trace");

  for (const path of PAGES) {
    test(`on ${path}, a press after Tab, with a field focused, restyles at most ${SCOPE} elements`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await siteReady(page);
      const ouro = await page.locator("[data-ouro]").count();
      expect(ouro, "the page has enough Ouro elements to tell a page-wide restyle from a local one").toBeGreaterThan(SCOPE * 2);
      // The events the tracker listens for, dispatched alone, so no hover, press or selection restyles anything: Tab,
      // with a text field focused, then a press, which moves focus nowhere. A restyle of the page the switch causes comes
      // with every switch, and the page's own work (a late image, a font) with only some, so the fewest of three counts, each net of the page's own restyles in an idle window.
      await page.locator("input").first().focus();
      const counts: number[] = [];
      for (let round = 0; round < 3; round++) {
        await page.evaluate(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
        // The page's own restyles over the same window with nothing dispatched, taken off the switch's count.
        const idle = await restyled(page, async () => undefined);
        const switched = await restyled(page, () => page.evaluate(() => void document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))));
        counts.push(Math.max(0, switched - idle));
      }
      const count = Math.min(...counts);
      expect(count, `a press after Tab restyled ${counts.join(", ")} elements of a page with ${ouro} Ouro elements`).toBeLessThanOrEqual(SCOPE);
    });
  }
});
