import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("an event chip is a button that says when, what and where the person stands, and opens on a click", async ({ page }) => {
  await openStory(page, "display-eventchip--open");
  const chip = page.getByRole("button", { name: /^Next meeting: in 12 min Weekly sync/ });
  await expect(chip).toContainText("Needs you");
  await chip.click();
  await expect(page.getByText("Opened Weekly sync")).toBeVisible();
});
