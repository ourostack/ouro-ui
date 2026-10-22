import { expect } from "@playwright/test";
import { inOneSentence, nameAndRole } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.item });

test("An Item with href is heard as a link by its title, then its description", async ({ page, sr }) => {
  await startReading(sr, page);
  const link = page.getByRole("link", { name: "Braised short ribs" });
  await heard(sr, () => link.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Braised short ribs", "link")), '"Braised short ribs", link');
  await heard(sr, () => page.getByRole("button", { name: "Save" }).focus(), (phrase) => inOneSentence(phrase, nameAndRole("Save", "button")), '"Save", button');
  // Both readers say the description after the link's name and role as focus lands on it.
  await heard(sr, () => link.focus(), (phrase) => inOneSentence(phrase, /\bseared hard, then braised low\b/i), "the link's description, as focus comes back to it");
  await expect(link).toHaveAttribute("aria-describedby", /.+/);
});
