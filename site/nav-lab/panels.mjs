// Opens every panel and sheet in each nav mockup, screenshots it and checks how it uses its space:
//   node site/nav-lab/panels.mjs <base url> [out folder] [prefix]
// A panel fails when it is mostly empty (under 60% of a panel 120px or taller has content within 24px), when a short
// line wraps (60 characters on a laptop, 24 on a phone), or when it holds a boxed blurb (a rounded box with a fill or a
// border and no link or button in it), when its bottom passes the bottom of the screen with no scroll area holding it,
// or when a box inside it hides content it cuts off. Every size from a 320px phone to a 4K screen is checked; the
// laptop and the 390px phone are also photographed. Exits 1 on any failure.
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const [base, out = ".tmp/nav-panels", prefix = "panel"] = process.argv.slice(2);
if (!base) throw new Error("Usage: node site/nav-lab/panels.mjs <base url> [out folder] [prefix]");
await mkdir(out, { recursive: true });

const touch = { isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const sizes = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, shoot: true },
  phone: { viewport: { width: 390, height: 844 }, ...touch, shoot: true },
  "phone-320": { viewport: { width: 320, height: 568 }, ...touch },
  "tablet-768": { viewport: { width: 768, height: 1024 }, ...touch },
  "laptop-1024": { viewport: { width: 1024, height: 700 }, deviceScaleFactor: 1 },
  "laptop-1280": { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  "4k": { viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 },
};
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** In the page: each visible panel's coverage, short lines that wrap, and boxed blurbs. */
function measure() {
  const lines = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set([...range.getClientRects()].filter((r) => r.width > 1).map((r) => Math.round(r.top / 6))).size;
  };
  const limit = innerWidth >= 1024 ? 60 : 24;
  const visible = (list) => [...document.querySelectorAll(list)].filter((panel) => panel.checkVisibility());
  // The lab marks its panels; the first build did not, so its panels are found by their parts.
  const marked = visible("[data-lab-panel]");
  return (marked.length ? marked : visible('.lab-panel:not([hidden]) > div, [role="dialog"] nav, nav[aria-label="Sections"] > div:not([hidden])'))
    .map((panel) => {
      const style = getComputedStyle(panel);
      const box = panel.getBoundingClientRect();
      const inner = {
        left: Math.max(box.left + parseFloat(style.paddingLeft), 0),
        top: Math.max(box.top + parseFloat(style.paddingTop), 0),
        right: Math.min(box.right - parseFloat(style.paddingRight), innerWidth),
        bottom: Math.min(box.bottom - parseFloat(style.paddingBottom), innerHeight),
      };
      const rects = [];
      const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        rects.push(...range.getClientRects());
      }
      for (const el of panel.querySelectorAll("a, button, [role=table]")) rects.push(el.getBoundingClientRect());
      const near = 24;
      let hit = 0;
      let total = 0;
      for (let x = inner.left + 4; x < inner.right; x += 16)
        for (let y = inner.top + 4; y < inner.bottom; y += 16) {
          total++;
          if (rects.some((r) => r.width > 0 && x >= r.left - near && x <= r.right + near && y >= r.top - near && y <= r.bottom + near)) hit++;
        }
      const wraps = [];
      for (const el of panel.querySelectorAll("a, span, p, h2, h3, li")) {
        if ([...el.childNodes].some((node) => node.nodeType === 1 && !node.matches("[aria-hidden=true], .sr-only"))) continue;
        const text = el.textContent.trim();
        if (text && text.length <= limit && el.checkVisibility() && lines(el) > 1) wraps.push(text);
      }
      const cards = [];
      const own = style.backgroundColor;
      for (const el of panel.querySelectorAll("div, p, section, span, aside")) {
        if (el.closest("a, button, kbd, [role=table]") || el.querySelector("a, button, input") || !el.textContent.trim() || !el.checkVisibility()) continue;
        const s = getComputedStyle(el);
        const filled = s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== own;
        const bordered = ["Top", "Right", "Bottom", "Left"].every((side) => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none");
        if ((filled || bordered) && parseFloat(s.borderTopLeftRadius) >= 4) cards.push(el.textContent.trim().slice(0, 60));
      }
      // What holds the panel on screen: the nearest box that scrolls it, or the panel itself.
      let holder = panel;
      for (let el = panel; el && el !== document.body; el = el.parentElement) {
        const s = getComputedStyle(el);
        if (/auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) {
          holder = el;
          break;
        }
      }
      const offscreen = Math.max(0, Math.round(holder.getBoundingClientRect().bottom - innerHeight));
      const clipped = [];
      for (const el of [panel, ...panel.querySelectorAll("*")]) {
        const s = getComputedStyle(el);
        if (el.clientWidth <= 2 || !/hidden|clip/.test(s.overflowY + s.overflowX) || /auto|scroll/.test(s.overflowY)) continue;
        if ((el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) && el.textContent.trim()) clipped.push(`${el.tagName.toLowerCase()} shows ${el.clientWidth}×${el.clientHeight} of ${el.scrollWidth}×${el.scrollHeight}`);
      }
      const height = Math.round(inner.bottom - inner.top);
      return { width: Math.round(inner.right - inner.left), height, coverage: total ? Math.round((hit / total) * 100) / 100 : 1, wraps, cards, offscreen, clipped };
    });
}

