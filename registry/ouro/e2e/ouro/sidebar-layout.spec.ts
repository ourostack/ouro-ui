import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("the sidebar layout starts with a skip link that moves focus to the page", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openStory(page, "navigation-sidebarlayout--in-context");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Recipes" })).toBeVisible();
});

test("on a phone the sidebar layout shows a top bar whose menu button opens the sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "navigation-sidebarlayout--in-context");
  await expect(page.getByText("Kitchen of Ari")).toBeVisible();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Cookbooks" })).toBeVisible();
});
