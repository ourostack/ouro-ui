import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("finishing the last task bursts confetti from the message", async ({ page }) => {
  await openStory(page, "feedback-celebrate--in-context");
  await expect(page.getByText("All done for today")).toHaveCount(0);
  for (const chore of ["Water the plants", "Take out the bins", "Book the dentist"]) await page.getByLabel(chore).check();
  await expect(page.getByText("All done for today")).toBeVisible();
  await expect(page.locator('[data-ouro="celebrate"] [data-ouro-part="piece"]')).toHaveCount(12);
});

test("with reduced motion the message shows and no confetti flies", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStory(page, "feedback-celebrate--in-context");
  for (const chore of ["Water the plants", "Take out the bins", "Book the dentist"]) await page.getByLabel(chore).check();
  await expect(page.getByText("All done for today")).toBeVisible();
  await expect(page.locator('[data-ouro="celebrate"] [data-ouro-part="piece"]').first()).toBeHidden();
});
