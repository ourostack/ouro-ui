import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a hero's picture is never drawn wider than its own pixels, even on a wide screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStory(page, "layout-hero--small-picture");
  const media = page.locator('[data-ouro="hero"] [data-slot="media"]');
  await expect(media).toBeVisible();
  expect((await media.boundingBox())!.width).toBeLessThanOrEqual(640 + 1);
});

test("a column hero lines its text up with its picture and sets the picture under the text, on a wide screen and a phone", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStory(page, "layout-hero--column");
  const title = page.getByRole("heading", { level: 1, name: "Dinner, sorted" });
  const media = page.locator('[data-ouro="hero"] [data-slot="media"]');
  await expect(title).toBeVisible();
  await expect(media).toBeVisible();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(async () => (await media.boundingBox())!.y).toBeGreaterThan((await title.boundingBox())!.y);
    expect(Math.abs((await media.boundingBox())!.x - (await title.boundingBox())!.x)).toBeLessThanOrEqual(1);
  }
});
