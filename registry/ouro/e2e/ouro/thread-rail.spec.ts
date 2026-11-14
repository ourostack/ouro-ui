import { expect, test } from "../ouro-fixtures";
import { openStory, pressTab } from "./story";

test("a thread opens with focus in it, and Escape or its close button closes it and returns focus", async ({ page }) => {
  await openStory(page, "chat-threadrail--controlled");
  const show = page.getByRole("button", { name: "Show thread" });
  await show.click();
  const rail = page.getByRole("complementary", { name: "Replies" });
  await expect(rail).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(rail).toHaveCount(0);
  await expect(show).toBeFocused();
  await show.click();
  await rail.getByRole("button", { name: "Close thread" }).click();
  await expect(rail).toHaveCount(0);
  await expect(show).toBeFocused();
});

test("Tab reaches the close button first, and Escape typed in the reply box keeps the thread open", async ({ page }) => {
  await openStory(page, "chat-threadrail--controlled");
  await page.getByRole("button", { name: "Show thread" }).click();
  const rail = page.getByRole("complementary", { name: "Replies" });
  await pressTab(page);
  await expect(rail.getByRole("button", { name: "Close thread" })).toBeFocused();
  await rail.getByRole("textbox", { name: "Reply in thread" }).click();
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await expect(rail).toBeVisible();
});
