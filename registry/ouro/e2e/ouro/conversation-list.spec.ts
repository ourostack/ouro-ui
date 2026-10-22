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
