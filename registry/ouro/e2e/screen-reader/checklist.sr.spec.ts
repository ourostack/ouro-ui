import { expect } from "@playwright/test";
import { CHECKBOX, CHECKED, inOneSentence, UNCHECKED } from "./phrases";
import { accessibleName, heard, heardOrDescribed, startReading, test } from "./screen-reader";
import { checklistShipped, storyIds } from "./stories";

test.skip(!checklistShipped, `${storyIds.checklist} arrives with Checklist (registry/ouro/components/ouro/checklist); this spec runs once that folder exists.`);
test.use({ storyId: storyIds.checklist });

test("Checklist announces an item's name, role and state, and its change when ticked", async ({ page, sr }) => {
  await startReading(sr, page);
  const item = page.getByRole("checkbox").first();
  const name = await accessibleName(item);
  const before = await item.isChecked();
  const named = (sentence: string) => sentence.toLowerCase().includes(name.toLowerCase());
  await heard(sr, () => item.focus(), (phrase) => inOneSentence(phrase, named, CHECKBOX, before ? CHECKED : UNCHECKED), `"${name}", checkbox, ${before ? "checked" : "unchecked"}`);
  const after = before ? UNCHECKED : CHECKED;
  // VoiceOver at times says only the checkbox's hint after Space (ourostack/ouro-ui#118): it is then
  // asked to describe the focused row, which must give its name, role and new state in one sentence.
  await heardOrDescribed(sr, () => page.keyboard.press("Space"), (phrase) => inOneSentence(phrase, after), (phrase) => inOneSentence(phrase, named, CHECKBOX, after), `${before ? "unchecked" : "checked"}, after Space`, "ourostack/ouro-ui#118");
  await expect(item).toBeChecked({ checked: !before });
});
