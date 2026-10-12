import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("a stack lays its children out top to bottom with an even gap", async ({ page }) => {
  await openStory(page, "layout-stack--in-context");
  const heading = await page.getByRole("heading", { name: "Short ribs" }).boundingBox();
  const text = await page.getByText("Seared hard, braised low").boundingBox();
  const button = await page.getByRole("button", { name: "Start cooking" }).boundingBox();
  expect(Math.round(text!.y - (heading!.y + heading!.height))).toBe(8);
  expect(Math.round(button!.y - (text!.y + text!.height))).toBe(8);
});
