import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a relative time says how long ago, and keeps itself current", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-06-01T12:00:00Z") });
  await openStory(page, "text-relativetime--in-context");
  const first = page.locator('[data-ouro="relative-time"]').first();
  await expect(first).toHaveText("2 minutes ago");
  await page.clock.runFor(60_000);
  await expect(first).toHaveText("3 minutes ago");
  await expect(page.locator('[data-ouro="relative-time"]').last()).toHaveText("last week");
});
