import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a permission prompt settles to who answered when the person allows it, with focus on that line", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "chat-permissionprompt--in-a-conversation");
  const prompt = page.getByRole("article", { name: "Your agent wants to run a command" });
  await expect(prompt.getByText("npm install recipe-scaler")).toBeVisible();
  await expect(prompt.getByText("Medium risk")).toBeVisible();
  await prompt.getByRole("button", { name: "Allow once" }).click();
  const answer = prompt.getByRole("status");
  await expect(answer).toHaveText("Allowed by you from this app");
  await expect(answer).toBeFocused();
  await expect(prompt.getByRole("button")).toHaveCount(0);
});
