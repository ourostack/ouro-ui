import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("an unread dot sits beside its row's title and is heard as its label", async ({ page }) => {
  await openStory(page, "display-unreaddot--in-a-row");
  const dot = page.locator('[data-ouro="unread-dot"]');
  await expect(dot).toHaveText("Unread");
  const box = await dot.locator('[aria-hidden="true"]').boundingBox();
  expect(box!.width).toBe(8);
});
