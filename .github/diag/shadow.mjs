// Diagnostic only (branch diag/webkit-frames): what a window's shadow costs WebKit to paint, per shadow, at scale 2.
import { chromium, webkit } from "@playwright/test";
const base = process.argv[2];
const W = (v) => `.site-window { box-shadow: ${v} !important; }`;
const VARIANTS = {
  asis: "",
  none: W("none"),
  one3: W("0 1px 3px oklch(0.19 0.02 250 / 0.08)"),
  one2: W("0 1px 2px oklch(0.19 0.02 250 / 0.06)"),
  noblur: W("0 1px 0 oklch(0.19 0.02 250 / 0.08)"),
  ring: W("0 0 0 1px oklch(0.19 0.02 250 / 0.08)"),
  srgb: W("0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.08)"),
  square: ".site-window { border-radius: 0 !important; }",
  drop: ".site-window { box-shadow: none !important; filter: drop-shadow(0 1px 2px oklch(0.19 0.02 250 / 0.08)); }",
};
const frames = (page, n) => page.evaluate((n) => new Promise((resolve) => {
  const out = []; let last = performance.now();
  const loop = () => { const t = performance.now(); out.push(Math.round(t - last)); last = t; if (out.length < n) requestAnimationFrame(loop); else resolve(out); };
  requestAnimationFrame(loop);
}), n);
const sum = (a) => a.reduce((x, y) => x + y, 0);
for (const [type, scale] of [[webkit, 2], [webkit, 1], [chromium, 2], [chromium, 1]]) {
  const browser = await type.launch();
  for (const [name, css] of Object.entries(VARIANTS)) {
    if ((type === chromium || scale === 1) && !["asis", "none"].includes(name)) continue;
    const rows = [];
    for (let i = 0; i < 2; i++) try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale });
      page.setDefaultTimeout(30000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(base + "voyage/");
      await page.locator("html[data-site-ready]").waitFor({ state: "attached" });
      if (css) await page.addStyleTag({ content: css });
      await page.waitForTimeout(1500);
      const p = frames(page, 8);
      await page.evaluate(() => document.querySelector("#chapter-two")?.scrollIntoView());
      const scroll = await p;
      await page.waitForTimeout(800);
      const q = frames(page, 8);
      await page.evaluate(() => document.querySelector("#agents")?.scrollIntoView());
      const agents = await q;
      rows.push(`chapter-two ${sum(scroll)} [${scroll.join("/")}] agents ${sum(agents)} [${agents.join("/")}]`);
      await page.close();
    } catch (e) { rows.push(`error ${e.message.split("\n")[0]}`); }
    for (const row of rows) console.log(`R ${type.name()}@${scale} ${name} | ${row}`);
  }
  await browser.close();
}
