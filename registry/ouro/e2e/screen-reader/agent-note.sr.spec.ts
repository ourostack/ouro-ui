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
  const rewrite = page.getByRole("button", { name: "Have Ouro rewrite it" });
  await heard(sr, () => rewrite.click(), (phrase) => inOneSentence(phrase, /\byour agent changed this note\b/i), '"Your agent changed this note while you were editing…", the status', 10_000);
});
