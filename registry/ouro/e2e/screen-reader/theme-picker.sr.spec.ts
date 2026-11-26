import { expect } from "@playwright/test";
import { inOneSentence, RADIO_CHECKED } from "./phrases";
import { heard, heardOrDescribed, onOlderMacOS, said, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.themePicker });

test("ThemePicker is announced as a list of looks: each one's name, its place in the list, and the one chosen with Enter as selected", async ({ page, sr }) => {
  await startReading(sr, page);
  await expect(page.getByRole("listbox", { name: "Theme" })).toBeVisible();
  const ledger = page.getByRole("option", { name: "Ledger" });
  // Moving focus straight to the listbox's first option reads as entering the listbox on macOS 15: VoiceOver says
  // only "You are currently on a list box...", not the option's name or place, even asked directly (ourostack/ouro-ui#3390).
  // macOS 26 reads the option on focus, the same gap #1721 tracks for Menu's first item.
  if (onOlderMacOS()) {
    await said(sr, () => ledger.focus(), '"Ledger", with its place in the list ("2 of 4")');
    console.log("[sr] finding (ourostack/ouro-ui#3390): VoiceOver on macOS 15 does not read the listbox's first option as it gets focus; macOS 26 does");
  } else {
    await heard(sr, () => ledger.focus(), (phrase) => inOneSentence(phrase, /\bLedger\b/i, /\b\d+ of \d+\b/i), '"Ledger", with its place in the list ("2 of 4")');
  }
  // VoiceOver on macOS 15 occasionally says nothing for this step, though focus does move to the next option
  // (two sightings, both silent, no wrong reading: ourostack/ouro-ui#2469). macOS 26 reads it every time.
  await heardOrDescribed(
    sr,
    () => page.keyboard.press("ArrowRight"),
    (phrase) => inOneSentence(phrase, /\bChart\b/i, /\b\d+ of \d+\b/i),
    (phrase) => inOneSentence(phrase, /\bChart\b/i),
    '"Chart", with its place in the list, after ArrowRight',
    { finding: "ourostack/ouro-ui#2469", olderMacOS: true },
  );
  await heard(sr, () => page.keyboard.press("Enter"), (phrase) => inOneSentence(phrase, RADIO_CHECKED), '"selected", after Enter');
  await expect(page.getByRole("option", { name: "Chart" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "chart");
});
