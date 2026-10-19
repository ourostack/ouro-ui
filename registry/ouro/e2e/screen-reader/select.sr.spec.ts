import { expect } from "@playwright/test";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.select });

test("Select is announced with its label, role and state, and its new value when one is chosen", async ({ page, sr }) => {
  await startReading(sr, page);
  const course = page.getByRole("combobox", { name: "Course" });
  await heard(sr, () => course.focus(), (phrase) => /\bcourse\b/i.test(phrase) && /\bcombo ?box\b/i.test(phrase) && /\bcollapsed\b/i.test(phrase), '"Course", combo box, collapsed');
  await heard(sr, () => page.keyboard.press("ArrowDown"), (phrase) => /\bmain\b/i.test(phrase), '"Main", the first option, as the list opens');
  await expect(page.getByRole("listbox")).toBeVisible();
  await heard(sr, () => page.keyboard.press("ArrowDown"), (phrase) => /\bside\b/i.test(phrase), '"Side", the next option');
  await heard(sr, () => page.keyboard.press("Enter"), (phrase) => /\bside\b/i.test(phrase), '"Side", the chosen value');
  await expect(course).toHaveText("Side");
});
