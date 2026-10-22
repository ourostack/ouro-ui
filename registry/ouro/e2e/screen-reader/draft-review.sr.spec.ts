import { inOneSentence, nameAndRole } from "./phrases";
import { heard, startReading, test, type ScreenReader } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.draftReview });

/**
 * Moves the screen reader's cursor on from the top of the page, item by item (line by line in
 * NVDA's browse mode), until it says one phrase `matches` accepts: the draft's marks are text,
 * which no focus reaches.
 */
async function readsOnTo(sr: ScreenReader, matches: (phrase: string) => boolean, what: string, steps = 40): Promise<string> {
  const phrases: string[] = [];
  for (let step = 0; step < steps; step++) {
    await sr.next();
    const phrase = (await sr.lastSpokenPhrase()).trim();
    if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
    if (matches(phrase)) {
      console.log(`[sr] heard ${what}: "${phrase}"`);
      return phrase;
    }
  }
  throw new Error(`[sr] no utterance matched ${what}; heard: ${phrases.map((phrase) => `"${phrase}"`).join(" | ") || "nothing"}`);
}

test("DraftReview reads each change's number and whether it adds or removes text, in the draft", async ({ page, sr }) => {
  await startReading(sr, page);
  await readsOnTo(sr, (phrase) => inOneSentence(phrase, /\bchange 1\b/i, /\bremoved\b/i, /\bthursday\b/i), '"[Change 1, removed: Thursday]"');
  await readsOnTo(sr, (phrase) => inOneSentence(phrase, /\bchange 1\b/i, /\badded\b/i, /\bfriday\b/i), '"[Change 1, added: Friday]"');
});

test("DraftReview names each button by its change, and keeps focus on the list as a change is decided", async ({ page, sr }) => {
  await startReading(sr, page);
  const accept = page.getByRole("button", { name: "Accept, Change 2" });
  await heard(sr, () => accept.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Accept, Change 2", "button")), '"Accept, Change 2", button');
  // Change 2 leaves, and the Accept of the change now in its place, renumbered, takes focus.
  await heard(sr, () => page.keyboard.press("Enter"), (phrase) => inOneSentence(phrase, nameAndRole("Accept, Change 2", "button")), '"Accept, Change 2", button, the next change');
});
