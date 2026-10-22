import { expect } from "@playwright/test";
import { inOneSentence, nameAndRole } from "./phrases";
import { describesFocus, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.reorderableDisabled });

/** `aria-disabled`: VoiceOver says "dimmed", NVDA "unavailable". */
const UNAVAILABLE = /\b(dimmed|unavailable)\b/i;
/** Any part of the handle's pick-up instructions. */
const INSTRUCTIONS = /\b(pick up|menu of moves|arrow keys)\b/i;

test("A disabled Reorderable's handles are heard as unavailable buttons, without the pick-up instructions", async ({ page, sr }) => {
  await startReading(sr, page);
  const handle = page.getByRole("button", { name: "Reorder Sear the ribs" });
  // VoiceOver's cursor does not follow focus() onto a dimmed button (run 39848346221: it stayed on
  // the list), so each reader is asked for the control with the keyboard focus, as a person checks it.
  await handle.focus();
  const described = await describesFocus(sr, (phrase) => inOneSentence(phrase, nameAndRole("Reorder Sear the ribs", "button"), UNAVAILABLE), '"Reorder Sear the ribs", button, dimmed or unavailable');
  expect(described).not.toMatch(INSTRUCTIONS);
  await expect(handle).toHaveAttribute("aria-disabled", "true");
  expect(await handle.getAttribute("aria-describedby")).toBeNull();
});
