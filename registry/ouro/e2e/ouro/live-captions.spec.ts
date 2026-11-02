import { expect, test } from "../ouro-fixtures";
import { holdClock, openStory } from "./story";

test("a caption band is a region named by its label, two lines tall, with interim words muted", async ({ page }) => {
  await openStory(page, "display-livecaptions--states");
  const band = page.getByRole("region", { name: "Captions", exact: true });
  await expect(band).toBeVisible();
  const view = band.locator("[data-ouro-live-captions-window]");
  const lineHeight = await view.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight));
  expect((await view.boundingBox())!.height).toBeCloseTo(2 * lineHeight, 0);
  const final = band.locator('[data-ouro-live-captions-line="m1"] [data-ouro-live-captions-words]');
  const interim = band.locator('[data-ouro-live-captions-line="m2"] [data-ouro-live-captions-words]');
  await expect(final).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(interim).not.toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(band.locator("[data-ouro-live-captions-speaker]").first()).toHaveText("Mara");
});

test("before anyone speaks the band shows a placeholder line, and without captions it says why, at the same height", async ({ page }) => {
  await openStory(page, "display-livecaptions--states");
  const height = (await page.getByRole("region", { name: "Captions", exact: true }).boundingBox())!.height;
  const waiting = page.getByRole("region", { name: "Captions before anyone speaks" });
  await expect(waiting.locator("[data-ouro-live-captions-placeholder]")).toHaveText("Waiting for someone to speak…");
  const without = page.getByRole("region", { name: "Captions in a meeting without them" });
  await expect(without.locator("[data-ouro-live-captions-unavailable]")).toHaveText("Captions aren't available in this meeting");
  await expect(without.locator("[data-ouro-live-captions-line]")).toHaveCount(0);
  expect((await waiting.boundingBox())!.height).toBe(height);
  expect((await without.boundingBox())!.height).toBe(height);
});

test("read aloud: a final line is announced at once, and the next waits for the 2-second gap", async ({ page }) => {
  await page.clock.install();
  await openStory(page, "display-livecaptions--read-aloud");
  await holdClock(page);
  const say = page.getByRole("button", { name: "Say the next line" });
  const announcer = page.locator("[data-ouro-announcer]");
  await say.click();
  await page.clock.runFor(100);
  await expect(announcer).toHaveText("Jonas Ek: Yes, and then the budget, if there is time.");
  await say.click();
  await page.clock.runFor(1000);
  await expect(announcer).toHaveText("Jonas Ek: Yes, and then the budget, if there is time.");
  await page.clock.runFor(1000);
  await expect(announcer).toHaveText("Mara Lind: Good. The launch moves to Thursday.");
});

test("the band keeps its height as lines come, at every size", async ({ page }) => {
  await openStory(page, "display-livecaptions--reduced-motion");
  const band = page.getByRole("region", { name: "Captions" });
  const height = (await band.boundingBox())!.height;
  for (let press = 0; press < 3; press += 1) {
    await page.getByRole("button", { name: "Say the next line" }).click();
    expect((await band.boundingBox())!.height).toBe(height);
  }
  await expect(band.locator("[data-ouro-live-captions-line]")).toHaveCount(3);
  await openStory(page, "display-livecaptions--sizes");
  const heights = await Promise.all(["Small captions", "Medium captions", "Large captions"].map(async (name) => (await page.getByRole("region", { name }).locator("[data-ouro-live-captions-window]").boundingBox())!.height));
  expect(heights).toEqual([40, 56, 64]);
});
