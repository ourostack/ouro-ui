import { expect } from "@playwright/test";
import { inOneSentence, INVALID, nameAndRole, REQUIRED } from "./phrases";
import { describesFocus, heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.describe("a described, required field", () => {
  test.use({ storyId: storyIds.textFieldStates });

  test("TextField is announced with its label, role and required state, and its description", async ({ page, sr }) => {
    await startReading(sr, page);
    const email = page.getByRole("textbox", { name: "Email" });
    // VoiceOver reads the description between the label and the role ("Email We send the shopping list
    // here. required … edit text"), and its full stop ends the sentence, so the label is asked for with
    // the description, and the role with the required state. On a second visit it read the placeholder
    // instead of the description (run 43852622500): the first is the one that counts.
    await heard(sr, () => email.focus(), (phrase) => inOneSentence(phrase, /\bemail\b/i, /\bwe send the shopping list here\b/i) && inOneSentence(phrase, /\b(edit|text field)\b/i, REQUIRED), '"Email", its description, edit text, required');
  });
});

test.describe("an error after a submit", () => {
  test.use({ storyId: storyIds.formServerErrors });

  test("TextField's error from a submit is announced as focus moves to the field", async ({ page, sr }) => {
    await startReading(sr, page);
    const save = page.getByRole("button", { name: "Save recipe" });
    await heard(sr, () => save.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Save recipe", "button")), '"Save recipe", button');
    const name = page.getByRole("textbox", { name: "Name" });
    const submit = async () => {
      await page.keyboard.press("Enter");
      await expect(name).toBeFocused();
    };
    await heard(sr, submit, (phrase) => inOneSentence(phrase, /\byou already have a recipe called pasta\b/i), '"You already have a recipe called Pasta.", the error, as focus moves to Name');
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await describesFocus(sr, (phrase) => inOneSentence(phrase, /\bname\b/i, INVALID), '"Name", invalid, the focused field');
  });
});
