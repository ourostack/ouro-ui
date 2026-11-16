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
    // instead of the description (run 43852622500): the first is the one that counts. Untouched, the
    // field is not invalid: WebKit read an empty required input's native invalidity (run 43857057791).
    await heard(sr, () => email.focus(), (phrase) => inOneSentence(phrase, /\bemail\b/i, /\bwe send the shopping list here\b/i) && inOneSentence(phrase, /\b(edit|text field)\b/i, REQUIRED) && !INVALID.test(phrase), '"Email", its description, edit text, required, and not invalid before anything is typed');
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
    // The error's full stop ends VoiceOver's sentence before the state ("Pasta Name You already have a
    // recipe called Pasta. required invalid data edit text", run 43854914522), as the description does.
    await describesFocus(sr, (phrase) => inOneSentence(phrase, /\bname\b/i, /\byou already have a recipe called pasta\b/i) && inOneSentence(phrase, INVALID), '"Name", its error, invalid, the focused field');
  });
});
