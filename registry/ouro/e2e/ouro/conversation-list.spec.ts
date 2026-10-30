import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a conversation opens on a click, and the arrow keys and Enter open another", async ({ page }) => {
  await openStory(page, "chat-conversationlist--selectable");
  const list = page.getByRole("list", { name: "Conversations" });
  const rows = list.getByRole("button");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toHaveAttribute("aria-current", "true");
  await rows.nth(0).click();
  await expect(rows.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(rows.nth(1)).not.toHaveAttribute("aria-current", "true");
  await rows.nth(0).focus();
  await page.keyboard.press("End");
  await expect(rows.nth(3)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(rows.nth(2)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(rows.nth(2)).toHaveAttribute("aria-current", "true");
});

test("the list is one Tab stop on the open chat, and a section header closes and opens its rows", async ({ page }) => {
  await openStory(page, "chat-conversationlist--sections");
  const list = page.getByRole("list", { name: "Chats" });
  const open = list.getByRole("button", { name: /^Mira Okonkwo/ });
  await expect(open).toHaveAttribute("aria-current", "true");
  await open.focus();
  await expect(list.locator('[tabindex="0"]')).toHaveCount(1);
  const recent = list.getByRole("button", { name: /^Recent/ });
  await expect(recent).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(recent).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(recent).toHaveAttribute("aria-expanded", "false");
  await expect(open).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(recent).toHaveAttribute("aria-expanded", "true");
  await expect(open).toBeVisible();
  const quiet = list.getByRole("button", { name: /^Quiet/ });
  await expect(quiet).toHaveAttribute("aria-expanded", "false");
  await quiet.click();
  await expect(list.getByRole("button", { name: /^Garden club/ })).toBeVisible();
});
