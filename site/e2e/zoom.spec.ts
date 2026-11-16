import { expect, test } from "@playwright/test";

// A 1280px laptop at 200% zoom lays the page out 640 CSS pixels wide: every page must fit it without scrolling sideways
// (WCAG 1.4.10, reflow). The platform pages' titles are the widest text on the site.

const PAGES = ["docs/platforms/", "docs/platforms/apple/", "docs/platforms/android/", "docs/platforms/windows/", "docs/platforms/your-platform/"];

test.describe("at 200% zoom on a laptop", () => {
  test.use({ viewport: { width: 640, height: 450 } });

  for (const path of PAGES) {
    test(`/${path} fits the width, its title wrapping`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html[data-site-ready]")).toBeAttached();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      const title = page.getByRole("heading", { level: 1 });
      expect(await title.evaluate((heading) => heading.scrollWidth - heading.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
});

// A browser's own font size setting (Chrome's "Very large"), or text-only zoom, doubles the default font: rem-based
// breakpoints move with it, so a laptop gets the one-column layout a narrower screen does. Chromium only: Playwright
// sets the default font through Chromium's DevTools protocol.
test.describe("with the default font doubled", () => {
  test.beforeEach(async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "the default font size is set through Chromium's DevTools protocol");
    const devtools = await page.context().newCDPSession(page);
    await devtools.send("Page.enable");
    await devtools.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
  });

  test("/adoption/ fits a laptop's width, its list under the count", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("adoption/");
    await expect(page.locator("html[data-site-ready]")).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  });

  test("/adoption/ keeps each product's marks inside the list on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("adoption/");
    await expect(page.locator("html[data-site-ready]")).toBeAttached();
    // The board and the screen both: the list may not grow past the phone and carry its marks off with it.
    const outside = await page.evaluate(() => {
      const edge = Math.min(document.querySelector(".adoption-board")!.getBoundingClientRect().right, document.documentElement.clientWidth);
      return [...document.querySelectorAll(".adoption-board, .adoption-marks, .adoption-head")].filter((part) => part.getBoundingClientRect().right > edge + 0.5).length;
    });
    expect(outside).toBe(0);
  });
});
