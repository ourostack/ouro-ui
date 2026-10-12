import { expect, test } from "@playwright/test";
import { openStory, settledBox } from "./story";

test("a segmented control switches the view and slides its thumb", async ({ page }) => {
  await openStory(page, "navigation-segmentedcontrol--in-context");
  const grid = page.getByRole("button", { name: "Grid" });
  await grid.click();
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("as a grid")).toBeVisible();
  const thumb = page.locator("[data-ouro-segment-thumb]");
  const [thumbBox, gridBox] = [await settledBox(thumb), await settledBox(grid)];
  expect(Math.abs(thumbBox.x - gridBox.x)).toBeLessThan(1);
});

test("pressing the pressed segment keeps it pressed", async ({ page }) => {
  await openStory(page, "navigation-segmentedcontrol--in-context");
  const list = page.getByRole("button", { name: "List" });
  await list.click();
  await expect(list).toHaveAttribute("aria-pressed", "true");
});
