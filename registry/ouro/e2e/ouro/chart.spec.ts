import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("a chart is a named figure whose tooltip the keyboard reaches", async ({ page }) => {
  await openStory(page, "data-chart--playground");
  const figure = page.getByRole("figure", { name: "Recipes per month" });
  await expect(figure).toBeVisible();
  const plot = figure.getByRole("application", { name: "Recipes per month" });
  await expect(plot).toBeVisible();
  await plot.focus();
  await expect(figure.locator("[data-ouro-chart-tooltip]")).toContainText("January");
  await page.keyboard.press("ArrowRight");
  await expect(figure.locator("[data-ouro-chart-tooltip]")).toContainText("February");
  await expect(figure.locator("[data-ouro-chart-tooltip]")).toContainText("Cooked18");
});

test("a chart lists every value in a table and labels each series in its legend", async ({ page }) => {
  await openStory(page, "data-chart--with-table");
  const table = page.getByRole("table", { name: "Recipes per month" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(7);
  await expect(table.getByRole("row").nth(6)).toHaveText(/June\s*31/);
  await openStory(page, "data-chart--playground");
  await expect(page.locator("[data-ouro-chart-legend] li")).toHaveText(["Cooked", "Saved", "Shared"]);
});
