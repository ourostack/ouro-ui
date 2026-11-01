// PROBE (never merge): each chapter's drawn height, at a desktop's and a phone's width.
import { expect, test } from "@playwright/test";

for (const width of [1440, 1280, 768, 390]) {
  test(`chapter heights at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("nautilus/");
    await expect(page.locator("html[data-site-ready]")).toBeAttached();
    const heights: Record<string, number> = {};
    for (const id of ["chapter-one", "chapter-two", "chapter-three"]) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await expect(page.locator(`#${id}[data-chapter-ready]`)).toBeAttached();
      await page.waitForTimeout(500);
      heights[id] = await page.locator(`#${id}`).evaluate((element) => Math.round(element.getBoundingClientRect().height));
    }
    console.log(`heights at ${width}: ${JSON.stringify(heights)}`);
  });
}
