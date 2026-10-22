import { expect } from "@playwright/test";
import { inOneSentence } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.celebrate });

test("Celebrate says its message once when the last task is ticked", async ({ page, sr }) => {
  await startReading(sr, page);
  await page.getByLabel("Water the plants").check();
  await page.getByLabel("Take out the bins").check();
  const last = page.getByLabel("Book the dentist");
  // Nothing before the spec has ticked it: the Space below is the last chore.
  await expect(last).not.toBeChecked();
  await last.focus();
  await heard(sr, () => page.keyboard.press("Space"), (phrase) => inOneSentence(phrase, /\ball done for today\b/i), '"All done for today", the status', 20_000);
  await expect(last).toBeChecked();
});
