import { expect } from "@playwright/test";
import { inOneSentence, nameAndRole, withoutHints } from "./phrases";
import { heard, heardOrDescribed, onOlderMacOS, said, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.menu });

test("Menu is announced from its trigger, reads each item the arrow keys reach, and returns to the trigger on Escape", async ({ page, sr }) => {
  await startReading(sr, page);
  const trigger = page.getByRole("button", { name: "Actions" });
  const saysTrigger = (phrase: string) => inOneSentence(phrase, nameAndRole("Actions", "button"));
  await heard(sr, () => trigger.focus(), saysTrigger, '"Actions", button');
  // Opened from the keyboard, the menu moves focus to its first item, Edit, which both readers must read. VoiceOver on
  // macOS 15 says only its hint ("You are currently in a menu.") and, asked, that the menu has keyboard focus; on
  // macOS 26.7.2, with the same WebKit 27.2, it reads "Edit menu item" (ourostack/ouro-ui#1721). So on macOS 15
  // (Darwin 24) that step is only logged, as a finding.
  const menu = page.getByRole("menu");
  const open = async () => {
    await page.keyboard.press("Enter");
    await expect(menu.getByRole("menuitem", { name: /^Edit/ })).toBeFocused();
  };
  if (onOlderMacOS()) {
    await said(sr, open, "as the menu opens on Edit");
    console.log("[sr] finding (ourostack/ouro-ui#1721): VoiceOver on macOS 15 does not read a menu's first item as the menu opens; macOS 26 does");
  } else {
    // Now and then macOS 26 says only the item's hint (ourostack/ouro-ui#2085); then the focused item, described, must be Edit.
    await heardOrDescribed(sr, open, (phrase) => inOneSentence(phrase, /\bedit\b/i), (phrase) => inOneSentence(phrase, /\bedit\b/i), '"Edit", the first item, as the menu opens', {
      finding: "ourostack/ouro-ui#2085",
      contradicts: (phrase) => withoutHints(phrase) !== "",
    });
  }
  await menu.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  await heard(sr, () => page.keyboard.press("ArrowDown"), (phrase) => inOneSentence(phrase, /\bduplicate\b/i), '"Duplicate", the next item');
  await expect(menu.getByRole("menuitem", { name: /^Duplicate/ })).toBeFocused();
  await heard(sr, () => page.keyboard.press("Escape"), saysTrigger, '"Actions", button, as focus returns');
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(trigger).toBeFocused();
});
