import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("each prompt's copy button is described by its own prompt", async ({ page }) => {
  await openStory(page, "chat-copyprompt--prompts");
  const buttons = page.getByRole("button", { name: "Copy" });
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveAccessibleDescription("Suggest a layout for my mornings: customer chats first, then my calendar.");
  await expect(buttons.nth(1)).toHaveAccessibleDescription(/^Summarize my week in three bullets:/);
});
