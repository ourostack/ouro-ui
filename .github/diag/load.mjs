// Diagnostic only (branch diag/webkit-frames): what loading /voyage/ costs WebKit at scale 2, per variant.
import { chromium, webkit } from "@playwright/test";
const base = process.argv[2];
const VARIANTS = {
  asis: "",
  cv: "main > *:not(:first-child) { content-visibility: auto; contain-intrinsic-size: auto 1200px; }",
  nolayers: "*, *::before, *::after { will-change: auto !important; }",
  noshadow: "*, *::before, *::after { box-shadow: none !important; }",
  nochapters: "main > *:not(:first-child) { display: none !important; }",
};
const frames = (page, n) => page.evaluate((n) => new Promise((resolve) => {
  const out = []; let last = performance.now();
  const loop = () => { const t = performance.now(); out.push(Math.round(t - last)); last = t; if (out.length < n) requestAnimationFrame(loop); else resolve(out); };
  requestAnimationFrame(loop);
}), n);
const sum = (a) => a.reduce((x, y) => x + y, 0);
for (const [type, scale] of [[webkit, 2], [chromium, 1]]) {
  const browser = await type.launch();
  for (const [name, css] of Object.entries(VARIANTS)) {
    if (type === chromium && !["asis", "cv"].includes(name)) continue;
    const rows = [];
    for (let i = 0; i < 3; i++) try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale });
      page.setDefaultTimeout(30000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      if (css) await page.addInitScript((css) => { const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); }; if (document.head) add(); else document.addEventListener("DOMContentLoaded", add); }, css);
      const t0 = Date.now();
      await page.goto(base + "voyage/");
      const loaded = Date.now() - t0;
      await page.locator("html[data-site-ready]").waitFor({ state: "attached" });
      const ready = Date.now() - t0;
      const after = await frames(page, 6);
      const stable = Date.now() - t0;
      const p = frames(page, 8);
      await page.evaluate(() => document.querySelector("#chapter-two")?.scrollIntoView());
      const scroll = await p;
      const census = await page.evaluate(() => `main>* ${document.querySelector("main")?.children.length} first ${document.querySelector("main")?.firstElementChild?.className?.toString().slice(0, 20)}`);
      rows.push(`load ${loaded} ready ${ready} settled ${stable} [${after.join("/")}] scroll ${sum(scroll)} [${scroll.join("/")}] ${i === 0 ? census : ""}`);
      await page.close();
    } catch (e) { rows.push(`error ${e.message.split("\n")[0]}`); }
    for (const row of rows) console.log(`R ${type.name()}@${scale} ${name} | ${row}`);
  }
  await browser.close();
}
