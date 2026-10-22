// Diagnostic only (branch diag/webkit-frames): which shadow or layer makes a menu's open and close cost WebKit at scale 2.
import { chromium, webkit } from "@playwright/test";
const base = process.argv[2];
const VARIANTS = {
  asis: "",
  noshadow: "*, *::before, *::after { box-shadow: none !important; }",
  nopopshadow: "[role='menu'], [role='menu'] *, [data-side] { box-shadow: none !important; }",
  nowinshadow: ".site-window { box-shadow: none !important; }",
  poplayer: "[role='menu'] { will-change: transform; }",
  winnolayer: ".site-window { will-change: auto !important; }",
  nofilter: "*, *::before, *::after { filter: none !important; backdrop-filter: none !important; }",
};
const frames = (page, n) => page.evaluate((n) => new Promise((resolve) => {
  const out = []; let last = performance.now();
  const loop = () => { const t = performance.now(); out.push(Math.round(t - last)); last = t; if (out.length < n) requestAnimationFrame(loop); else resolve(out); };
  requestAnimationFrame(loop);
}), n);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const [type, scale] of [[webkit, 2], [chromium, 1]]) {
  const browser = await type.launch();
  for (const [name, css] of Object.entries(VARIANTS)) {
    if (type === chromium && name !== "asis") continue;
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale });
      page.setDefaultTimeout(30000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(base + "voyage/");
      await page.locator("html[data-site-ready]").waitFor({ state: "attached" });
      if (css) await page.addStyleTag({ content: css });
      await page.waitForTimeout(500);
      const pScroll = frames(page, 10);
      await page.evaluate(() => document.querySelector("#chapter-two").scrollIntoView());
      const scroll = await pScroll;
      await page.locator("#chapter-two[data-chapter-ready]").waitFor({ state: "attached" });
      const handle = page.getByRole("button", { name: /^Reorder The South Pole/ });
      await handle.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + 5, box.y + 5);
      const opens = [], closes = [], picks = [];
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(400);
        const po = frames(page, 4); await page.mouse.down(); await page.mouse.up(); opens.push(sum(await po));
        await page.getByRole("menu").first().waitFor();
        await page.waitForTimeout(400);
        const pc = frames(page, 4); await page.keyboard.press("Escape"); closes.push(sum(await pc));
      }
      await page.waitForTimeout(400);
      await page.mouse.down(); await page.mouse.up();
      const item = page.getByRole("menuitem", { name: "Move up" });
      await item.waitFor();
      await page.waitForTimeout(400);
      const ib = await item.boundingBox();
      await page.mouse.move(ib.x + 5, ib.y + 5);
      await page.waitForTimeout(300);
      const pp = frames(page, 5); await page.mouse.down(); await page.mouse.up(); picks.push(sum(await pp));
      console.log(`R ${type.name()}@${scale} ${name} | scroll ${sum(scroll)} [${scroll.join("/")}] | open ${opens.join(",")} | close ${closes.join(",")} | pick ${picks.join(",")}`);
      await page.close();
    } catch (e) { console.log(`R error ${type.name()}@${scale} ${name} ${e.message.split("\n")[0]}`); }
  }
  await browser.close();
}
