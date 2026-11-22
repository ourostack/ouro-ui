import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("Enter steps through the matches and Escape closes the bar, with focus staying in the find box", async ({ page }) => {
  await openStory(page, "chat-conversationfind--with-message-list");
  const box = page.getByRole("searchbox", { name: "Find in conversation" });
  await box.focus();
  await page.keyboard.press("Enter");
  await expect(box).toBeFocused();
  await expect(page.locator("[data-ouro-conversation-find-result]")).toHaveText("2 of 4");
  await page.keyboard.press("Shift+Enter");
  await expect(page.locator("[data-ouro-conversation-find-result]")).toHaveText("1 of 4");
  await page.keyboard.press("F3");
  await expect(page.locator("[data-ouro-conversation-find-result]")).toHaveText("2 of 4");
  await page.keyboard.press("Escape");
  await expect(box).toHaveValue("");
});

test("a search with no match says so", async ({ page }) => {
  await openStory(page, "chat-conversationfind--no-matches");
  await expect(page.getByText("No matches", { exact: true }).first()).toBeVisible();
});
