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
