import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("an agenda names each meeting by time and title, and calls out the one happening now", async ({ page }) => {
  await openStory(page, "lists-meetingrow--agenda");
  await expect(page.getByRole("article")).toHaveCount(4);
  const now = page.getByRole("article", { name: "10:00 Weekly sync Now" });
  await expect(now).toBeVisible();
  await expect(now.getByRole("button", { name: "Join" })).toBeVisible();
  await expect(page.getByRole("article", { name: "09:00 Standup" })).toHaveAttribute("data-state", "past");
});
