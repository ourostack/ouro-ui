import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("resizes the panels with the keyboard and with a drag", async ({ page }) => {
  await openStory(page, "layout-resizable--side-by-side");
  const handle = page.getByRole("separator", { name: "Resize Ingredients" });
  await expect(handle).toHaveAttribute("aria-valuenow", "35");
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "45");
  await page.keyboard.press("Home");
  await expect(handle).toHaveAttribute("aria-valuenow", "20");
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y, { steps: 5 });
  await page.mouse.up();
  const after = Number(await handle.getAttribute("aria-valuenow"));
  expect(after).toBeGreaterThan(30);
});
