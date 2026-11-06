// Draws the link-preview cards (site/public/og/<page>.jpg, 1200×630; the og:image and twitter:image
// of each page, site/src/head.ts): each page's storybook scene (the canonical og crop, copied byte
// for byte into site/public/brand/storybook/og/) with the page's words set in its sky. Which page
// shows which scene, and the words, are in site/src/storybook.ts (CARDS). Rerun after a card's words
// or scene change, look at every card, and commit them:
//
//   node site/scripts/og-cards.mts
//
// It sets the words in Geist (site/public/fonts/) with the Chromium Playwright installs for the tests.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { CARDS, SCENES } from "../src/storybook.ts";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const outDir = join(repo, "site/public/og");
mkdirSync(outDir, { recursive: true });

const dataUrl = (file: string, type: string) => `data:${type};base64,${readFileSync(join(repo, file)).toString("base64")}`;
const font = dataUrl("site/public/fonts/geist-5.3.0.woff2", "font/woff2");
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const card of Object.values(CARDS)) {
    const sky = SCENES[card.scene].sky;
    // The sky's own colour along the side the words sit on, deepening the wash so they read.
    const near = card.side === "left" ? sky[0] : sky[4];
    const scene = dataUrl(`site/public/brand/storybook/og/${card.scene}.jpg`, "image/jpeg");
    await page.setContent(`<!doctype html>
<html><head><style>
  @font-face { font-family: Geist; src: url(${font}) format("woff2"); font-weight: 100 900; }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: Geist, sans-serif; }
  .card { position: relative; width: 1200px; height: 630px; background: url(${scene}) center / cover; }
  .wash { position: absolute; inset: 0; background:
    linear-gradient(to bottom, color-mix(in oklab, ${near} 88%, white) 0%, color-mix(in oklab, ${near} 62%, transparent) 22%, transparent 42%),
    linear-gradient(to ${card.side === "left" ? "right" : "left"}, color-mix(in oklab, ${near} 45%, transparent) 0%, transparent 45%); }
  .words { position: absolute; top: 46px; ${card.side}: 60px; width: ${card.width ?? 560}px; text-align: ${card.side}; color: #2a1d38; text-shadow: 0 1px 22px rgb(255 255 255 / 0.65); }
  .kicker { font-size: 26px; font-weight: 600; letter-spacing: 0.01em; color: #4b3a59; }
  .title { margin-top: 10px; font-size: ${card.title.length > 32 ? 48 : (card.width ?? 560) < 500 ? 54 : 60}px; line-height: 1.04; font-weight: 700; letter-spacing: -0.03em; text-wrap: balance; }
  .site { position: absolute; bottom: 26px; ${card.side}: 60px; font-size: 22px; font-weight: 600; color: white; text-shadow: 0 1px 12px rgb(42 29 56 / 0.7); }
</style></head><body>
  <div class="card"><div class="wash"></div>
    <div class="words"><div class="kicker">${escape(card.kicker)}</div><div class="title">${escape(card.title)}</div></div>
    <div class="site">ui.ouro.bot</div>
  </div>
</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const out = join(outDir, card.file);
    await page.screenshot({ path: out, type: "jpeg", quality: 86 });
    console.log(`wrote ${out}`);
  }
} finally {
  await browser.close();
}
