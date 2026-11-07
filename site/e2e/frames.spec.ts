import { expect, test } from "@playwright/test";
import { heightsUntilStill, quietFrames } from "./frames";

// The site's frame measurements count frames, not wall-clock time (ourostack/ouro-ui#684): on a loaded browser a press
// comes late and frames come slowly, and a fixed window then ends before the thing it measures has begun.

test("a height read waits for a press that comes late, and sees the whole slide", async ({ page }) => {
  await page.setContent(`<div id="p" style="height:0;overflow:hidden;transition:height 300ms"><div style="height:200px"></div></div>`);
  const panel = page.locator("#p");
  const heights = heightsUntilStill(panel);
  // Longer than the 900 ms window a fixed read used, before anything moves.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await panel.evaluate((element) => (element.style.height = "200px"));
  const seen = await heights;
  expect(seen.at(-1)).toBe(200);
  expect(seen.some((height) => height > 0 && height < 200)).toBe(true);
});

test("a page that keeps stalling is not called settled until its frames come quickly", async ({ page }) => {
  await page.setContent(`<div id="n"></div>`);
  await page.evaluate(() => {
    const until = performance.now() + 600;
    const stall = () => {
      const start = performance.now();
      while (performance.now() - start < 80);
      if (performance.now() < until) setTimeout(stall, 0);
    };
    stall();
  });
  const start = Date.now();
  await quietFrames(page, 10, 50);
  expect(Date.now() - start).toBeGreaterThan(300);
});

test("a page that never settles is rejected at the cap, naming its frames and longest gap", async ({ page }) => {
  await page.setContent(`<div id="n"></div>`);
  await page.evaluate(() => {
    const stall = () => {
      const start = performance.now();
      while (performance.now() - start < 80);
      setTimeout(stall, 0);
    };
    stall();
  });
  await expect(quietFrames(page, 10, 50, 5)).rejects.toThrow(/never settled: 5 frames, longest gap \d+ ms/);
});

test("a panel that never appears, or never stops moving, is rejected at the cap with the heights seen", async ({ page }) => {
  await page.setContent(`<div id="p" style="height:0"></div><div id="m" style="height:10px"></div>`);
  await expect(heightsUntilStill(page.locator("#p"), 8, 5)).rejects.toThrow(/5 frames, heights seen \[\]/);
  await page.evaluate(() => {
    const move = () => {
      const m = document.getElementById("m")!;
      m.style.height = `${10 + (parseInt(m.style.height) % 7) + 1}px`;
      requestAnimationFrame(move);
    };
    move();
  });
  await expect(heightsUntilStill(page.locator("#m"), 8, 6)).rejects.toThrow(/6 frames, heights seen \[\d+/);
});
