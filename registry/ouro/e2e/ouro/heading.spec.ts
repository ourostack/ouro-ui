import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("headings form the document outline, and no level is larger than the one above it", async ({ page }) => {
  await openStory(page, "text-heading--headings");
  const sizes: number[] = [];
  for (const level of [1, 2, 3, 4, 5, 6]) {
    const heading = page.getByRole("heading", { level, name: `Heading level ${level}` });
    await expect(heading).toBeVisible();
    sizes.push(await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)));
  }
  for (let level = 1; level < sizes.length; level++) expect(sizes[level]).toBeLessThanOrEqual(sizes[level - 1]!);
  expect(sizes[0]).toBeGreaterThan(sizes[5]!);
});
