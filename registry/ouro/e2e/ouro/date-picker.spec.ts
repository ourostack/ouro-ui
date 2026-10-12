import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test.describe("with a mouse", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("opens the calendar on the date, picks a day and returns focus to the button", async ({ page }) => {
    await openStory(page, "forms-datepicker--playground");
    const button = page.getByRole("button", { name: "Choose date" });
    await button.click();
    const dialog = page.getByRole("dialog", { name: "Delivery date" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("button", { name: "Thursday, March 12, 2026" })).toBeFocused();
    await page.getByRole("button", { name: "Friday, March 20, 2026" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Delivery date" })).toHaveValue("03/20/2026");
    await expect(button).toBeFocused();
  });

  test("takes a typed date and submits it as an ISO date", async ({ page }) => {
    await openStory(page, "forms-datepicker--controlled");
    const box = page.getByRole("textbox", { name: "Delivery date" });
    await expect(box).toHaveValue("12/03/2026");
    await box.fill("1/4/2026");
    await expect(page.getByText("Submits: 2026-04-01")).toBeVisible();
    await box.blur();
    await expect(box).toHaveValue("01/04/2026");
  });
});

test.describe("DatePicker on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  // Chromium reports a coarse pointer for a touch phone; desktop WebKit does not emulate one.
  test.skip(({ browserName }) => browserName !== "chromium", "coarse pointer emulation is Chromium's");

  test("uses the phone's own date input", async ({ page }) => {
    await openStory(page, "forms-datepicker--playground");
    const input = page.getByLabel("Delivery date");
    await expect(input).toHaveAttribute("type", "date");
    await expect(input).toHaveValue("2026-03-12");
    await expect(page.getByRole("button", { name: "Choose date" })).toHaveCount(0);
  });
});

// The dates are ISO days with no time of day, so the far ends of the clock must submit the
// same day as UTC: UTC-11 and UTC+14. 2026-03-09 is the day after the US daylight-saving change.
for (const timezoneId of ["Pacific/Pago_Pago", "Pacific/Kiritimati"]) {
  test.describe(`in ${timezoneId}`, () => {
    test.use({ timezoneId, viewport: { width: 1280, height: 800 } });

    test("submits a picked and a typed day as the same ISO date", async ({ page }) => {
      await openStory(page, "forms-datepicker--in-form");
      expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(timezoneId);
      const sent = page.locator("output");
      // Pick with the keyboard across the change: Saturday the 7th, two days on, Enter.
      await page.getByRole("button", { name: "Choose date" }).click();
      await expect(page.getByRole("button", { name: "Saturday, March 7, 2026" })).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("button", { name: "Monday, March 9, 2026" })).toBeFocused();
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Submit" }).click();
      await expect(sent).toHaveText('{"delivery":"2026-03-09"}');
      // Pick with the mouse.
      await page.getByRole("button", { name: "Choose date" }).click();
      await page.getByRole("button", { name: "Sunday, March 8, 2026" }).click();
      await page.getByRole("button", { name: "Submit" }).click();
      await expect(sent).toHaveText('{"delivery":"2026-03-08"}');
      // Type.
      await page.getByRole("textbox", { name: "Delivery date" }).fill("12/31/2026");
      await page.getByRole("button", { name: "Submit" }).click();
      await expect(sent).toHaveText('{"delivery":"2026-12-31"}');
    });

    test.describe("on a phone", () => {
      test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      // Chromium reports a coarse pointer for a touch phone; desktop WebKit does not emulate one.
      test.skip(({ browserName }) => browserName !== "chromium", "coarse pointer emulation is Chromium's");

      test("the native input submits the same ISO date", async ({ page }) => {
        await openStory(page, "forms-datepicker--in-form");
        expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(timezoneId);
        const input = page.getByLabel("Delivery date");
        await expect(input).toHaveAttribute("type", "date");
        await input.fill("2026-03-09");
        await page.getByRole("button", { name: "Submit" }).click();
        await expect(page.locator("output")).toHaveText('{"delivery":"2026-03-09"}');
      });
    });
  });
}
