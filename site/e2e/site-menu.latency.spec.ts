import { expect, test, type Page } from "@playwright/test";
import { LATENCY, expectPressesWithinBudget, medianCeiling } from "./latency";

// The site menu's press answers within budget on a phone, press to the paint that draws its sheet, on a CPU throttled
// LATENCY.throttle×: on the home page, with the stage's fish and caustics running behind the header, and on a docs page,
// whose menu is the docs' own (every page, and a search). latency.ts holds the budget and the measurement; this runs
// alone, one worker, in CI's latency job (playwright.latency.config.ts), so no neighbour shares the CPU it measures.

const PHONE = { width: 390, height: 844 };
const menuButton = (page: Page) => page.getByRole("banner").getByRole("button", { name: "Menu", exact: true });
const sheet = (page: Page) => page.locator("[role='dialog']", { has: page.getByRole("navigation", { name: "Site" }) });

/**
 * Each page's baseline: the highest median, in ms, the press measured in CI's latency job (PR #648's runs, 2026-11-06;
 * every run prints its samples). Re-measure and update a line when a change makes the menu faster or knowingly slower.
 */
const BASELINE_MEDIAN: Record<string, number> = { "./": 64, "docs/button/": 64 };

/** One press's press-to-paint time in ms on a CPU throttled LATENCY.throttle×, as measure() times each of its presses. */
async function firstPress(page: Page, press: () => Promise<unknown>): Promise<number> {
  await page.evaluate(() => {
    const store: number[] = [];
    (window as unknown as { __first: number[] }).__first = store;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) if (entry.interactionId) store.push(entry.duration);
    }).observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: LATENCY.throttle });
  await press();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const durations = await page.evaluate(() => (window as unknown as { __first: number[] }).__first);
  return durations.length > 0 ? Math.max(...durations) : 16;
}

/**
 * The most a page's first open may take, in ms: a loose guard for CI's slower runner, so a first open that gets much
 * slower fails. The warm presses' budget does not hold it: the first runs the sheet's code for the first time.
 */
const FIRST_OPEN_CEILING = 320;

test.describe("interaction latency", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");

  for (const path of Object.keys(BASELINE_MEDIAN)) {
    const label = `menu on /${path === "./" ? "" : path}`;
    test(`the ${label} opens within ${LATENCY.p95} ms (p95 of ${LATENCY.samples}, median within ${medianCeiling(BASELINE_MEDIAN[path]!)} ms) on a phone with a ${LATENCY.throttle}× slower CPU`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(path);
      await expect(page.locator("html[data-site-ready]")).toBeAttached();
      // On the home page, measured with the fish swimming: the stage has judged the screen fast enough for them.
      if (path === "./") {
        // real clock: the stage judges the screen on its real frames, a beat and then a second of them.
        await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "");
        await expect(page.locator(".stage-scene")).toHaveAttribute("data-speed", "half");
      }
      // The first open, measured on its own: the presses below are warm. The Navbar builds its sheet while the page is
      // idle and keeps it, hidden, between opens, so the first press, too, only shows it; on the docs, whose header is
      // an island, the built sheet also says the header has hydrated. It is reported, so a change that slows only the
      // first open shows.
      // real clock: the sheet is built when the browser says the page is idle, which no page clock drives.
      await expect(page.locator('[data-ouro="sheet"][hidden]')).toBeAttached();
      const first = await firstPress(page, () => menuButton(page).click());
      // real clock: the menu stays open until it is closed; no timer ends it.
      await expect(sheet(page)).toBeVisible();
      test.info().annotations.push({ type: "latency", description: `${label}, first open: ${first} ms` });
      console.log(`latency ${label}, first open: ${first} ms`);
      expect(first, `${label}, first open, in ms`).toBeLessThanOrEqual(FIRST_OPEN_CEILING);
      // Escape closes the menu, and the sheet slides away before the next press.
      const close = async () => {
        await page.keyboard.press("Escape");
        // real clock: the sheet's slide out is a CSS transition, which the page's clock does not drive.
        await expect(sheet(page)).toHaveCount(0);
      };
      await close();
      await expectPressesWithinBudget(
        page,
        label,
        {
          press: () => menuButton(page).click(),
          // Each press opens the menu from closed.
          setUp: async (index) => {
            if (index > 0) await close();
          },
        },
        BASELINE_MEDIAN[path]!,
      );
    });
  }
});
