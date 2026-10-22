import { inOneSentence, nameAndRole } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.describe("the agent's words", () => {
  test.use({ storyId: storyIds.draftEditor });

  test("DraftEditor's box says how much of the draft the agent wrote, and how it starts", async ({ page, sr }) => {
    await startReading(sr, page);
    const box = page.getByRole("textbox", { name: "Reply" });
    await heard(sr, () => box.focus(), (phrase) => inOneSentence(phrase, /\bwritten by an agent\b/i, /\b1 passage\b/i, /\bi can meet on friday\b/i), '"Written by an agent: 1 passage, starting “I can meet on Friday…”", the description');
  });
});

test.describe("where the draft stands", () => {
  test.use({ storyId: storyIds.draftEditorAsks });

  test("DraftEditor says where the draft stands when it changes", async ({ page, sr }) => {
    await startReading(sr, page);
    const ask = page.getByRole("button", { name: "Ask for input" });
    await heard(sr, () => ask.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Ask for input", "button")), '"Ask for input", button');
    await heard(sr, () => page.keyboard.press("Enter"), (phrase) => inOneSentence(phrase, /\bneeds your input\b/i, /\bwhich day suits you\b/i), '"Needs your input, Ouro: Which day suits you?", the status', 10_000);
  });
});
