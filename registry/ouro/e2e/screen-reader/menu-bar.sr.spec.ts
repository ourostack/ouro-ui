import { expect } from "@playwright/test";
import type { VoiceOverPlaywright } from "@guidepup/playwright";
import { inOneSentence } from "./phrases";
import { cursorReaches, heard, onOlderMacOS, said, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.menuBar });

test("MenuBar opens File from the keyboard on its first item, reads the next item, and returns to File on Escape", async ({ page, sr }) => {
  await startReading(sr, page);
  const file = page.getByRole("menuitem", { name: "File", exact: true });
  await heard(sr, () => file.focus(), (phrase) => inOneSentence(phrase, /\bfile\b/i), '"File", the bar\'s first menu');
  const menu = page.getByRole("menu");
  const open = async () => {
    await page.keyboard.press("Enter");
    await expect(menu.getByRole("menuitem", { name: /^New recipe/ })).toBeFocused();
  };
  // macOS 15's VoiceOver says only its hint as a menu opens on its first item, as Menu's spec records (ourostack/ouro-ui#1721).
  if (onOlderMacOS()) await said(sr, open, "as File opens on New recipe");
  else await heard(sr, open, (phrase) => inOneSentence(phrase, /\bnew recipe\b/i), '"New recipe", the first item, as File opens');
  await menu.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  await heard(sr, () => page.keyboard.press("ArrowDown"), (phrase) => inOneSentence(phrase, /\bsave\b/i), '"Save", the next item');
  await heard(sr, () => page.keyboard.press("Escape"), (phrase) => inOneSentence(phrase, /\bfile\b/i), '"File" as focus returns');
  await expect(menu).toBeHidden();
  await expect(file).toBeFocused();
});

test("MenuBar: VoiceOver's cursor moves from the open File menu's trigger into its items, past no unnamed button", async ({ page, sr }) => {
  test.skip(process.platform !== "darwin", "VoiceOver's cursor only: NVDA reads a menu from the focus");
  const voiceOver = sr as VoiceOverPlaywright;
  await startReading(sr, page);
  const file = page.getByRole("menuitem", { name: "File", exact: true });
  await heard(sr, () => file.focus(), (phrase) => inOneSentence(phrase, /\bfile\b/i), '"File", the bar\'s first menu');
  const menu = page.getByRole("menu");
  await said(sr, async () => {
    await page.keyboard.press("Enter");
    await expect(menu.getByRole("menuitem", { name: /^New recipe/ })).toBeFocused();
  }, "as File opens");
  await menu.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  // The cursor follows the focus to New recipe. Back from there it reaches File, and forward again New recipe: the popup is
  // read right after its trigger (Base UI's aria-owns), and the guards #665 hid beside the trigger are not stops.
  await cursorReaches(voiceOver, () => voiceOver.previous(), (phrase) => inOneSentence(phrase, /\bfile\b/i), '"File", the open menu\'s trigger');
  await cursorReaches(voiceOver, () => voiceOver.next(), (phrase) => inOneSentence(phrase, /\bnew recipe\b/i), '"New recipe", the menu\'s first item');
  await expect(menu).toBeVisible();
});
