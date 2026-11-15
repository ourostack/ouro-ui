import { expect } from "@playwright/test";
import { inOneSentence } from "./phrases";
import { heard, said, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.command });

test("Command reads each command the arrow keys reach from the search, which keeps focus", async ({ page, sr }) => {
  await startReading(sr, page);
  const trigger = page.getByRole("button", { name: "Search…" });
  await trigger.focus();
  // What is said as the palette opens depends on how far the dialog's focus move got: only logged.
  await said(sr, () => page.keyboard.press("Enter"), "as the palette opens");
  const search = page.getByRole("combobox", { name: "Search commands" });
  await expect(search).toBeFocused();
  // The palette opens on its first command, New recipe: each ArrowDown reads the next.
  await heard(sr, () => page.keyboard.press("ArrowDown"), (phrase) => inOneSentence(phrase, /\bimport from a link\b/i), '"Import from a link", the second command');
  await heard(sr, () => page.keyboard.press("ArrowDown"), (phrase) => inOneSentence(phrase, /\bopen shopping list\b/i), '"Open shopping list", the third command');
  // The list is the search's own popup: the arrow keys move through it, and focus stays in the search.
  await expect(search).toBeFocused();
});
