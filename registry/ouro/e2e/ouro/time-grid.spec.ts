import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("moves through events with the arrow keys and opens one with Enter", async ({ page }) => {
  await openStory(page, "data-timegrid--work-week");
  const grid = page.getByRole("region", { name: "Team calendar" });
  const thursday = grid.getByRole("list", { name: "Thursday, March 12" });
  await expect(thursday).toBeVisible();
  const forum = thursday.getByRole("button", { name: /Architecture forum, needs your answer/ });
  await expect(forum).toHaveAccessibleName("Thursday, 10 – 11 AM, Architecture forum, needs your answer, Main auditorium");
  await forum.focus();
  await page.keyboard.press("ArrowDown");
  await expect(thursday.getByRole("button", { name: /Focus time/ })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(grid.getByRole("list", { name: "Friday, March 13" }).getByRole("button", { name: /Demo day/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Opened Demo day")).toBeVisible();
  await expect(grid.getByRole("button", { name: /Demo day/ })).toHaveAttribute("aria-current", "true");
});

test("adds an event where an empty slot is pressed", async ({ page }) => {
  await openStory(page, "data-timegrid--day");
  const thursday = page.getByRole("list", { name: "Thursday, March 12" });
  const slots = page.locator("[data-ouro-time-grid-slots]");
  const box = (await slots.boundingBox())!;
  // 4 PM: two thirds of the way down the day.
  await page.mouse.click(box.x + box.width / 2, box.y + (box.height * 16.1) / 24);
  await expect(thursday.getByRole("button", { name: /New event, tentative/ })).toHaveAccessibleName(/^Thursday, 4:00 – 4:30 PM, New event, tentative$/);
});
