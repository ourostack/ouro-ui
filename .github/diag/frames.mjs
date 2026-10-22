// Diagnostic only (branch diag/webkit-frames): where WebKit on Linux spends its frames on /voyage/.
import { chromium, webkit } from "@playwright/test";
const [base, label] = [process.argv[2], process.argv[3]];
const CV = "main > section, main > div > section, section[id] { content-visibility: auto; contain-intrinsic-size: auto 900px; }";
const L = CV + " .site-window { will-change: transform; }";
const W = " .site-window { will-change: transform; }";
const S = ":is(#themes, #chapter-one, #chapter-two, #chapter-three, #agents)";
const VARIANTS = {
  base: "",
  layeronly: W,
  cvlayer: CV + W,
  containlayer: S + " { contain: layout paint style; }" + W,
  containlayout: S + " { contain: layout; }" + W,
};
const frames = (page) => page.evaluate(() => new Promise((r) => { const t = []; let last = performance.now(); const tick = (now) => { t.push(now - last); last = now; if (t.length < 40) requestAnimationFrame(tick); else { t.sort((a, b) => a - b); r(`${t[20].toFixed(0)}/${t[36].toFixed(0)}`); } }; requestAnimationFrame(tick); }));
const record = (page) => page.evaluate(() => { const w = window; w.__long = []; let last = performance.now(); const tick = (now) => { if (now - last > 40) w.__long.push(Math.round(now - last)); last = now; w.__raf = requestAnimationFrame(tick); }; w.__raf = requestAnimationFrame(tick); });
const longs = (page) => page.evaluate(() => { cancelAnimationFrame(window.__raf); const l = window.__long; return `${l.length}x sum ${l.reduce((a, b) => a + b, 0)} max ${Math.max(0, ...l)}`; });
for (const type of [webkit, chromium]) {
  const browser = await type.launch();
  for (const [name, css] of Object.entries(VARIANTS)) {
    if (type === chromium && name !== "base") continue;
    if (label === "main") continue;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base + "voyage/");
    await page.locator("html[data-site-ready]").waitFor({ state: "attached" });
    if (css) await page.addStyleTag({ content: css });
    const row = [];
    row.push(`top ${await frames(page)}`);
    await page.locator("#chapter-one").scrollIntoViewIfNeeded();
    await page.locator("#chapter-one[data-chapter-ready]").waitFor({ state: "attached" });
    await page.waitForTimeout(500);
    row.push(`c1 ${await frames(page)}`);
    let t0 = Date.now();
    for (const job of ["Join the double hull", "Fit the great windows", "Put in the engine", "Join the double hull", "Fit the great windows", "Put in the engine"]) await page.getByRole("checkbox", { name: job }).click();
    row.push(`6 ticks ${Date.now() - t0}ms`);
    t0 = Date.now();
    await page.getByRole("textbox", { name: "Your name" }).click();
    await page.getByRole("textbox", { name: "Your name" }).fill("Ada");
    await page.getByRole("checkbox", { name: "I will keep the Nautilus a secret." }).click();
    row.push(`articles ${Date.now() - t0}ms`);
    if (await page.locator("#chapter-two").count()) {
      await page.locator("#chapter-two").scrollIntoViewIfNeeded();
      await page.locator("#chapter-two[data-chapter-ready]").waitFor({ state: "attached" });
      await page.waitForTimeout(500);
      row.push(`c2 ${await frames(page)}`);
      t0 = Date.now();
      let [opens, picks] = [0, 0];
      for (const port of ["Atlantis", "Crespo Island"]) {
        await record(page);
        t0 = Date.now();
        await page.getByRole("button", { name: new RegExp(`^Reorder ${port}`) }).click();
        opens += Date.now() - t0;
        row.push(`open long ${await longs(page)}`);
        if (port === "Atlantis") row.push(`lock html[${await page.evaluate(() => document.documentElement.getAttribute("style"))}] body[${await page.evaluate(() => document.body.getAttribute("style"))}] sb ${await page.evaluate(() => innerWidth - document.documentElement.clientWidth)}`);
        await record(page);
        t0 = Date.now();
        await page.getByRole("menu", { name: `Reorder ${port}` }).getByRole("menuitem", { name: "Move to top" }).click();
        picks += Date.now() - t0;
        row.push(`pick long ${await longs(page)}`);
      }
      row.push(`2 moves open ${opens}ms pick ${picks}ms`);
      await page.locator("#chapter-three").scrollIntoViewIfNeeded();
      await page.locator("#chapter-three[data-chapter-ready]").waitFor({ state: "attached" });
      await page.waitForTimeout(500);
      row.push(`c3 ${await frames(page)}`);
      t0 = Date.now();
      await page.locator("#chapter-three").getByRole("button", { name: "Orders", exact: true }).click();
      await page.getByRole("menuitem", { name: "Surface" }).click();
      row.push(`order ${Date.now() - t0}ms`);
    }
    console.log(`${label} ${type.name()} ${name}: ${row.join(" · ")}`);
    await page.close();
  }
  await browser.close();
}
