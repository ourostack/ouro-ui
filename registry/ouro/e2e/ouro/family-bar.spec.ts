import { expect, test } from "../ouro-fixtures";
import { openStory, pressTab } from "./story";

test("a family bar links every site, marks the one shown, and follows a link", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openStory(page, "navigation-familybar--in-context");
  const bar = page.getByRole("navigation", { name: "Sites" });
  await expect(bar.getByRole("link")).toHaveText(["Lantern", "Docs", "Guides", "Blog", "Status", "Community", "Source"]);
  await expect(bar.getByRole("link", { name: "Docs" })).toHaveAttribute("aria-current", "true");
  await bar.getByRole("link", { name: "Blog" }).click();
  await expect(page).toHaveURL(/#blog$/);
});

test("on a phone the family bar's row scrolls inside itself, starts with the current site in view, and the page never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "navigation-familybar--far-along");
  const bar = page.getByRole("navigation", { name: "Sites" });
  await expect(bar.getByRole("link", { name: "Community" })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("the keyboard reaches each site in the family bar in order", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "navigation-familybar--playground");
  const names: string[] = [];
  for (let i = 0; i < 7; i++) {
    await pressTab(page);
    names.push(await page.evaluate(() => document.activeElement?.textContent ?? ""));
    await expect(page.locator(":focus")).toBeInViewport({ ratio: 1 });
  }
  expect(names).toEqual(["Lantern", "Docs", "Guides", "Blog", "Status", "Community", "Source"]);
});
