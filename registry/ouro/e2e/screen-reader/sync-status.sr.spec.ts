import { inOneSentence, nameAndRole, ON } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.syncStatus });

test("SyncStatus is heard when the connection goes, and when changes are saved again", async ({ page, sr }) => {
  await startReading(sr, page);
  const connected = page.getByRole("switch", { name: "Connected" });
  await heard(sr, () => connected.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Connected", "switch")), '"Connected", switch');
  await heard(sr, () => page.keyboard.press("Space"), (phrase) => inOneSentence(phrase, /\boffline\b/i, /\bkept on this device\b/i), '"Offline: changes are kept on this device", the status');
  // Space turns the switch on, and VoiceOver speaks its new state. The macOS 26 failure (#2015) moved focus
  // to Retry while that was still spoken, so the spec waits for it, as switch.sr.spec does.
  await heard(sr, () => page.keyboard.press("Space"), (phrase) => inOneSentence(phrase, ON), "on, after Space");
  const retry = page.getByRole("button", { name: "Retry" });
  await heard(sr, () => retry.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Retry", "button")), '"Retry", button');
  await heard(sr, () => page.keyboard.press("Enter"), (phrase) => inOneSentence(phrase, /\bsaved\b/i), '"Saved", the status', 10_000);
});
