// Draws the link-preview cards (site/public/og/<page>.jpg, 1200×630; the og:image and twitter:image
// of each page, site/src/head.ts): each page's storybook scene (the canonical og crop, copied byte
// for byte into site/public/brand/storybook/og/) with the page's words set in its sky. The scene is
// shown whole, never washed or faded: the words read on it by their own halo in the sky's colour.
// Which page shows which scene, and the words, are in site/src/storybook.ts (CARDS). Rerun after a
// card's words or scene change, look at every card, and commit them:
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
    // The sky's own colour along the side the words sit on: the halo the words carry, so they read on the clouds.
    const near = card.side === "left" ? sky[0] : sky[4];
    const halo = `0 0 2px color-mix(in oklab, ${near} 60%, white), 0 0 12px color-mix(in oklab, ${near} 70%, white), 0 1px 28px ${near}`;
    // The og crop, whole; or a stretch of the wide header under a band of the sky's own colours, meeting it on a hard edge.
    let background = `url(${dataUrl(`site/public/brand/storybook/og/${card.scene}.jpg`, "image/jpeg")}) center / cover`;
    if (card.crop) {
      const scale = 1200 / (card.crop.to - card.crop.from);
      const band = 630 - 576 * scale;
      const header = dataUrl(`site/public/brand/storybook/headers/${card.scene}.webp`, "image/webp");
      background = `url(${header}) ${-card.crop.from * scale}px ${band}px / ${1536 * scale}px auto no-repeat, linear-gradient(90deg, ${sky.join(", ")})`;
    }
    await page.setContent(`<!doctype html>
<html><head><style>
  @font-face { font-family: Geist; src: url(${font}) format("woff2"); font-weight: 100 900; }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: Geist, sans-serif; }
  .card { position: relative; width: 1200px; height: 630px; background: ${background}; }
  .words { position: absolute; top: 46px; ${card.side}: 60px; width: ${card.width ?? 560}px; text-align: ${card.side}; color: #2a1d38; text-shadow: ${halo}; }
  .kicker { font-size: 26px; font-weight: 600; letter-spacing: 0.01em; color: #4b3a59; }
  .title { margin-top: 10px; font-size: ${card.size ?? (card.title.length > 32 ? 48 : (card.width ?? 560) < 500 ? 54 : 60)}px; line-height: 1.04; font-weight: 700; letter-spacing: -0.03em; text-wrap: balance; }
  .site { position: absolute; ${card.address === "band" ? "top: 52px" : "bottom: 26px"}; ${card.addressSide ?? card.side}: 60px; padding: 5px 14px; border-radius: 999px; background: ${(card.addressSide ?? card.side) === "left" ? sky[0] : sky[4]}; font-size: 20px; font-weight: 600; color: #2a1d38; }
</style></head><body>
  <div class="card">
    <div class="words"><div class="kicker">${escape(card.kicker)}</div><div class="title">${escape(card.title)}</div></div>
    <div class="site">ui.ouroboros.bot</div>
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
