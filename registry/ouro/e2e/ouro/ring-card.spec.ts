import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a ring leaves the draft in place and answers with a calm connecting line", async ({ page }) => {
  await openStory(page, "chat-ringcard--answering");
  const draft = page.getByRole("textbox", { name: "Your draft" });
  await draft.fill("Keep this draft");
  await page.getByRole("button", { name: "Audio", exact: true }).click();
  await expect(page.getByText("Connecting...", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Incoming call from Mara Vale" })).toHaveAttribute("data-state", "pending");
  await expect(draft).toHaveValue("Keep this draft");
  await expect(page.getByRole("button", { name: "Video", exact: true })).toHaveCount(0);
});
