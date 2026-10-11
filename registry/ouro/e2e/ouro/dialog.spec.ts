import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("opens centered, edits a field, and closes with Escape", async ({ page }) => {
    await openStory(page, "overlays-dialog--playground");
    const trigger = page.getByRole("button", { name: "Edit" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Edit recipe" });
    await expect(dialog).toBeVisible();
    const name = dialog.getByRole("textbox", { name: "Name" });
    await name.fill("Green shakshuka");
    await expect(name).toHaveValue("Green shakshuka");
    const box = (await dialog.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(2);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("presents as a bottom sheet", async ({ page }) => {
    await openStory(page, "overlays-dialog--playground");
    await page.getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit recipe" });
    await expect(dialog).toBeVisible();
    await expect.poll(async () => Math.round((await dialog.boundingBox())!.y + (await dialog.boundingBox())!.height)).toBe(844);
  });
});
