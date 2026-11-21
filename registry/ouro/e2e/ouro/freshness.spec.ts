import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("freshness keeps its width while it refreshes, and says so to agents", async ({ page }) => {
  await openStory(page, "feedback-freshness--refreshing");
  const line = page.locator('[data-ouro="freshness"]');
  await expect(line).toHaveAttribute("data-ouro-refreshing", "");
  await expect(line).toContainText("Updated");
});
