import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a post's summary opens its thread, and a post without replies offers Reply", async ({ page }) => {
  await openStory(page, "chat-threadsummary--under-posts");
  await expect(page.getByRole("group", { name: "Replied" })).toBeVisible();
  await expect(page.getByText("Last reply 7:44 AM")).toBeVisible();
  // Each button's name says whose post it opens, starting with the words it shows.
  await page.getByRole("button", { name: "4 replies to Jonah Vale's post Agenda for Friday's design review" }).click();
  await expect(page.getByRole("status")).toHaveText("Opened the thread under Jonah Vale's post");
  await page.getByRole("button", { name: "Reply to Mara Quill's post", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Started a thread under Mara Quill's post");
});
