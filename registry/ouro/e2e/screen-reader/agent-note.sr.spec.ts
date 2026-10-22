import { inOneSentence, nameAndRole } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.agentNote });

test("AgentNote says once, while the person edits, that the agent changed the note", async ({ page, sr }) => {
  await startReading(sr, page);
  const edit = page.getByRole("button", { name: "Edit" });
  await heard(sr, () => edit.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Edit", "button")), '"Edit", button');
  await page.keyboard.press("Enter");
  // The agent rewrites the note while the box is open: the notice is spoken from the shared live region.
  // Focus reaches the stand-in for the agent first, as in the Toast spec, so VoiceOver's reading of
  // the button is over before the notice comes.
  const rewrite = page.getByRole("button", { name: "Have Ouro rewrite it" });
  await heard(sr, () => rewrite.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Have Ouro rewrite it", "button")), '"Have Ouro rewrite it", button');
  await heard(sr, () => page.keyboard.press("Enter"), (phrase) => inOneSentence(phrase, /\byour agent changed this note\b/i), '"Your agent changed this note while you were editing…", the status', 20_000);
});
