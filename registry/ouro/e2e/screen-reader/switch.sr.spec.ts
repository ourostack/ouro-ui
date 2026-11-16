import { expect } from "@playwright/test";
import { inOneSentence, OFF, ON, SWITCH } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.switch });

test("Switch is announced with its name, role and state, and its change when turned on", async ({ page, sr }) => {
  await startReading(sr, page);
  const timers = page.getByRole("switch", { name: "Cooking timers" });
  const named = /\bcooking timers\b/i;
  await heard(sr, () => timers.focus(), (phrase) => inOneSentence(phrase, named, SWITCH, OFF), '"Cooking timers", switch, off');
  const turnOn = async () => {
    await page.keyboard.press("Space");
    await expect(timers).toBeChecked();
  };
  await heard(sr, turnOn, (phrase) => inOneSentence(phrase, ON), "on, after Space");
});
