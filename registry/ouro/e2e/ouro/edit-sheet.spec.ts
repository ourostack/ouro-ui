import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("saves with loading, then closes and returns focus to the trigger", async ({ page }) => {
  await openStory(page, "overlays-editsheet--playground");
  const trigger = page.getByRole("button", { name: "Edit" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Edit recipe" });
  await sheet.getByRole("textbox", { name: "Name" }).fill("Green shakshuka");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByRole("button", { name: "Save" })).toHaveAttribute("aria-busy", "true");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("keeps the sheet open with the error on the field", async ({ page }) => {
  await openStory(page, "overlays-editsheet--playground");
  await page.getByRole("button", { name: "Edit" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit recipe" });
  const name = sheet.getByRole("textbox", { name: "Name" });
  await name.fill("Pasta");
  await name.press("Enter");
  await expect(name).toBeFocused();
  await expect(name).toHaveAccessibleDescription("You already have a recipe called Pasta.");
  await expect(sheet).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("presents the edit sheet as a bottom sheet", async ({ page }) => {
    await openStory(page, "overlays-editsheet--playground");
    await page.getByRole("button", { name: "Edit" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit recipe" });
    await expect(sheet).toHaveAttribute("data-ouro-presentation", "sheet");
  });
});

test.describe("on a phone with the keyboard up", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("keeps the focused field and the save button in view", async ({ page, browserName }) => {
    test.skip(browserName === "firefox", "isMobile is not supported in Firefox");
    await openStory(page, "overlays-editsheet--playground");
    await page.getByRole("button", { name: "Edit" }).tap();
    const sheet = page.getByRole("dialog", { name: "Edit recipe" });
    await expect(sheet).toHaveAttribute("data-ouro-presentation", "sheet");
    const serves = sheet.getByRole("textbox", { name: "Serves" });
    await serves.tap();
    await expect(serves).toBeFocused();
    // A software keyboard takes about 40% of a phone's height: the page has the rest.
    await page.setViewportSize({ width: 390, height: 508 });
    await expect(serves).toBeInViewport();
    await expect(sheet.getByRole("button", { name: "Save" })).toBeInViewport();
    await serves.fill("6");
    await sheet.getByRole("button", { name: "Save" }).tap();
    await expect(sheet).toBeHidden();
  });
});
