import { expect, test } from "@playwright/test";
import { openStory } from "./story";

test("typing fills the slots in order and backspace steps back", async ({ page }) => {
  await openStory(page, "forms-otpfield--states");
  const group = page.getByRole("group", { name: "Verification code" });
  const first = page.getByLabel("Verification code", { exact: true }).first();
  await first.click();
  await page.keyboard.type("123456");
  const slots = group.locator("input[data-ouro-otp-slot]");
  await expect(slots).toHaveCount(6);
  for (const [index, digit] of [..."123456"].entries()) await expect(slots.nth(index)).toHaveValue(digit);
  await page.keyboard.press("Backspace");
  await expect(slots.nth(5)).toHaveValue("");
  await expect(first).toHaveAttribute("autocomplete", "one-time-code");
});
