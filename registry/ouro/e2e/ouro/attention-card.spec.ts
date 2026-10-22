import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("an attention card is named by its reason and place, and its message opens it", async ({ page }) => {
  await openStory(page, "chat-attentioncard--opening");
  await expect(page.getByRole("article", { name: "Asked you Design review" })).toBeVisible();
  await page.getByRole("button", { name: /^Ada Lovelace: Can you look/ }).click();
  await expect(page.getByText("Opened Design review")).toBeVisible();
});
