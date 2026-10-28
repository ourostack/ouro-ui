import { expect } from "@playwright/test";
import { CHECKBOX, CHECKED, inOneSentence, UNCHECKED } from "./phrases";
import { heard, heardOrDescribed, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.checkbox });

test("Checkbox is announced with its name, role and state, and its change when checked", async ({ page, sr }) => {
  await startReading(sr, page);
  const box = page.getByRole("checkbox", { name: "Email me new recipes" });
  const named = /\bemail me new recipes\b/i;
  await heard(sr, () => box.focus(), (phrase) => inOneSentence(phrase, named, CHECKBOX, UNCHECKED), '"Email me new recipes", checkbox, unchecked');
  // VoiceOver at times says nothing after Space, though the box is checked (ourostack/ouro-ui#118). It
  // does the same for a native <input type="checkbox"> and a plain role="checkbox", so it is then
  // asked to describe the focused box, which must give its name, role and new state in one sentence.
  await heardOrDescribed(sr, () => page.keyboard.press("Space"), (phrase) => inOneSentence(phrase, CHECKED), (phrase) => inOneSentence(phrase, named, CHECKBOX, CHECKED), "checked, after Space", { finding: "ourostack/ouro-ui#118" });
  await expect(box).toBeChecked();
});
