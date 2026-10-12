import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("a spinner is a status that says what is loading", async ({ page }) => {
  await openStory(page, "feedback-spinner--sizes-and-tones");
  await expect(page.getByRole("status").filter({ hasText: "Loading recipes" })).toHaveCount(1);
  await expect(page.locator('[data-ouro="spinner"] svg').first()).toHaveAttribute("aria-hidden", "true");
});
