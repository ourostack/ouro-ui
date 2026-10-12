import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("a row with href navigates from its media, and its action does not", async ({ page }) => {
  await openStory(page, "lists-item--in-context");
  const url = page.url();
  await page.getByRole("button", { name: "Save" }).click();
  expect(page.url()).toBe(url);
  await page.locator('[data-ouro="item"] img').first().click();
  await expect(page).toHaveURL(/#short-ribs$/);
});

test("a row's actions drop under its text on a phone with stackBelow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "lists-item--in-context");
  const title = await page.getByText("Sync token").boundingBox();
  const revoke = await page.getByRole("button", { name: "Revoke" }).boundingBox();
  expect(revoke!.y).toBeGreaterThan(title!.y + title!.height);
});
