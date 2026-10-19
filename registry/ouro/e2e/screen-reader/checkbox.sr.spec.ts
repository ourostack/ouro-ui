import { expect } from "@playwright/test";
import { heard, saysCheckbox, saysChecked, saysUnchecked, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.checkbox });

test("Checkbox is announced with its name, role and state, and its change when checked", async ({ page, sr }) => {
  await startReading(sr);
  const box = page.getByRole("checkbox", { name: "Email me new recipes" });
  await heard(sr, () => box.focus(), (phrase) => /email me new recipes/i.test(phrase) && saysCheckbox(phrase) && saysUnchecked(phrase), '"Email me new recipes", checkbox, unchecked');
  await heard(sr, () => page.keyboard.press("Space"), saysChecked, "checked, after Space");
  await expect(box).toBeChecked();
});
