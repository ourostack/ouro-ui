import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a shared draft highlights the agent's words and takes the person's edits", async ({ page }) => {
  await openStory(page, "chat-drafteditor--shared");
  const box = page.getByRole("textbox", { name: "Reply" });
  await expect(page.locator("[data-ouro-draft-highlights] mark")).toHaveText("I can meet on Friday at ten, and I will bring the revised budget.");
  await box.fill("Thanks, see you Friday.");
  await expect(box).toHaveValue("Thanks, see you Friday.");
  await expect(page.locator("[data-ouro-draft-highlights]")).toHaveCount(0);
});
