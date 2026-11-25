import { expect } from "@playwright/test";
import { inOneSentence, nameAndRole } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.toastAction });

test("A toast's Undo is reached from the keyboard and read out", async ({ page, sr }) => {
  await startReading(sr, page);
  const remove = page.getByRole("button", { name: "Delete recipe" });
  await heard(sr, () => remove.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Delete recipe", "button")), '"Delete recipe", button');
  await heard(sr, () => page.keyboard.press("Enter"), (phrase) => inOneSentence(phrase, /\brecipe deleted\b/i), '"Recipe deleted", the toast', 20_000);
  const undo = page.getByRole("button", { name: "Undo" });
  for (let press = 0; press < 12 && !(await undo.evaluate((el) => el === document.activeElement)); press++) await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Undo" })).toBeFocused();
  await heard(sr, () => page.keyboard.press("Enter"), (phrase) => inOneSentence(phrase, /\brecipe restored\b/i), '"Recipe restored", announced', 20_000);
});
