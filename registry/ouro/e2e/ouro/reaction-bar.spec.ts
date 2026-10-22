import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a reaction toggles the person's own, and a quick reaction joins the counts", async ({ page }) => {
  await openStory(page, "chat-reactionbar--in-message");
  const bar = page.getByRole("group", { name: "Reactions" });
  await expect(bar.getByRole("button", { name: "Like, 3" })).toHaveAttribute("aria-pressed", "true");
  await bar.getByRole("button", { name: "Like, 3" }).click();
  await expect(bar.getByRole("button", { name: "Like, 2" })).toHaveAttribute("aria-pressed", "false");
  await bar.getByRole("button", { name: "Heart", exact: true }).click();
  await expect(bar.getByRole("button", { name: "Heart, 1" })).toHaveAttribute("aria-pressed", "true");
});
