import { expect } from "@playwright/test";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.toast });

test("Toast is announced from its live region when it appears", async ({ page, sr }) => {
  await startReading(sr);
  const save = page.getByRole("button", { name: "Save recipe" });
  await heard(sr, () => save.focus(), (phrase) => /save recipe/i.test(phrase) && /\bbutton\b/i.test(phrase), '"Save recipe", button');
  await heard(sr, () => page.keyboard.press("Enter"), (phrase) => /recipe saved/i.test(phrase), '"Recipe saved", the toast', 20_000);
  await expect(page.getByText("Recipe saved")).toBeVisible();
});
