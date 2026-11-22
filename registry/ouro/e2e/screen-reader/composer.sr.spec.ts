import { expect } from "@playwright/test";
import { inOneSentence, nameAndRole } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.composerBasic });

test("Composer's box and send button are announced with their names and roles, and a send leaves focus in the box", async ({ page, sr }) => {
  await startReading(sr, page);
  const box = page.getByRole("textbox", { name: "Message Mia" });
  await heard(sr, () => box.focus(), (phrase) => inOneSentence(phrase, /\bmessage mia\b/i, /\b(edit|text area|text field)\b/i), '"Message Mia", edit text');
  await page.keyboard.type("Running a little late");
  const send = async () => {
    await page.keyboard.press("Enter");
    await expect(box).toHaveValue("");
    await expect(box).toBeFocused();
  };
  await heard(sr, send, (phrase) => /\brunning a little late\b/i.test(phrase) || /\bmessage mia\b/i.test(phrase), "the sent message or the box, after Enter");
  const button = page.getByRole("button", { name: "Send" });
  await heard(sr, () => button.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Send", "button")), '"Send", button');
});
