import { expect } from "@playwright/test";
import { inOneSentence, nameAndRole } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.timer });

test("Timer's Start is heard in its named group, and the time being up is announced once", async ({ page, sr }) => {
  await startReading(sr, page);
  const start = page.getByRole("group", { name: "Tea" }).getByRole("button", { name: "Start" });
  await heard(sr, () => start.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Start", "button")), '"Start", button');
  await heard(sr, () => page.keyboard.press("Space"), (phrase) => inOneSentence(phrase, /\btea\b/i, /\btime's up\b/i), '"Tea: Time\'s up", the status', 20_000);
  await expect(page.getByRole("group", { name: "Tea" }).getByRole("button", { name: "Dismiss" })).toBeVisible();
});
