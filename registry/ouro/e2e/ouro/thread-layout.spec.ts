import { expect, test } from "../ouro-fixtures";
import { openStory, pressTab } from "./story";

test("a thread opens beside the conversation, and its close button hands the width back", async ({ page }) => {
  await openStory(page, "chat-threadlayout--closed");
  const show = page.getByRole("button", { name: "Show thread" });
  await expect(show).toBeVisible();
  await show.click();
  const rail = page.getByRole("complementary", { name: "Replies" });
  await expect(rail).toBeVisible();
  await expect(show).toBeVisible();
  await rail.getByRole("button", { name: "Close thread" }).click();
  await expect(rail).toHaveCount(0);
  await expect(show).toBeVisible();
});

test("in a narrow box the open thread covers the conversation, which Tab skips", async ({ page }) => {
  await openStory(page, "chat-threadlayout--narrow");
  const rail = page.getByRole("complementary", { name: "Replies" });
  await expect(rail).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message the channel" })).toBeHidden();
  await pressTab(page);
  await expect(rail.getByRole("button", { name: "Close thread" })).toBeFocused();
});
