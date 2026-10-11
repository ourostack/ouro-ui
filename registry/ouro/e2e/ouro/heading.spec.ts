import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("headings form the document outline, each level a size step down", async ({ page }) => {
  await openStory(page, "text-heading--headings");
  for (const level of [1, 2, 3, 4, 5, 6]) {
    await expect(page.getByRole("heading", { level, name: `Heading level ${level}` })).toBeVisible();
  }
  const size = (level: number) =>
    page.getByRole("heading", { level, name: `Heading level ${level}` }).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await size(1)).toBeGreaterThan(await size(4));
});
