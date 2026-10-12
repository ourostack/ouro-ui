import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test.use({ viewport: { width: 1280, height: 800 } });

test("moves with the arrow keys and Page Down across months, and picks with Enter", async ({ page }) => {
  await openStory(page, "forms-calendar--playground");
  const selected = page.getByRole("button", { name: "Thursday, March 12, 2026" });
  await selected.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Thursday, April 2, 2026" })).toBeFocused();
  await expect(page.getByRole("grid", { name: "April 2026" })).toBeVisible();
  await page.keyboard.press("PageUp");
  await expect(page.getByRole("button", { name: "Monday, March 2, 2026" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("gridcell", { selected: true })).toHaveCount(1);
  await expect(page.getByRole("gridcell", { selected: true }).getByRole("button")).toHaveAccessibleName("Monday, March 2, 2026");
});

test("picks a range with two presses", async ({ page }) => {
  await openStory(page, "forms-calendar--range");
  await page.getByRole("button", { name: "Monday, March 16, 2026" }).click();
  await page.getByRole("button", { name: "Friday, March 20, 2026" }).click();
  await expect(page.getByText("2026-03-16 to 2026-03-20")).toBeVisible();
  await expect(page.getByRole("gridcell", { selected: true })).toHaveCount(5);
});
