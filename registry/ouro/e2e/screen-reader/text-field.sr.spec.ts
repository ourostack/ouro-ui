import { expect } from "@playwright/test";
import { inOneSentence, INVALID, nameAndRole, REQUIRED } from "./phrases";
import { describesFocus, heard, said, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.describe("a described, required field", () => {
  test.use({ storyId: storyIds.textFieldStates });

  test("TextField is announced with its label, role and required state, and its description", async ({ page, sr }) => {
    await startReading(sr, page);
    const email = page.getByRole("textbox", { name: "Email" });
    await heard(sr, () => email.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Email", "(edit|text field)"), REQUIRED), '"Email", edit text, required');
    // The description can come in a later phrase than the name: focus leaves and comes back, and
    // what is said on the way out (the invalid Source field) is only logged.
    await said(sr, () => page.getByRole("textbox", { name: "Source" }).focus(), "on the next field");
    await heard(sr, () => email.focus(), (phrase) => inOneSentence(phrase, /\bwe send the shopping list here\b/i), '"We send the shopping list here.", the description');
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
