import { expect } from "@playwright/test";
import { inOneSentence, nameAndRole } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.describe("the list-and-detail pattern on a phone", () => {
  test.use({ storyId: storyIds.patternListDetail, viewport: { width: 390, height: 844 } });

  test("a row is heard by its title, its entry's heading as the detail takes the list's place, and the row again after Back", async ({ page, sr }) => {
    await startReading(sr, page);
    const row = page.getByRole("button", { name: "Lentil soup", exact: true });
    await heard(sr, () => row.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Lentil soup", "button")), '"Lentil soup", button');
    const heading = page.getByRole("heading", { level: 2, name: "Lentil soup" });
    await heard(sr, () => page.keyboard.press("Enter"), (phrase) => inOneSentence(phrase, /\blentil soup\b/i, /\bheading\b/i), '"Lentil soup", heading, as the detail takes the list\'s place');
    await expect(heading).toBeFocused();
    const back = page.getByRole("button", { name: "Back to recipes" });
    await heard(sr, () => back.focus(), (phrase) => inOneSentence(phrase, nameAndRole("Back to recipes", "button")), '"Back to recipes", button');
    await heard(sr, () => page.keyboard.press("Enter"), (phrase) => inOneSentence(phrase, nameAndRole("Lentil soup", "button")), '"Lentil soup", button, as focus returns to its row');
    await expect(row).toBeFocused();
  });

  test("a search that finds nothing says so", async ({ page, sr }) => {
    await startReading(sr, page);
    const search = page.getByRole("searchbox", { name: "Search recipes" });
    await search.focus();
    // The status takes the count once typing pauses (ListDetailPage, #2086), so the step waits for it: a screen reader's
    // capture listens through the whole step, and NVDA's next capture would start by stopping its speech.
    const status = page.getByRole("status").filter({ hasText: /match/ });
    await heard(
      sr,
      async () => {
        await search.pressSequentially("zzzz");
        await expect(status).toHaveText("0 matches");
      },
      (phrase) => inOneSentence(phrase, /\b0 matches\b/i),
      '"0 matches", the search\'s status',
    );
  });
});

test.describe("the dashboard pattern", () => {
  test.use({ storyId: storyIds.patternDashboard });

  test("its chart and its table's scrolling region are heard by their names", async ({ page, sr }) => {
    await startReading(sr, page);
    await heard(sr, () => page.getByRole("application", { name: "Orders and returns by month" }).focus(), (phrase) => inOneSentence(phrase, /\borders and returns by month\b/i), '"Orders and returns by month", the chart');
    await heard(sr, () => page.getByRole("region", { name: "Recent activity" }).focus(), (phrase) => inOneSentence(phrase, /\brecent activity\b/i), '"Recent activity", the table\'s scrolling region');
  });
});
