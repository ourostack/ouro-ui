import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a family footer links every site in the bar's order, marks the one shown, and keeps the site's own links after them", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openStory(page, "navigation-familyfooter--in-context");
  const sites = page.getByRole("navigation", { name: "All sites" });
  await expect(sites.getByRole("link")).toHaveText(["Lantern", "Docs", "Guides", "Blog", "Status", "Community", "Source"]);
  await expect(sites.getByRole("link", { name: "Docs" })).toHaveAttribute("aria-current", "true");
  await expect(sites.getByRole("link", { name: "Privacy" })).toHaveCount(0);
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/#privacy$/);
});

test("on a phone the family footer wraps, and the page never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "navigation-familyfooter--in-context");
  await expect(page.getByRole("navigation", { name: "All sites" }).getByRole("link", { name: "Source" })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
