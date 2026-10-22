import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a person accepts one change and rejects the rest, and the draft settles", async ({ page }) => {
  await openStory(page, "chat-draftreview--review");
  const review = page.getByRole("region", { name: "Changes to review" });
  await expect(review.locator("ins")).toHaveCount(2);
  await review.getByRole("button", { name: "Accept, Change 1" }).click();
  await expect(review.getByRole("button", { name: "Accept, Change 2" })).toBeVisible();
  await review.getByRole("button", { name: "Reject all" }).click();
  await expect(review).toHaveCount(0);
  await expect(page.getByText("Thanks for the notes. I can meet on Friday at ten. Sorry for the delay!")).toBeVisible();
});
