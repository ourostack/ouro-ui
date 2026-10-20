import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("the timer tray lists the timers that are not idle and dismisses a finished one", async ({ page }) => {
  await openStory(page, "feedback-timertray--in-context");
  const tray = page.getByRole("region", { name: "Kitchen timers" });
  await expect(tray.getByRole("listitem")).toHaveCount(2);
  await expect(tray.getByRole("link", { name: "Go to Oven" })).toHaveAttribute("href", "#oven");
  await expect(tray.getByText("Time's up")).toBeVisible();
  await tray.getByRole("button", { name: "Dismiss Eggs" }).click();
  await expect(tray.getByRole("listitem")).toHaveCount(1);
  await tray.getByRole("button", { name: "Cancel Oven" }).click();
  await expect(tray).toBeHidden();
});
