import { expect, test } from "../ouro-fixtures";
import { openStory, pressTab } from "./story";

test("typing filters the list, and Enter picks the highlighted item", async ({ page }) => {
  await openStory(page, "forms-combobox--modes");
  const herb = page.getByRole("combobox", { name: "Herb", exact: true });
  await herb.fill("");
  await herb.pressSequentially("ros");
  await expect(page.getByRole("option")).toHaveText(["Rosemary"]);
  await herb.press("ArrowDown");
  await herb.press("Enter");
  await expect(herb).toHaveValue("Rosemary");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("multiple shows chips, and a chip's button removes it", async ({ page }) => {
  await openStory(page, "forms-combobox--modes");
  await expect(page.getByRole("button", { name: "Remove Basil" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Basil" }).click();
  await expect(page.getByRole("button", { name: "Remove Basil" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove Mint" })).toBeVisible();
});

test("allowCustomValue keeps free text", async ({ page }) => {
  await openStory(page, "forms-combobox--modes");
  const cuisine = page.getByRole("combobox", { name: "Cuisine" });
  await cuisine.pressSequentially("Georgian");
  await pressTab(page);
  await expect(cuisine).toHaveValue("Georgian");
});

test.describe("by touch on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("a tap on the button opens the sheet, and a tap on an item picks it", async ({ page, browserName }) => {
    // An item cancels pointerdown (Base UI's), so the search input keeps focus. WebKit, as
    // Playwright drives it, then raises no click from a tap, though Pointer Events keeps the
    // click: https://github.com/microsoft/playwright/issues/43569. This fails while that stands.
    test.fail(browserName === "webkit", "Playwright's WebKit tap raises no click after a cancelled pointerdown (microsoft/playwright#43569)");
    await openStory(page, "forms-combobox--modes");
    // With a coarse pointer on a narrow screen, the field is a button that opens a sheet.
    const herb = page.getByRole("combobox", { name: "Herb", exact: true });
    await herb.tap();
    await expect(page.getByRole("dialog", { name: "Herb" })).toBeVisible();
    await page.getByRole("option", { name: "Rosemary" }).tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(herb).toContainText("Rosemary");
  });
});
