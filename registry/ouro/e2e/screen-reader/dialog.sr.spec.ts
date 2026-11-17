import { expect } from "@playwright/test";
import { inOneSentence, nameAndRole } from "./phrases";
import { heard, heardOrDescribed, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.dialog });

test("Dialog is announced with its title and role when it opens, and its trigger again when it closes", async ({ page, sr }) => {
  await startReading(sr, page);
  const trigger = page.getByRole("button", { name: "Edit", exact: true });
  // "Edit" and "button" in one spoken sentence: not the dialog's "Edit recipe", not an "edit text" field.
  const saysTrigger = (phrase: string) => inOneSentence(phrase, nameAndRole("Edit", "button", "text|recipe"));
  await heard(sr, () => trigger.focus(), saysTrigger, '"Edit", button');
  // What the page marks inert, hidden or guarded before the dialog opens, which must be all it marks once it closes: a
  // screen reader skips what a closed dialog leaves marked (ourostack/ouro-ui#1812).
  const marked = () =>
    page.evaluate(() => ({
      inert: document.querySelectorAll("[inert]").length,
      hidden: document.querySelectorAll('[aria-hidden="true"]:not(svg, svg *)').length,
      guards: document.querySelectorAll("[data-base-ui-focus-guard]").length,
    }));
  const before = await marked();
  // VoiceOver at times says only the focused field as the dialog opens, not the dialog
  // (ourostack/ouro-ui#119): it is then asked to describe the focus's container, which must name
  // the dialog as a web dialog in one sentence.
  await heardOrDescribed(sr, () => page.keyboard.press("Enter"), (phrase) => inOneSentence(phrase, /\bedit recipe\b/i, /\bdialog\b/i), (phrase) => inOneSentence(phrase, /\bedit recipe\b/i, /\bweb dialog\b/i), '"Edit recipe", dialog, as it opens', { finding: "ourostack/ouro-ui#119", from: "container" });
  const dialog = page.getByRole("dialog", { name: "Edit recipe" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await heard(sr, () => page.keyboard.press("Escape"), saysTrigger, '"Edit", button, as focus returns');
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await marked()).toEqual(before);
});
