import { expect } from "@playwright/test";
import { inOneSentence, nameAndRole } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.buttonLoading });

test("Button is announced with its name and role, and its busy state from the live region when loading turns on", async ({ page, sr }) => {
  await startReading(sr, page);
  const save = page.getByRole("button", { name: "Save to cookbook" }).first();
  await heard(sr, () => save.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Save to cookbook", "button")), '"Save to cookbook", button');
  // The story's save lasts 1.6 s, so the busy state is read right after the press, inside the action.
  const press = async () => {
    await page.keyboard.press("Enter");
    await expect(save).toHaveAttribute("aria-busy", "true");
  };
  await heard(sr, press, (phrase) => inOneSentence(phrase, /\bloading\b/i), '"Loading", from the live region, after Enter');
  await expect(save).toBeFocused();
});
