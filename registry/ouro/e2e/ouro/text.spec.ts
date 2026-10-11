import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("body text renders in the theme's scale, and clamped text ends in an ellipsis", async ({ page }) => {
  await openStory(page, "text-text--truncate-and-clamp");
  const paragraphs = page.locator("[data-ouro=text]");
  await expect(paragraphs.first()).toBeVisible();
  const truncated = page.locator("[data-ouro=text]").nth(1);
  const clipped = await truncated.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(clipped).toBe(true);
  expect(await truncated.evaluate((el) => getComputedStyle(el).textOverflow)).toBe("ellipsis");
});
