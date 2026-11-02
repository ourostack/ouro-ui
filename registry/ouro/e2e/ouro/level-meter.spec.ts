import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a level meter is a meter named by its label, with its level in words", async ({ page }) => {
  await openStory(page, "feedback-levelmeter--states");
  const silent = page.getByRole("meter", { name: "Silent microphone" });
  await expect(silent).toHaveAttribute("aria-valuenow", "0");
  await expect(silent).toHaveAttribute("aria-valuetext", "Quiet");
  const speaking = page.getByRole("meter", { name: "Microphone level" });
  await expect(speaking).toHaveAttribute("aria-valuenow", "45");
  await expect(speaking).toHaveAttribute("aria-valuetext", "Speaking");
  await expect(speaking.locator("[data-highlighted]")).toHaveCount(4);
  await expect(page.getByRole("meter", { name: "Loud microphone" })).toHaveAttribute("aria-valuetext", "Loud");
  await expect(page.getByRole("meter", { name: "Hidden label" })).toHaveAttribute("aria-valuenow", "50");
});

test("with reduced motion, the lit bars show whole and the rest stay dark", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStory(page, "feedback-levelmeter--states");
  const meter = page.getByRole("meter", { name: "Microphone level" });
  const fills = meter.locator('[data-ouro-part="fill"]');
  await expect(fills).toHaveCount(8);
  await expect(fills.first()).toHaveCSS("opacity", "1");
  await expect(fills.last()).toHaveCSS("opacity", "0");
  const heights = await fills.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(new Set(heights).size).toBe(1);
});
