// Diagnostic only (branch diag/webkit-frames): what one frame costs WebKit after a small change, a menu open and close, per variant and scale.
import { chromium, webkit } from "@playwright/test";
const base = process.argv[2];
const VARIANTS = {
  asis: "",
  nochart: ".site-chart, .recharts-wrapper, [data-chapter-axis] { display: none !important; }",
  noshadow: "*, *::before, *::after { box-shadow: none !important; }",
  nolayers: "* { will-change: auto !important; }",
  contain: "#chapter-two [data-composition] { contain: paint; } main > *:not(:has(#chapter-two)) { content-visibility: auto; contain-intrinsic-size: auto 900px; }",
  isolate: "#chapter-two [data-composition] { will-change: transform; }",
};
const frames = (page, n) => page.evaluate((n) => new Promise((resolve) => {
  const out = []; let last = performance.now();
  const loop = () => { const t = performance.now(); out.push(Math.round(t - last)); last = t; if (out.length < n) requestAnimationFrame(loop); else resolve(out.join("/")); };
  requestAnimationFrame(loop);
}), n);
const timed = async (page, act) => {
  const p = frames(page, 4);
  await act();
  return p;
};
for (const [type, scale] of [[webkit, 2], [webkit, 1], [chromium, 1], [chromium, 2]]) try {
  const browser = await type.launch();
  for (const [name, css] of Object.entries(VARIANTS)) {
    if ((type === chromium || scale === 1) && !["asis", "nochart"].includes(name)) continue;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale });
    page.setDefaultTimeout(30000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base + "voyage/");
    await page.locator("html[data-site-ready]").waitFor({ state: "attached" });
    if (css) await page.addStyleTag({ content: css });
    await page.locator("#chapter-two").scrollIntoViewIfNeeded();
    await page.locator("#chapter-two[data-chapter-ready]").waitFor({ state: "attached" });
    await page.waitForTimeout(1000);
    const idle = await frames(page, 4);
    const tiny = await timed(page, () => page.evaluate(() => { const el = document.querySelector("#chapter-two .site-leagues"); el.textContent = el.textContent + " "; }));
    const color = await timed(page, () => page.evaluate(() => { document.querySelector("#chapter-two h2").style.color = "red"; }));
    const handle = page.getByRole("button", { name: /^Reorder The South Pole/ });
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.waitForTimeout(400);
    const t0 = Date.now();
    const open = await timed(page, () => page.mouse.down().then(() => page.mouse.up()));
    await page.getByRole("menu").waitFor();
    const opened = Date.now() - t0;
    await page.waitForTimeout(400);
    const after = await frames(page, 4);
    const close = await timed(page, () => page.keyboard.press("Escape"));
    await page.waitForTimeout(400);
    const scroll = await timed(page, () => page.mouse.wheel(0, 200));
    console.log(`R ${type.name()}@${scale} ${name} | idle ${idle} | tiny ${tiny} | color ${color} | open ${open} (${opened}ms) | openidle ${after} | close ${close} | wheel ${scroll}`);
    await page.close();
  }
  await browser.close();
} catch (e) { console.log(`R error ${e.message.split("\n")[0]}`); }
