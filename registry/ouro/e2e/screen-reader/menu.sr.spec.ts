import { expect } from "@playwright/test";
import { inOneSentence, nameAndRole } from "./phrases";
import { heard, heardOrDescribed, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.menu });

test("Menu is announced from its trigger, reads each item the arrow keys reach, and returns to the trigger on Escape", async ({ page, sr }) => {
  await startReading(sr, page);
  const trigger = page.getByRole("button", { name: "Actions" });
  const saysTrigger = (phrase: string) => inOneSentence(phrase, nameAndRole("Actions", "button"));
  await heard(sr, () => trigger.focus(), saysTrigger, '"Actions", button');
  // Opened from the keyboard, the menu moves focus to its first item, Edit, which both readers must read. VoiceOver
  // often says only its hint ("You are currently in a menu."): on VoiceOver only, and for this step only, it is then
  // asked to describe the focused item, which must name Edit as a menu item (ourostack/ouro-ui#1721).
  const menu = page.getByRole("menu");
  const open = async () => {
    await page.keyboard.press("Enter");
    await expect(menu.getByRole("menuitem", { name: /^Edit/ })).toBeFocused();
  };
  await heardOrDescribed(sr, open, (phrase) => inOneSentence(phrase, /\bedit\b/i), (phrase) => inOneSentence(phrase, /\bedit\b/i, /\bmenu item\b/i), '"Edit", the first item, as the menu opens', { finding: "ourostack/ouro-ui#1721", from: "focus" });
  await menu.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  await heard(sr, () => page.keyboard.press("ArrowDown"), (phrase) => inOneSentence(phrase, /\bduplicate\b/i), '"Duplicate", the next item');
  await expect(menu.getByRole("menuitem", { name: /^Duplicate/ })).toBeFocused();
  await heard(sr, () => page.keyboard.press("Escape"), saysTrigger, '"Actions", button, as focus returns');
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(trigger).toBeFocused();
});
