import { chromium } from "playwright";
const url = "http://localhost:6123/iframe.html?id=chat-messagelist--springs&viewMode=story";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 700, height: 500 } });
  await page.goto(url);
  await page.waitForSelector("[data-ouro-message-list-scroller]");
  const box = await page.locator("[data-ouro-message-list-scroller]").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
  await page.evaluate(() => {
    window.__log = [];
    const t0 = performance.now();
    const sample = () => {
      const s = [...document.querySelectorAll("[data-ouro='message']")].map((m) => m.style.transform ? parseFloat(m.style.transform.slice(11)) : null).filter((v) => v !== null);
      window.__log.push([Math.round(performance.now() - t0), s.length, s.length ? Math.max(...s.map(Math.abs)).toFixed(1) : 0, s.length ? (Math.max(...s) - Math.min(...s)).toFixed(1) : 0]);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const wheel = async (deltas) => { for (const d of deltas) { await page.mouse.wheel(0, d); await page.waitForTimeout(16); } };
  const phase = process.argv[2] ?? "fling";
  if (phase === "steady") await wheel(Array(40).fill(-15));
  if (phase === "fling") await wheel(Array.from({ length: 50 }, (_, i) => -Math.round(110 * Math.pow(0.93, i))));
  if (phase === "edge") await wheel(Array(12).fill(40));
  await page.waitForTimeout(1200);
  const log = await page.evaluate(() => window.__log);
  console.log(log.filter((_, i) => i % 4 === 0).map((r) => r.join(":")).join("  "));
} finally { await browser.close(); }