const browser = await chromium.launch();
const report = [];
const failures = [];
const record = async (page, mockup, size, panel) => {
  const name = `${prefix}-${mockup}-${size}-${slug(panel)}`;
  if (sizes[size].shoot) await page.screenshot({ path: `${out}/${name}.png` });
  for (const m of await page.evaluate(measure)) {
    const problems = [];
    if (m.height >= 120 && m.coverage < 0.6) problems.push(`mostly empty: ${Math.round(m.coverage * 100)}% of ${m.width}×${m.height}px has content near it`);
    if (m.wraps.length) problems.push(`short lines wrap: ${m.wraps.map((t) => `"${t}"`).join(", ")}`);
    if (m.cards.length) problems.push(`boxed blurb: ${m.cards.map((t) => `"${t}"`).join(", ")}`);
    if (m.offscreen) problems.push(`runs ${m.offscreen}px past the bottom of the screen`);
    if (m.clipped.length) problems.push(`cuts off content: ${m.clipped.slice(0, 3).join("; ")}`);
    report.push({ shot: sizes[size].shoot ? `${name}.png` : null, mockup, size, panel, ...m, problems });
    if (problems.length) failures.push(`${name}: ${problems.join("; ")}`);
  }
};

for (const mockup of ["a", "b", "c", "d", "e"]) {
  for (const size of Object.keys(sizes)) {
    const { shoot, ...options } = sizes[size];
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const url = `${base}?m=${mockup}#/apple/ax/`;
    const load = async () => {
      await page.goto("about:blank");
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
    };
    await load();
    await record(page, mockup, size, "closed");
    const openers = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-expanded], button[aria-haspopup="dialog"]')]
        .filter((el) => el.checkVisibility() && !el.closest(".lab-dock, .lab-tree") && !/search/i.test(el.getAttribute("aria-label") ?? el.textContent))
        .map((el) => (el.getAttribute("aria-label") ?? el.textContent).trim()),
    );
    for (const name of openers) {
      await load();
      await page.getByRole("button", { name, exact: true }).first().click();
      await page.waitForTimeout(600);
      await record(page, mockup, size, name);
      const dialog = page.getByRole("dialog");
      if (options.isMobile && (await dialog.count())) {
        const part = dialog.getByText("By part", { exact: true });
        if (await part.count()) {
          await part.first().click();
          await page.waitForTimeout(400);
          await record(page, mockup, size, `${name} by part`);
        }
        const xray = dialog.getByRole("button", { name: /^X-ray/ });
        if ((await xray.count()) && (await xray.first().getAttribute("aria-expanded")) === "false") {
          await xray.first().click();
          await page.waitForTimeout(500);
          await xray.first().scrollIntoViewIfNeeded();
          await record(page, mockup, size, `${name} x-ray`);
        }
      }
    }
    await context.close();
  }
}
await browser.close();
await writeFile(`${out}/${prefix}-report.json`, JSON.stringify(report, null, 1));
console.log(`${report.length} panels measured, ${failures.length} with problems`);
for (const line of failures) console.log(`FAIL ${line}`);
if (failures.length) process.exitCode = 1;
