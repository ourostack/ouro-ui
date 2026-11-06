import { expect, test, type Page } from "@playwright/test";
import { LATENCY, expectWithinBudget, measure, medianCeiling } from "./latency";

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

test.describe("interaction latency", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");

  for (const path of Object.keys(BASELINE_MEDIAN)) {
    const label = `menu on /${path === "./" ? "" : path}`;
    test(`the ${label} opens within ${LATENCY.p95} ms (p95 of ${LATENCY.samples}, median within ${medianCeiling(BASELINE_MEDIAN[path]!)} ms) on a phone with a ${LATENCY.throttle}× slower CPU`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(path);
      await expect(page.locator("html[data-site-ready]")).toBeAttached();
      // Escape closes the menu, and the sheet slides away before the next press.
      const close = async () => {
        await page.keyboard.press("Escape");
        // real clock: the sheet's slide out is a CSS transition, which the page's clock does not drive.
        await expect(sheet(page)).toHaveCount(0);
      };
      const samples = await measure(page, label, {
        // The docs' header is an island: its button works once it has hydrated, so open and close the menu once first.
        prepare: async () => {
          await expect(async () => {
            if ((await sheet(page).count()) === 0) await menuButton(page).click({ timeout: 1000 });
            // real clock: the menu stays open until it is closed; no timer ends it.
            await expect(sheet(page)).toBeVisible({ timeout: 1000 });
          }).toPass();
          await close();
        },
        press: () => menuButton(page).click(),
        // Each press opens the menu from closed.
        setUp: async (index) => {
          if (index > 0) await close();
        },
      });
      expectWithinBudget(label, samples, BASELINE_MEDIAN[path]!);
    });
  }
});
