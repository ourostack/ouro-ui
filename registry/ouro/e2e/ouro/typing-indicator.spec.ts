import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a typing line says who is writing as a status, with faces beside it", async ({ page }) => {
  await openStory(page, "chat-typingindicator--writers");
  const lines = page.getByRole("status");
  await expect(lines.nth(0)).toHaveText("Ana Lind is writing…");
  await expect(lines.nth(1)).toHaveText("Ana Lind and Grace Hopper are writing…");
  await expect(lines.nth(2)).toHaveText("Several people are writing…");
  await expect(lines.nth(2).locator('[data-ouro="avatar"]')).toHaveCount(3);
  await expect(lines.nth(3)).toHaveText("");
});
