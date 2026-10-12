import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("a group joins its buttons into one row with shared borders", async ({ page }) => {
  await openStory(page, "actions-buttongroup--looks");
  const group = page.getByRole("group", { name: "Pagination" });
  const previous = await group.getByRole("button", { name: "Previous" }).boundingBox();
  const first = await group.getByRole("button", { name: "1" }).boundingBox();
  expect(Math.abs(first!.x - (previous!.x + previous!.width - 1))).toBeLessThan(1);
  await group.getByRole("button", { name: "Previous" }).focus();
  await page.keyboard.press("Tab");
  await expect(group.getByRole("button", { name: "1" })).toBeFocused();
});
