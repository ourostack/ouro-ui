import { expect, test } from "../ouro-fixtures";
import { openStory, pressTab } from "./story";

test("the stacked layout starts with a skip link that moves focus past the navbar to the page", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openStory(page, "navigation-stackedlayout--in-context");
  await pressTab(page);
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByRole("contentinfo")).toContainText("Made in a small kitchen.");
});

test("the stacked layout keeps its navbar's links one tab after the skip link", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openStory(page, "navigation-stackedlayout--in-context");
  await pressTab(page);
  await pressTab(page);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Recipes" })).toBeFocused();
});
