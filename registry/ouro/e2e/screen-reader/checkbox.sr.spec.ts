import { expect } from "@playwright/test";
import { CHECKBOX, CHECKED, inOneSentence, UNCHECKED } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.checkbox });

test("Checkbox is announced with its name, role and state, and its change when checked", async ({ page, sr }) => {
  await startReading(sr, page);
  const box = page.getByRole("checkbox", { name: "Email me new recipes" });
  await heard(sr, () => box.focus(), (phrase) => inOneSentence(phrase, /\bemail me new recipes\b/i, CHECKBOX, UNCHECKED), '"Email me new recipes", checkbox, unchecked');
  await heard(sr, () => page.keyboard.press("Space"), (phrase) => inOneSentence(phrase, CHECKED), "checked, after Space");
  await expect(box).toBeChecked();
});
