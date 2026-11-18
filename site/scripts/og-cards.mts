// Draws the link-preview cards (site/public/og/<page>.jpg, 1200×630; the og:image and twitter:image
// of each page, site/src/head.ts): each page's storybook scene (the canonical og crop, copied byte
// for byte into site/public/brand/storybook/og/) under a band of the page's plain background that holds the page's
// words, as the page heroes set them. The words never sit on the picture, so they need no glow or scrim to read, and
// the scene is shown uncovered, never washed or faded: a stretch of its wide header, the whole width by default.
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
// The page's background in light mode (--background, registry/ouro/theme/ouro-theme.css).
const PLAIN = "#ffffff";
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const card of Object.values(CARDS)) {
    const sky = SCENES[card.scene].sky;
    // A stretch of the wide header across the card's foot, under a band of the page's plain background that holds the
    // words, meeting it on a hard edge.
    const crop = card.crop ?? { from: 0, to: 1536 };
    const scale = 1200 / (crop.to - crop.from);
    const band = Math.round(630 - SCENES[card.scene].height * scale);
    const header = dataUrl(`site/public/brand/storybook/headers/${card.scene}.webp`, "image/webp");
    const background = `url(${header}) ${-crop.from * scale}px ${band}px / ${1536 * scale}px auto no-repeat, ${PLAIN}`;
    await page.setContent(`<!doctype html>
<html><head><style>
  @font-face { font-family: Geist; src: url(${font}) format("woff2"); font-weight: 100 900; }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: Geist, sans-serif; }
  .card { position: relative; width: 1200px; height: 630px; background: ${background}; }
  .words { position: absolute; top: 0; height: ${band}px; left: 60px; width: 820px; display: flex; flex-direction: column; justify-content: center; color: #2a1d38; }
  .kicker { font-size: 24px; font-weight: 600; letter-spacing: 0.01em; color: #4b3a59; }
  .title { margin-top: 8px; font-size: ${card.size ?? 48}px; line-height: 1.05; font-weight: 700; letter-spacing: -0.03em; text-wrap: balance; }
  .site { position: absolute; top: ${Math.round(band / 2) - 17}px; right: 60px; padding: 5px 14px; border-radius: 999px; background: ${sky[4]}; font-size: 20px; font-weight: 600; color: #2a1d38; }
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
