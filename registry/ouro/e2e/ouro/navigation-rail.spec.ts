import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("marks the current item, moves along the rail with the arrow keys and navigates", async ({ page }) => {
  await openStory(page, "navigation-navigationrail--playground");
  const nav = page.getByRole("navigation", { name: "Main" });
  const chat = nav.getByRole("link", { name: "Chat, 128 new" });
  await expect(chat).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Activity, 5 new" })).toBeVisible();
  await chat.focus();
  await page.keyboard.press("ArrowDown");
  await expect(nav.getByRole("link", { name: "Calendar" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(nav.getByRole("link", { name: "Recipe notebook" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/notebook$/);
});

test("moves what does not fit into More and opens it from the keyboard", async ({ page }) => {
  await openStory(page, "navigation-navigationrail--overflow");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Recipe notebook" })).toHaveAttribute("aria-current", "page");
  const more = nav.getByRole("button", { name: /^More/ });
  await more.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /^Calendar/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
});

test("switches views from buttons", async ({ page }) => {
  await openStory(page, "navigation-navigationrail--views");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("button", { name: "Calendar" }).click();
  await expect(nav.getByRole("button", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("The calendar view.")).toBeVisible();
});
