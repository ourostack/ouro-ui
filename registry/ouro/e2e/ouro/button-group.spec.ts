import { expect, test } from "../ouro-fixtures";
import { openStory, pressTab } from "./story";

test("a group joins its buttons into one row with shared borders", async ({ page }) => {
  await openStory(page, "actions-buttongroup--looks");
  const group = page.getByRole("group", { name: "Pagination" });
  // Both boxes come from one layout: two reads could straddle a change in the buttons' width.
  const [previous, first] = await group.evaluate((element) =>
    ["Previous", "1"].map((name) => [...element.querySelectorAll("button")].find((button) => button.textContent === name)!.getBoundingClientRect().toJSON()),
  );
  expect(Math.abs(first.x - (previous.x + previous.width - 1))).toBeLessThan(1);
  await group.getByRole("button", { name: "Previous" }).focus();
  await pressTab(page);
  await expect(group.getByRole("button", { name: "1" })).toBeFocused();
});
