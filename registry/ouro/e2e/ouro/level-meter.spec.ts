import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a level meter is a meter named by its label, with its level in words", async ({ page }) => {
  await openStory(page, "feedback-levelmeter--states");
  const silent = page.getByRole("meter", { name: "Silent microphone" });
  await expect(silent).toHaveAttribute("aria-valuenow", "0");
  await expect(silent).toHaveAttribute("aria-valuetext", "Quiet");
  const speaking = page.getByRole("meter", { name: "Microphone level" });
  await expect(speaking).toHaveAttribute("aria-valuenow", "50");
  await expect(speaking).toHaveAttribute("aria-valuetext", "Speaking");
  await expect(speaking.locator("[data-highlighted]")).toHaveCount(4);
  await expect(page.getByRole("meter", { name: "Loud microphone" })).toHaveAttribute("aria-valuetext", "Loud");
  await expect(page.getByRole("meter", { name: "Hidden label" })).toHaveAttribute("aria-valuenow", "50");
});

test("ordinary speech lights half the bars, every bar the same height, with motion or without", async ({ page }) => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion });
    await openStory(page, "feedback-levelmeter--states");
    const segments = page.getByRole("meter", { name: "Microphone level" }).locator('[data-ouro-part="segment"]');
    await expect(segments).toHaveCount(8);
    await expect(page.getByRole("meter", { name: "Microphone level" }).locator("[data-highlighted]")).toHaveCount(4);
    const heights = await segments.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    expect(new Set(heights).size).toBe(1);
  }
});
