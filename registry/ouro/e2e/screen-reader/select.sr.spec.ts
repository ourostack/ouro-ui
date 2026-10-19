import { expect } from "@playwright/test";
import { inOneSentence } from "./phrases";
import { describesFocus, heard, said, saysValue, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.select });

test("Select is announced with its label, role and state, and its new value when one is chosen", async ({ page, sr }) => {
  await startReading(sr, page);
  const course = page.getByRole("combobox", { name: "Course" });
  await heard(sr, () => course.focus(), (phrase) => inOneSentence(phrase, /\bcourse\b/i, /\bcombo ?box\b/i, /\bcollapsed\b/i), '"Course", combo box, collapsed');
  // The list opens on its first option, Starter. What is said as it opens depends on how far its
  // opening transition got (VoiceOver may read the option before it has its name), so it is only
  // logged; each move once it is open must be read.
  await said(sr, () => page.keyboard.press("ArrowDown"), "as the list opens");
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  await list.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  await heard(sr, () => page.keyboard.press("ArrowDown"), (phrase) => inOneSentence(phrase, /\bmain\b/i), '"Main", the next option');
  await heard(sr, () => page.keyboard.press("ArrowDown"), (phrase) => inOneSentence(phrase, /\bside\b/i), '"Side", the option after it');
  // VoiceOver says the value clipped, as the list closes and on request (ourostack/ouro-ui#113),
  // so the value is read from the focused control, as a person checks it.
  await said(sr, () => page.keyboard.press("Enter"), "as the list closes");
  await expect(course).toHaveText("Side");
  await expect(page.getByRole("listbox")).toBeHidden();
  await describesFocus(sr, (phrase) => inOneSentence(phrase, /\bcourse\b/i, (sentence) => saysValue(sr, sentence, "Side", "Course")), '"Course" with "Side", the chosen value');
});
