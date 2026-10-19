import { expect } from "@playwright/test";
import { accessibleName, heard, saysCheckbox, saysChecked, saysUnchecked, startReading, test } from "./screen-reader";
import { checklistShipped, storyIds } from "./stories";

test.skip(!checklistShipped, `${storyIds.checklist} arrives with Checklist (registry/ouro/components/ouro/checklist); this spec runs once that folder exists.`);
test.use({ storyId: storyIds.checklist });

test("Checklist announces an item's name, role and state, and its change when ticked", async ({ page, sr }) => {
  await startReading(sr);
  const item = page.getByRole("checkbox").first();
  const name = await accessibleName(item);
  const before = await item.isChecked();
  const said = (phrase: string) => phrase.toLowerCase().includes(name.toLowerCase()) && saysCheckbox(phrase) && (before ? saysChecked(phrase) : saysUnchecked(phrase));
  await heard(sr, () => item.focus(), said, `"${name}", checkbox, ${before ? "checked" : "unchecked"}`);
  await heard(sr, () => page.keyboard.press("Space"), before ? saysUnchecked : saysChecked, `${before ? "unchecked" : "checked"}, after Space`);
  await expect(item).toBeChecked({ checked: !before });
});
