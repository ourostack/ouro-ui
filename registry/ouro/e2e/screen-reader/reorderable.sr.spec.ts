import { expect } from "@playwright/test";
import { inOneSentence, nameAndRole } from "./phrases";
import { describesFocus, heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.reorderableDisabled });

/** `aria-disabled`: VoiceOver says "dimmed", NVDA "unavailable". */
const UNAVAILABLE = /\b(dimmed|unavailable)\b/i;
/** Any part of the handle's pick-up instructions. */
const INSTRUCTIONS = /\b(pick up|menu of moves|arrow keys)\b/i;

test("A disabled Reorderable's handles are heard as unavailable buttons, without the pick-up instructions", async ({ page, sr }) => {
  await startReading(sr, page);
  const handle = page.getByRole("button", { name: "Reorder Sear the ribs" });
  const said = await heard(
    sr,
    () => handle.focus(),
    (phrase) => inOneSentence(phrase, nameAndRole("Reorder Sear the ribs", "button"), UNAVAILABLE),
    '"Reorder Sear the ribs", button, dimmed or unavailable',
  );
  expect(said).not.toMatch(INSTRUCTIONS);
  // Asked for the focused handle in full, the reader gives its description too, and it has none.
  const described = await describesFocus(sr, (phrase) => inOneSentence(phrase, /\breorder sear the ribs\b/i), "the focused handle, described");
  expect(described).not.toMatch(INSTRUCTIONS);
  await expect(handle).toHaveAttribute("aria-disabled", "true");
  expect(await handle.getAttribute("aria-describedby")).toBeNull();
});
