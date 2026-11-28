import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a read receipt says who has seen a message, under the last one each person read", async ({ page }) => {
  await openStory(page, "chat-readreceipt--in-a-chat");
  await expect(page.getByText("Seen by Reader B and Reader D")).toBeAttached();
  await expect(page.getByText("Seen by Reader A, Reader C and 2 others")).toBeAttached();
  const newest = page.locator('[data-ouro="read-receipt"]').last();
  await expect(newest.locator('[data-ouro="avatar"]')).toHaveCount(3);
  await expect(newest.locator("[data-ouro-read-receipt-more]")).toHaveText("+1");
});
