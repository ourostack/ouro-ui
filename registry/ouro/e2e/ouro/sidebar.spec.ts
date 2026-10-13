import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("the sidebar marks the current page and collapses to a rail that keeps the links' names", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openStory(page, "navigation-sidebar--in-context");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Recipes" })).toHaveAttribute("aria-current", "page");
  const toggle = nav.getByRole("button", { name: "Collapse sidebar" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await nav.boundingBox())!.width).toBeLessThan(70);
  await expect(nav.getByRole("link", { name: "Cookbooks" })).toBeVisible();
  await nav.getByRole("link", { name: "Cookbooks" }).click();
  await expect(page).toHaveURL(/\/cookbooks$/);
});

test("on a phone the sidebar is a menu button that opens a drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "navigation-sidebar--in-context");
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  const menu = page.getByRole("button", { name: "Menu" });
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "Menu" });
  await expect(drawer.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Recipes" })).toHaveAttribute("aria-current", "page");
  await expect(drawer.getByText("Ari Mendelow")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();
});
