// Diagnostic only (branch diag/webkit-frames): what a menu, a sheet and a dialog cost WebKit on /voyage/, by style variant.
import { chromium, webkit } from "@playwright/test";
const [base, label] = [process.argv[2], process.argv[3]];
const VARIANTS = {
  asis: "",
  sharp: ".site-window { box-shadow: 0 1px 0 color-mix(in oklab, var(--foreground) 8%, transparent) !important; }",
  noshadow: "*, *::before, *::after { box-shadow: none !important; }",
  still: "*, *::before, *::after { animation: none !important; transition: none !important; }",
  nolayer: ".site-window { will-change: auto !important; }",
};
const frames = (page) => page.evaluate(() => new Promise((r) => { const t = []; let last = performance.now(); const tick = (now) => { t.push(now - last); last = now; if (t.length < 30) requestAnimationFrame(tick); else { t.sort((a, b) => a - b); r(`${t[15].toFixed(0)}/${t[27].toFixed(0)}`); } }; requestAnimationFrame(tick); }));
const record = (page) => page.evaluate(() => { const w = window; w.__long = []; let last = performance.now(); const tick = (now) => { if (now - last > 40) w.__long.push(Math.round(now - last)); last = now; w.__raf = requestAnimationFrame(tick); }; w.__raf = requestAnimationFrame(tick); });
const longs = (page) => page.evaluate(() => { cancelAnimationFrame(window.__raf); const l = window.__long; return `${l.length}x${l.reduce((a, b) => a + b, 0)}`; });
const locked = (page) => page.evaluate(() => [document.documentElement, document.body].map((e) => getComputedStyle(e).overflowY).join("/"));
async function timed(page, row, name, fn) {
  await record(page);
  const t0 = Date.now();
  await fn();
  row.push(`${name} ${Date.now() - t0} [${await longs(page)}]`);
}
if (label !== "branch") process.exit(0);
for (const type of [webkit, chromium]) {
  const browser = await type.launch();
  for (const [name, css] of Object.entries(VARIANTS)) {
    if (type === chromium && name !== "asis") continue;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let t0 = Date.now();
    await page.goto(base + "voyage/");
    await page.locator("html[data-site-ready]").waitFor({ state: "attached" });
    const row = [`load ${Date.now() - t0}`];
    if (css) await page.addStyleTag({ content: css });
    row.push(`top ${await frames(page)}`);
    await page.locator("#chapter-two").scrollIntoViewIfNeeded();
    await page.locator("#chapter-two[data-chapter-ready]").waitFor({ state: "attached" });
    await page.waitForTimeout(500);
    row.push(`c2 ${await frames(page)}`);
    for (const port of ["Atlantis", "Crespo Island"]) {
      await timed(page, row, "open", () => page.getByRole("button", { name: new RegExp(`^Reorder ${port}`) }).click());
      if (port === "Atlantis") row.push(`lock ${await locked(page)} open-frames ${await frames(page)}`);
      await timed(page, row, "pick", () => page.getByRole("menu", { name: `Reorder ${port}` }).getByRole("menuitem", { name: "Move to bottom" }).click());
      await timed(page, row, "hidden", () => page.getByRole("menu").waitFor({ state: "hidden" }));
    }
    await timed(page, row, "sheet", async () => {
      await page.locator("#chapter-two").getByRole("button", { name: /Code/ }).first().click();
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    });
    await page.locator("#chapter-three").scrollIntoViewIfNeeded();
    await page.locator("#chapter-three[data-chapter-ready]").waitFor({ state: "attached" });
    await page.waitForTimeout(500);
    row.push(`c3 ${await frames(page)}`);
    await timed(page, row, "orders", async () => {
      await page.locator("#chapter-three").getByRole("button", { name: "Orders", exact: true }).click();
      await page.getByRole("menuitem", { name: "Surface" }).click();
      await page.getByRole("menu").waitFor({ state: "hidden" });
    });
    await timed(page, row, "alarm", async () => {
      await page.locator("#chapter-three").getByRole("button", { name: /alarm/i }).first().click();
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    });
    console.log(`${type.name()} ${name}: ${row.join(" · ")}`);
    await page.close();
  }
  await browser.close();
}
