import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("the theme picker sets data-theme on the page and keeps the choice", async ({ page }) => {
  await openStory(page, "actions-themepicker--playground");
  await page.evaluate(() => localStorage.removeItem("ouro-theme-preset"));
  await page.getByRole("button", { name: "Abyss" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "abyss");
  await expect(page.getByRole("button", { name: "Abyss" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("ouro-theme-preset"))).toBe("abyss");
  await page.evaluate(() => localStorage.removeItem("ouro-theme-preset"));
});
