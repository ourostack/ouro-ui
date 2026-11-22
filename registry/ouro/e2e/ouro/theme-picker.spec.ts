import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("the theme picker sets data-theme on the page and keeps the choice", async ({ page }) => {
  await openStory(page, "actions-themepicker--playground");
  await page.evaluate(() => localStorage.removeItem("ouro-theme-picker-story"));
  await page.getByRole("button", { name: "Tide" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "tide");
  await expect(page.getByRole("button", { name: "Tide" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("ouro-theme-picker-story"))).toBe("tide");
  await page.evaluate(() => localStorage.removeItem("ouro-theme-picker-story"));
});

test("the theme picker's popover opens from the chosen wordmark and closes on Escape", async ({ page }) => {
  await openStory(page, "actions-themepicker--in-popover");
  await page.evaluate(() => localStorage.removeItem("ouro-theme-picker-story"));
  const trigger = page.getByRole("button", { name: /Theme: Ledger/ });
  await trigger.click();
  const chart = page.getByRole("button", { name: "Chart", exact: true });
  await expect(chart).toBeVisible();
  await chart.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "chart");
  await page.keyboard.press("Escape");
  await expect(chart).toBeHidden();
  await expect(page.getByRole("button", { name: /Theme: Chart/ })).toBeFocused();
  await page.evaluate(() => localStorage.removeItem("ouro-theme-picker-story"));
});
