import { expect } from "@playwright/test";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.dialog });

test("Dialog is announced with its title and role when it opens, and its trigger again when it closes", async ({ page, sr }) => {
  await startReading(sr);
  const trigger = page.getByRole("button", { name: "Edit", exact: true });
  const saysTrigger = (phrase: string) => /\bedit\b/i.test(phrase) && /\bbutton\b/i.test(phrase);
  await heard(sr, () => trigger.focus(), saysTrigger, '"Edit", button');
  await heard(sr, () => page.keyboard.press("Enter"), (phrase) => /edit recipe/i.test(phrase) && /\bdialog\b/i.test(phrase), '"Edit recipe", dialog, as it opens');
  await expect(page.getByRole("dialog", { name: "Edit recipe" })).toBeVisible();
  await heard(sr, () => page.keyboard.press("Escape"), saysTrigger, '"Edit", button, as focus returns');
  await expect(page.getByRole("dialog")).toBeHidden();
});
