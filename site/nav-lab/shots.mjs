// The lab's round-3 photographs and line counts:
//   node site/nav-lab/shots.mjs <base url> [out folder]
// Photographs Compass light and dark: the closed bar and each open panel on a laptop, the phone's bar and its menu in
// both tabs. Counts the visible 1px horizontal rules in the header, each open panel and the phone's menu, and fails
// above the budget: header 1 (the line under the bar), panel 0, phone menu 0. Writes lines.json beside the photographs.
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const [base, out = ".tmp/nav-shots"] = process.argv.slice(2);
if (!base) throw new Error("Usage: node site/nav-lab/shots.mjs <base url> [out folder]");
await mkdir(out, { recursive: true });

export const BUDGET = { header: 1, panel: 0, "phone menu": 0 };

/** In the page: the distinct horizontal 1px rules drawn inside `selector`, by their y. */
function rules(selector) {
  const root = [...document.querySelectorAll(selector)].find((el) => el.checkVisibility());
  if (!root) return null;
  const seen = new Set();
  const visible = (color) => !/rgba\(.*, 0\)$|transparent/.test(color);
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 24) continue;
    const side = (name) => parseFloat(s[`border${name}Width`]) >= 0.5 && parseFloat(s[`border${name}Width`]) <= 1.5 && s[`border${name}Style`] !== "none" && visible(s[`border${name}Color`]);
    const sides = ["Left", "Right"].some(side);
    if (!sides && side("Top") !== side("Bottom")) seen.add(Math.round(side("Top") ? r.top : r.bottom));
    if (el.tagName === "HR" || (r.height > 0 && r.height <= 1.5 && visible(s.backgroundColor))) seen.add(Math.round(r.top));
  }
  return seen.size;
}

const sizes = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const browser = await chromium.launch();
const counts = [];
const failures = [];
const count = async (page, where, selector, shot) => {
  const n = await page.evaluate(rules, selector);
  counts.push({ shot, where, rules: n, budget: BUDGET[where] });
  if (n !== null && n > BUDGET[where]) failures.push(`${shot}: ${where} draws ${n} rules, budget ${BUDGET[where]}`);
};

for (const scheme of ["light", "dark"]) {
  const desk = await browser.newContext({ ...sizes.desktop, colorScheme: scheme });
  const page = await desk.newPage();
  const url = `${base}?theme=${scheme}#/apple/ax/`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/desktop-closed-${scheme}.png` });
  await count(page, "header", "[data-lab-masthead]", `desktop-closed-${scheme}`);
  for (const name of ["Platforms", "Parts", "Proof", "Docs"]) {
    await page.keyboard.press("Escape");
    await page.mouse.move(700, 880);
    await page.waitForTimeout(700);
    await page.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(800);
    const shot = `desktop-${name.toLowerCase()}-${scheme}`;
    await page.screenshot({ path: `${out}/${shot}.png` });
    await count(page, "header", "[data-lab-masthead]", shot);
    await count(page, "panel", "[data-lab-panel]", shot);
  }
  await desk.close();

  const phone = await browser.newContext({ ...sizes.phone, colorScheme: scheme });
  const p = await phone.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/phone-bar-${scheme}.png` });
  await count(p, "header", "[data-lab-masthead]", `phone-bar-${scheme}`);
  await p.getByRole("button", { name: "Menu" }).click();
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/phone-menu-platform-${scheme}.png` });
  await count(p, "phone menu", '[role="dialog"]', `phone-menu-platform-${scheme}`);
  await p.getByRole("radio", { name: "By part" }).click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/phone-menu-part-${scheme}.png` });
  await count(p, "phone menu", '[role="dialog"]', `phone-menu-part-${scheme}`);
  await p.getByRole("dialog").evaluate((dialog) => {
    const scroller = [...dialog.querySelectorAll("*")].find((el) => el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY));
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/phone-menu-end-${scheme}.png` });
  await phone.close();

  // The family strip after scrolling down, then back up.
  for (const size of ["desktop", "phone"]) {
    const c = await browser.newContext({ ...sizes[size], colorScheme: scheme });
    const q = await c.newPage();
    await q.goto(url, { waitUntil: "networkidle" });
    await q.mouse.move(200, 400);
    await q.mouse.wheel(0, 700);
    await q.waitForTimeout(700);
    await q.screenshot({ path: `${out}/${size}-scrolled-down-${scheme}.png` });
    await q.mouse.wheel(0, -200);
    await q.waitForTimeout(700);
    await q.screenshot({ path: `${out}/${size}-scrolled-up-${scheme}.png` });
    await c.close();
  }
}
await browser.close();
await writeFile(`${out}/lines.json`, JSON.stringify(counts, null, 1));
for (const c of counts) console.log(`${c.shot}: ${c.where} ${c.rules} (budget ${c.budget})`);
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) process.exitCode = 1;
