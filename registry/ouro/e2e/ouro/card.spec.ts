import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("a card with href navigates from anywhere on it, named by its title", async ({ page }) => {
  await openStory(page, "display-card--in-context");
  await expect(page.getByRole("link", { name: "Weeknight dinners" })).toBeVisible();
  await page.getByText("12 recipes").click();
  await expect(page).toHaveURL(/#weeknight-dinners$/);
});

test("a linked card is one tab stop, and its action is its own", async ({ page }) => {
  await openStory(page, "display-card--in-context");
  await page.getByRole("link", { name: "Weeknight dinners" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Share Weeknight dinners" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Sunday bakes" })).toBeFocused();
});

test("the action does not follow the card's link", async ({ page }) => {
  await openStory(page, "display-card--in-context");
  const url = page.url();
  await page.getByRole("button", { name: "Share Sunday bakes" }).click();
  expect(page.url()).toBe(url);
});
