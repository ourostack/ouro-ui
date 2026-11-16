import { expect, test } from "@playwright/test";

// What every docs page ends with: its source on GitHub and the page as Markdown. On a phone each is a full
// touch target, as any link that stands alone is.

for (const path of ["docs/button/", "docs/installing/"]) {
  test.describe(`at the foot of /${path}`, () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test("on a phone the source and Markdown links are each at least 44px tall and wide", async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html[data-site-ready]")).toBeAttached();
      for (const name of ["Source on GitHub", "This page as Markdown"]) {
        const box = (await page.getByRole("main").getByRole("link", { name, exact: true }).boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    });
  });
}
