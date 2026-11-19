import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("the page shell centres its column and keeps a gutter at every screen size", async ({ page }) => {
  for (const width of [390, 1440, 3840]) {
    await page.setViewportSize({ width, height: 900 });
    await openStory(page, "layout-pageshell--playground");
    const shell = page.locator('[data-ouro="page-shell"]');
    const box = await shell.boundingBox();
    expect(box).not.toBeNull();
    const padding = await shell.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    expect(padding).toBeGreaterThan(0);
    expect(Math.abs(box!.x - (width - box!.x - box!.width))).toBeLessThan(1);
  }
});
