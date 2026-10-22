import { expect } from "@playwright/test";
import { CURRENT_PAGE, inOneSentence, LINK } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.tabsLinks });

test("Tabs that are links are announced as links, the current one as the current page", async ({ page, sr }) => {
  await startReading(sr, page);
  const nav = page.getByRole("navigation", { name: "Search scope" });
  const recipes = nav.getByRole("link", { name: "Recipes" });
  await heard(sr, () => recipes.focus(), (phrase) => inOneSentence(phrase, /\brecipes\b/i, LINK, CURRENT_PAGE), '"Recipes", link, current page');
  await heard(
    sr,
    () => nav.getByRole("link", { name: "Cookbooks" }).focus(),
    (phrase) => inOneSentence(phrase, /\bcookbooks\b/i, LINK, (sentence) => !CURRENT_PAGE.test(sentence)),
    '"Cookbooks", link, and not the current page',
  );
  await expect(recipes).toHaveAttribute("aria-current", "page");
});
