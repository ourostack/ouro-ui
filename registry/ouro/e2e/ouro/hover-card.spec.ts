import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("previews the link on hover and hides when the pointer leaves", async ({ page }) => {
  await openStory(page, "overlays-hovercard--playground");
  await page.getByRole("link", { name: "Ari Mendelow" }).hover();
  const card = page.getByText("Cooks mostly Persian food. 42 recipes, 6 cookbooks.");
  await expect(card).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(card).toBeHidden();
});

test("previews the link on keyboard focus, and the link still navigates", async ({ page }) => {
  await openStory(page, "overlays-hovercard--playground");
  const link = page.getByRole("link", { name: "Ari Mendelow" });
  // Focus from the keyboard: Safari's Tab skips links by default.
  await page.keyboard.press("Shift");
  await link.focus();
  await expect(page.getByText("Cooks mostly Persian food. 42 recipes, 6 cookbooks.")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#cooks\/ari$/);
});
