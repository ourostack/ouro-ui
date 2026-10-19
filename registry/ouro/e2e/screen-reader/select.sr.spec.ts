import { expect } from "@playwright/test";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.select });

test("Select is announced with its label, role and state, and its new value when one is chosen", async ({ page, sr }) => {
  await startReading(sr, page);
  const course = page.getByRole("combobox", { name: "Course" });
  await heard(sr, () => course.focus(), (phrase) => /\bcourse\b/i.test(phrase) && /\bcombo ?box\b/i.test(phrase) && /\bcollapsed\b/i.test(phrase), '"Course", combo box, collapsed');
  // The list opens on its first option, Starter: NVDA reads "list" and the option, VoiceOver "list box".
  await heard(sr, () => page.keyboard.press("ArrowDown"), (phrase) => /\blist\b|\blist ?box\b|\bstarter\b/i.test(phrase), "the list, as it opens");
  await expect(page.getByRole("listbox")).toBeVisible();
  await heard(sr, () => page.keyboard.press("ArrowDown"), (phrase) => /\bmain\b/i.test(phrase), '"Main", the next option');
  await heard(sr, () => page.keyboard.press("ArrowDown"), (phrase) => /\bside\b/i.test(phrase), '"Side", the option after it');
  await heard(sr, () => page.keyboard.press("Enter"), (phrase) => /\bside\b/i.test(phrase), '"Side", the chosen value');
  await expect(course).toHaveText("Side");
});
