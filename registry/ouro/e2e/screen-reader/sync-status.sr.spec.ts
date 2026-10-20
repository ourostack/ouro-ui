import { inOneSentence, nameAndRole } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.syncStatus });

test("SyncStatus is heard when the connection goes, and when changes are saved again", async ({ page, sr }) => {
  await startReading(sr, page);
  const connected = page.getByRole("switch", { name: "Connected" });
  await heard(sr, () => connected.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Connected", "switch")), '"Connected", switch');
  await heard(sr, () => page.keyboard.press("Space"), (phrase) => inOneSentence(phrase, /\boffline\b/i, /\bkept on this device\b/i), '"Offline: changes are kept on this device", the status');
  await page.keyboard.press("Space");
  const retry = page.getByRole("button", { name: "Retry" });
  await heard(sr, () => retry.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Retry", "button")), '"Retry", button');
  await heard(sr, () => page.keyboard.press("Enter"), (phrase) => inOneSentence(phrase, /\bsaved\b/i), '"Saved", the status', 10_000);
});
