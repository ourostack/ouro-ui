import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("Compare shows the original while the key is held and the proposal again when it is let go", async ({ page }) => {
  await openStory(page, "feedback-previewbar--in-context");
  await expect(page.getByText("The Ocean theme", { exact: true })).toBeVisible();
  await page.keyboard.down("c");
  await expect(page.getByText("The original theme", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compare" })).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(400); // real clock: a hold is a press that lasts 350ms
  await page.keyboard.up("c");
  await expect(page.getByText("The Ocean theme", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compare" })).toHaveAttribute("aria-pressed", "false");
});

test("Keep puts the bar away and focus moves on to the page's next control", async ({ page }) => {
  await openStory(page, "feedback-previewbar--in-context");
  await page.getByRole("button", { name: "Keep" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Trying the Ocean theme" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Try the theme again" })).toBeFocused();
});
