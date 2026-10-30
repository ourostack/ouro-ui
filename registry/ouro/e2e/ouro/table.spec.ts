import { expect, test } from "../ouro-fixtures";
import { openStory, pressTab } from "./story";

test("on a phone, a row opens from a tap on any cell, and its Save button does not open it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "data-table--in-context");
  const url = page.url();
  await page.getByRole("button", { name: "Save Herb salad" }).click();
  expect(page.url()).toBe(url);
  // A real tap on the cook's name: the row link's hit area covers the cell.
  const cook = page.getByRole("row", { name: /Herb salad/ }).getByText("Sam");
  await cook.scrollIntoViewIfNeeded();
  const box = (await cook.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page).toHaveURL(/#herb-salad$/);
});

test("each row is one tab stop, and its buttons are their own", async ({ page }) => {
  await openStory(page, "data-table--in-context");
  await page.getByRole("link", { name: "Braised short ribs" }).focus();
  await pressTab(page);
  await expect(page.getByRole("button", { name: "Save Braised short ribs" })).toBeFocused();
  await pressTab(page);
  await expect(page.getByRole("link", { name: "Herb salad" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#herb-salad$/);
});

test("the header stays at the top of a long table while it scrolls both ways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "data-table--sticky-header");
  const viewport = page.locator("[data-scroll-viewport]");
  await viewport.evaluate((element) => {
    element.scrollTop = 300;
    element.scrollLeft = 120;
  });
  const top = (await viewport.boundingBox())!.y;
  const header = (await page.getByRole("columnheader", { name: "Station" }).boundingBox())!;
  expect(Math.abs(header.y - top)).toBeLessThanOrEqual(1);
});

test("a header sorts the rows from a click and from the keyboard, and reverses them on the next press", async ({ page }) => {
  await openStory(page, "data-table--sortable");
  const firstRecipe = page.getByRole("rowheader").first();
  await expect(firstRecipe).toHaveText("Seeded rye bread");
  await expect(page.getByRole("columnheader", { name: "Serves" })).toHaveAttribute("aria-sort", "descending");
  await page.getByRole("button", { name: "Serves" }).click();
  await expect(page.getByRole("columnheader", { name: "Serves" })).toHaveAttribute("aria-sort", "ascending");
  await expect(firstRecipe).toHaveText("Herb salad");
  await page.getByRole("button", { name: "Recipe" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("columnheader", { name: "Recipe" })).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByRole("columnheader", { name: "Serves" })).not.toHaveAttribute("aria-sort");
  await expect(firstRecipe).toHaveText("Braised short ribs");
  await page.keyboard.press("Space");
  await expect(firstRecipe).toHaveText("Tadka dal");
  await expect(page.getByRole("button", { name: "Recipe" })).toBeFocused();
});

test("on a phone, a tap on a header sorts the rows inside the sideways scroll, and the rows keep their links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "data-table--sortable");
  const time = page.getByRole("button", { name: "Time" });
  await time.scrollIntoViewIfNeeded();
  await time.click();
  await expect(page.getByRole("columnheader", { name: "Time" })).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByRole("rowheader").first()).toHaveText("Herb salad");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("link", { name: "Herb salad" }).click();
  await expect(page).toHaveURL(/#herb-salad$/);
});
