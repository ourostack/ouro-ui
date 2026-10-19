import { test } from "@playwright/test";
import { checklistShipped, storyIds } from "./stories";

// Runs before either screen reader starts (the `stories` project the voiceover and nvda projects
// depend on): a renamed story fails here, by id, rather than as a page with nothing to read.
test("every story the screen-reader lane opens is in this Storybook", async ({ request }) => {
  const response = await request.get("index.json");
  if (!response.ok()) throw new Error(`[sr] infrastructure: Storybook's index.json answered ${response.status()}`);
  const index = (await response.json()) as { entries: Record<string, unknown> };
  const wanted = Object.entries(storyIds)
    .filter(([name]) => name !== "checklist" || checklistShipped)
    .map(([, id]) => id);
  const missing = wanted.filter((id) => !(id in index.entries));
  if (missing.length > 0) throw new Error(`[sr] these story ids are not in Storybook's index.json: ${missing.join(", ")}`);
});
