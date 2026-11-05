import { chromium } from "playwright";
const url = process.env.URL ?? "http://localhost:6123/iframe.html?id=chat-messagelist--springs&viewMode=story";
const out = new URL("./video/", import.meta.url).pathname;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 700, height: 500 }, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width: 700, height: 500 } }, reducedMotion: process.env.REDUCED ? "reduce" : "no-preference" });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForSelector("[data-ouro-message-list-scroller]");
  const box = await page.locator("[data-ouro-message-list-scroller]").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
  await page.waitForTimeout(600);
  const wheel = async (deltas) => { for (const d of deltas) { await page.mouse.wheel(0, d); await page.waitForTimeout(16); } };
  // A steady trackpad scroll up, then a rest.
  await wheel(Array(40).fill(-22));
  await page.waitForTimeout(900);
  // A fling up: a quick flick that decays, as momentum does.
  await wheel(Array.from({ length: 50 }, (_, i) => -Math.round(110 * Math.pow(0.93, i))));
  await page.waitForTimeout(1000);
  // A fling down to the bottom and on past it.
  await wheel(Array.from({ length: 70 }, (_, i) => Math.round(160 * Math.pow(0.95, i))));
  await page.waitForTimeout(1200);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await context.close();
} finally {
  await browser.close();
}
