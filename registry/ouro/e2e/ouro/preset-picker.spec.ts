import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a preset applies on a click, and the arrow keys move without choosing", async ({ page }) => {
  await openStory(page, "forms-presetpicker--choosing");
  const cards = page.getByRole("list", { name: "Start from a layout" }).getByRole("button");
  await expect(cards.nth(0)).toHaveAttribute("aria-current", "true");
  await cards.nth(1).click();
  await expect(cards.nth(1)).toHaveAttribute("aria-current", "true");
  // WebKit does not focus a button on click; focus it as the keyboard would reach it.
  await cards.nth(1).focus();
  await page.keyboard.press("ArrowRight");
  await expect(cards.nth(2)).toBeFocused();
  await expect(cards.nth(1)).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Enter");
  await expect(cards.nth(2)).toHaveAttribute("aria-current", "true");
});
