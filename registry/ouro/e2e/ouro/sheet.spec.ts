import { expect, test, type Locator, type Page } from "@playwright/test";
import { openStory } from "./story";

/** Waits for the sheet's transitions (open, spring back) to finish, then returns its box. */
async function settledBox(sheet: Locator) {
  await sheet.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  return (await sheet.boundingBox())!;
}

/** Drags with the mouse over `durationMs`, slowly enough that release velocity doesn't count as a flick. */
async function drag(page: Page, x: number, fromY: number, toY: number, durationMs: number) {
  const steps = 15;
  await page.mouse.move(x, fromY);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(x, fromY + ((toY - fromY) * step) / steps);
    await page.waitForTimeout(durationMs / steps);
  }
  await page.mouse.up();
}

test.use({ viewport: { width: 390, height: 844 } });

test("open the sheet, drag it part way and it springs back, then drag it away", async ({ page }) => {
  await openStory(page, "overlays-sheet--playground");
  await page.getByRole("button", { name: "Save" }).click();
  const sheet = page.getByRole("dialog", { name: "Save to cookbook" });
  await expect(sheet).toBeVisible();
  await expect(page.getByRole("button", { name: "Baking (saved)" })).toBeVisible();

  const box = await settledBox(sheet);
  const x = box.x + box.width / 2;
  const y = box.y + 12;

  // A short, slow drag springs back.
  await drag(page, x, y, y + box.height * 0.1, 600);
  await expect(sheet).toBeVisible();
  expect((await settledBox(sheet)).y).toBeCloseTo(box.y, 0);

  // A long drag down dismisses it.
  await drag(page, x, y, y + box.height * 0.8, 600);
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: "Save" })).toBeFocused();
});

test("Escape closes the sheet and returns focus to the trigger", async ({ page }) => {
  await openStory(page, "overlays-sheet--playground");
  const trigger = page.getByRole("button", { name: "Save" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Save to cookbook" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(trigger).toBeFocused();
});
