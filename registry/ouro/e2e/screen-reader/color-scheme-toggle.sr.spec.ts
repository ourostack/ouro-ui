import { expect } from "@playwright/test";
import { CHECKED, inOneSentence, nameAndRole } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.colorSchemeToggle });

test("ColorSchemeToggle is announced as a radio group of schemes, and the scheme chosen with the arrow keys as checked", async ({ page, sr }) => {
  await startReading(sr, page);
  const light = page.getByRole("radio", { name: "Light" });
  await page.getByRole("radio", { name: "System" }).click();
  await heard(sr, () => light.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Light", "radio( button)?")), '"Light", radio button');
  await heard(sr, () => page.keyboard.press("ArrowRight"), (phrase) => inOneSentence(phrase, /\bdark\b/i, CHECKED), '"Dark", checked, after ArrowRight');
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
});
