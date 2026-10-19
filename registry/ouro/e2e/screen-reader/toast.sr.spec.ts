import { expect } from "@playwright/test";
import { inOneSentence, nameAndRole } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.toast });

test("Toast is announced from its live region when it appears", async ({ page, sr }) => {
  await startReading(sr, page);
  const save = page.getByRole("button", { name: "Save recipe" });
  await heard(sr, () => save.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Save recipe", "button")), '"Save recipe", button');
  await heard(sr, () => page.keyboard.press("Enter"), (phrase) => inOneSentence(phrase, /\brecipe saved\b/i), '"Recipe saved", the toast', 20_000);
  await expect(page.getByText("Recipe saved")).toBeVisible();
});
