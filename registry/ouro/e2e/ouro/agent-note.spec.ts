import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a person pins the agent's note, then edits it, and it becomes theirs", async ({ page }) => {
  await openStory(page, "chat-agentnote--keep");
  const note = page.getByRole("article", { name: "Note Ouro Agent" });
  await expect(note).toBeVisible();
  await note.getByRole("button", { name: "Pin" }).click();
  await expect(note.getByText("Kept: your agent won't change this note.")).toBeVisible();
  await note.getByRole("button", { name: "Edit" }).click();
  const box = note.getByRole("textbox", { name: "Edit" });
  await expect(box).toBeFocused();
  await page.keyboard.type(" Ask about the pilot dates.");
  await note.getByRole("button", { name: "Save" }).click();
  const edited = page.getByRole("article", { name: "Note Edited by you" });
  await expect(edited).toContainText("Ask about the pilot dates.");
  await expect(edited.getByRole("button", { name: "Edit" })).toBeFocused();
});
