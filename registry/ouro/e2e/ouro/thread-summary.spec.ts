import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a post's summary opens its thread, and a post without replies offers Reply", async ({ page }) => {
  await openStory(page, "chat-threadsummary--under-posts");
  await expect(page.getByRole("group", { name: "Replied" })).toBeVisible();
  await expect(page.getByText("Last reply 7:44 AM")).toBeVisible();
  await page.getByRole("button", { name: "4 replies" }).click();
  await expect(page.getByRole("status")).toHaveText("Opened the thread under Jonah Vale's post");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Started a thread under Mara Quill's post");
});
