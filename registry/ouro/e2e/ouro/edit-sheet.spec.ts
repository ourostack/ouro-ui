import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../ouro-fixtures";
import { holdClock, openStory } from "./story";

test("saves with loading, then closes and returns focus to the trigger", async ({ page }) => {
  await page.clock.install();
  await openStory(page, "overlays-editsheet--playground");
  const trigger = page.getByRole("button", { name: "Edit" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Edit recipe" });
  await sheet.getByRole("textbox", { name: "Name" }).fill("Green shakshuka");
  // The story's save takes 600ms of the page's clock, which stands still while the spec reads the busy state.
  await holdClock(page);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByRole("button", { name: "Save" })).toHaveAttribute("aria-busy", "true");
  await page.clock.resume();
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
  test.skip(({ browserName }) => browserName === "firefox", "isMobile is not supported in Firefox");

  const keyboard = 336;

  /**
   * Opens the sheet, focuses Serves with a tap and raises a stand-in software keyboard: a
   * real one shrinks the visual viewport, not the layout viewport, and fires resize and
   * scroll on it. Checks the field and Save sit above the keyboard.
   */
  async function editWithKeyboardUp(page: Page) {
    await page.clock.install();
    await openStory(page, "overlays-editsheet--playground");
    await page.getByRole("button", { name: "Edit" }).tap();
    const sheet = page.getByRole("dialog", { name: "Edit recipe" });
    await expect(sheet).toHaveAttribute("data-ouro-presentation", "sheet");
    const serves = sheet.getByRole("textbox", { name: "Serves" });
    await serves.tap();
    await expect(serves).toBeFocused();
    await page.evaluate((height) => {
      const viewport = window.visualViewport!;
      Object.defineProperty(viewport, "height", { configurable: true, get: () => window.innerHeight - height });
      Object.defineProperty(viewport, "offsetTop", { configurable: true, get: () => 0 });
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
    }, keyboard);
    const inset = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("*")]
          .map((element) => element.style.getPropertyValue("--drawer-keyboard-inset"))
          .find(Boolean),
      );
    await expect.poll(inset).toBe(`${keyboard}px`);
    const bottomOf = async (locator: Locator) => {
      const box = (await locator.boundingBox())!;
      return box.y + box.height;
    };
    const save = sheet.getByRole("button", { name: "Save" });
    await expect.poll(() => bottomOf(save)).toBeLessThanOrEqual(844 - keyboard);
    await expect.poll(() => bottomOf(serves)).toBeLessThanOrEqual(844 - keyboard);
    expect((await serves.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    await serves.fill("6");
    return { sheet, serves, save };
  }

  test("keeps the field and Save above the keyboard, and saves from a tap on Save", async ({ page }) => {
    const { sheet, serves, save } = await editWithKeyboardUp(page);
    await holdClock(page);
    await save.tap();
    await expect(save).toHaveAttribute("aria-busy", "true");
    // The field keeps focus, so the keyboard (and the inset) stay up until the save lands.
    await expect(serves).toBeFocused();
    await page.clock.resume();
    await expect(sheet).toBeHidden();
  });

  test("saves from Enter in the field", async ({ page }) => {
    const { sheet, serves, save } = await editWithKeyboardUp(page);
    await holdClock(page);
    await serves.press("Enter");
    await expect(save).toHaveAttribute("aria-busy", "true");
    await page.clock.resume();
    await expect(sheet).toBeHidden();
  });
});
