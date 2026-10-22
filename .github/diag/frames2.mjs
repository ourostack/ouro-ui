// Diagnostic only (branch diag/webkit-frames): long frames along the e2e ports flow, per variant.
import { chromium, webkit } from "@playwright/test";
const base = process.argv[2];
const VARIANTS = {
  asis: "",
  cv: "main > section:not(#chapter-two), main > div > section:not(#chapter-two), [data-chapter]:not(#chapter-two) { content-visibility: auto; contain-intrinsic-size: auto 900px; }",
  nohero: ".site-hero { display: none !important; }",
  nostage: ".site-hero svg, .stage-frame { display: none !important; }",
  noothers: "main section:not(#chapter-two):not(.site-hero) { display: none !important; }",
  noshadow: "*, *::before, *::after { box-shadow: none !important; }",
  nofont: "* { font-family: sans-serif !important; }",
};
const arm = (page) => page.evaluate(() => {
  const w = window;
  w.__long = []; w.__mark = "start"; w.__frames = 0;
  let last = performance.now();
  const loop = () => { const t = performance.now(); w.__frames++; if (t - last > 40) w.__long.push(`${w.__mark}:${Math.round(t - last)}`); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
const mark = (page, name) => page.evaluate((name) => { window.__mark = name; }, name);
const dump = (page) => page.evaluate(() => `frames ${window.__frames} long ${window.__long.join(" ")}`);
for (const type of [webkit, chromium]) {
  const browser = await type.launch();
  for (const [name, css] of Object.entries(VARIANTS)) {
    if (type === chromium && name !== "asis") continue;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (css) await page.addInitScript((css) => { document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); }); }, css);
    const t = [Date.now()];
    await page.goto(base + "voyage/");
    await page.locator("html[data-site-ready]").waitFor({ state: "attached" });
    t.push(Date.now());
    await arm(page);
    await mark(page, "scroll");
    await page.locator("#chapter-two").scrollIntoViewIfNeeded();
    t.push(Date.now());
    await mark(page, "ready");
    await page.locator("#chapter-two[data-chapter-ready]").waitFor({ state: "attached" });
    t.push(Date.now());
    await mark(page, "handle");
    await page.getByRole("button", { name: /^Reorder The South Pole/ }).click();
    t.push(Date.now());
    await mark(page, "item");
    await page.getByRole("menu", { name: "Reorder The South Pole" }).getByRole("menuitem", { name: "Move to bottom" }).click();
    t.push(Date.now());
    await mark(page, "after");
    await page.waitForTimeout(500);
    const steps = ["load", "scroll", "ready", "handle", "item"].map((s, i) => `${s} ${t[i + 1] - t[i]}`).join(" ");
    const css2 = await page.evaluate(() => getComputedStyle(document.querySelector("#chapter-three") ?? document.body).contentVisibility);
    console.log(`R ${type.name()} ${name} | ${steps} | ${await dump(page)} | cv3=${css2}`);
    await page.close();
  }
  await browser.close();
}
