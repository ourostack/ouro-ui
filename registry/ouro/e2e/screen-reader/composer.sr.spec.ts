import { expect } from "@playwright/test";
import { pressTab } from "../ouro/story";
import { inOneSentence } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.composerBasic });

test("Composer's box and send button are announced with their names and roles, and Tab reaches Send", async ({ page, sr }) => {
  await startReading(sr, page);
  const box = page.getByRole("textbox", { name: "Message Mia" });
  await heard(sr, () => box.focus(), (phrase) => inOneSentence(phrase, /\bmessage mia\b/i, /\b(edit|text area|text field)\b/i), '"Message Mia", edit text');
  await page.keyboard.type("Running a little late");
  const button = page.getByRole("button", { name: "Send" });
  await heard(sr, () => pressTab(page), (phrase) => inOneSentence(phrase, /\bsend\b/i, /\bbutton\b/i), '"Send", button, reached by Tab');
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(box).toHaveValue("");
});
