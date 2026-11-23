import { expect } from "@playwright/test";
import { inOneSentence, RADIO_CHECKED } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.themePicker });

test("ThemePicker is announced as a list of looks: each one's name, its place in the list, and the one chosen with Enter as selected", async ({ page, sr }) => {
  await startReading(sr, page);
  await expect(page.getByRole("listbox", { name: "Theme" })).toBeVisible();
  const ledger = page.getByRole("option", { name: "Ledger" });
  await heard(sr, () => ledger.focus(), (phrase) => inOneSentence(phrase, /\bLedger\b/i, /\b\d+ of \d+\b/i), '"Ledger", with its place in the list ("2 of 4")');
  await heard(sr, () => page.keyboard.press("ArrowRight"), (phrase) => inOneSentence(phrase, /\bChart\b/i, /\b\d+ of \d+\b/i), '"Chart", with its place in the list, after ArrowRight');
  await heard(sr, () => page.keyboard.press("Enter"), (phrase) => inOneSentence(phrase, RADIO_CHECKED), '"selected", after Enter');
  await expect(page.getByRole("option", { name: "Chart" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "chart");
});
