import { expect } from "@playwright/test";
import { pressTab } from "../ouro/story";
import { inOneSentence } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.timeGridDay });

test("TimeGrid reads each slot the arrow keys reach, then each event Tab reaches", async ({ page, sr }) => {
  await startReading(sr, page);
  const slots = page.getByRole("grid");
  const aDay = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const aTime = /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i;
  await heard(sr, () => slots.focus(), (phrase) => inOneSentence(phrase, aDay, aTime), "a slot's day and time, as the slot grid takes focus");
  await heard(sr, () => page.keyboard.press("ArrowDown"), (phrase) => inOneSentence(phrase, aDay, aTime), "the next slot's day and time");
  await expect(slots).toBeFocused();
  const toEvent = async () => {
    await pressTab(page);
    await expect(page.locator("[data-ouro='time-grid'] button:focus")).toHaveCount(1);
  };
  await heard(sr, toEvent, (phrase) => inOneSentence(phrase, aDay, aTime), "an event's title, day and time range, as Tab leaves the slots");
});
