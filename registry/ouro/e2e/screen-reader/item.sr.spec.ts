import { expect } from "@playwright/test";
import { inOneSentence, nameAndRole } from "./phrases";
import { heard, heardOrDescribed, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.item });

test("An Item with href is heard as a link by its title, then its description", async ({ page, sr }) => {
  await startReading(sr, page);
  const link = page.getByRole("link", { name: "Braised short ribs" });
  const saysLink = (phrase: string) => inOneSentence(phrase, nameAndRole("Braised short ribs", "link"));
  const saysDescription = (phrase: string) => inOneSentence(phrase, /\bseared hard, then braised low\b/i);
  await heard(sr, () => link.focus(), saysLink, '"Braised short ribs", link');
  await heard(sr, () => page.getByRole("button", { name: "Save" }).focus(), (phrase) => inOneSentence(phrase, nameAndRole("Save", "button")), '"Save", button');
  // NVDA says the description right after the link; VoiceOver after a pause, as its own phrase,
  // and when it leaves it out it is asked to describe the focused link.
  await heardOrDescribed(sr, () => link.focus(), saysDescription, saysDescription, "the link's description, as focus comes back to it", { finding: "ourostack/ouro-ui#183" });
  await expect(link).toHaveAttribute("aria-describedby", /.+/);
});
