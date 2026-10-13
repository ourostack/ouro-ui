import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a row puts its title and action at either end", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openStory(page, "layout-row--in-context");
  const heading = await page.getByRole("heading", { name: "Recipes" }).boundingBox();
  const action = await page.getByRole("link", { name: "New recipe" }).boundingBox();
  expect(Math.round(action!.y + action!.height / 2)).toBe(Math.round(heading!.y + heading!.height / 2));
  expect(action!.x).toBeGreaterThan(1000);
});

test("a row with stackBelow stacks its buttons on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "layout-row--in-context");
  const cancel = await page.getByRole("button", { name: "Cancel" }).boundingBox();
  const save = await page.getByRole("button", { name: "Save recipe" }).boundingBox();
  expect(save!.y).toBeGreaterThan(cancel!.y + cancel!.height - 1);
  expect(Math.round(save!.width)).toBe(Math.round(cancel!.width));
});
