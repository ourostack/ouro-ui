import { expect } from "@playwright/test";
import { inOneSentence } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

test.use({ storyId: storyIds.routeProgress });

test("RouteProgress is announced once from its status region when a navigation starts", async ({ page, sr }) => {
  await startReading(sr, page);
  const loading = page.getByRole("switch", { name: "Loading the next page" });
  await loading.focus();
  await heard(sr, () => page.keyboard.press("Space"), (phrase) => inOneSentence(phrase, /\bloading\b(?! the next page)/i), '"Loading", the status', 20_000);
  await expect(page.locator('[data-ouro="route-progress"]')).toHaveText("Loading");
});
