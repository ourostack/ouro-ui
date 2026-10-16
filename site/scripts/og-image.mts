// Draws site/public/og.png, the 1200×630 card link previews show (the og:image and
// twitter:image tags, site/src/head.ts). `pnpm site:build` runs it first, so every deploy
// draws the card from the current homepage words in site/src/copy.ts and nobody
// regenerates it by hand. The committed og.png is the same card, for tests and the dev server.
//
//   node site/scripts/og-image.mts
//
// Design: the Ouro family card, as on ouroboros.bot, ouro.bot and the factory site: warm
// paper, a green rule, the headline in Cormorant Garamond, the subline in Outfit, the
// approved Ouro HX render on the right and the Ouro mark and wordmark bottom left. It
// renders in the Chromium that Playwright installs for the tests.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { HERO_SUBLINE, HERO_TITLE } from "../src/copy.ts";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const assets = join(repo, "site/scripts/og");
const out = join(repo, "site/public/og.png");

const data = (file: string, type: string) => `data:${type};base64,${readFileSync(join(assets, file)).toString("base64")}`;
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const html = `<!doctype html><html><head><style>
@font-face { font-family: "Cormorant Garamond"; src: url(${data("CormorantGaramond-Regular.ttf", "font/ttf")}); }
@font-face { font-family: "Outfit"; src: url(${data("Outfit-Regular.ttf", "font/ttf")}); }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; position: relative; overflow: hidden; background: linear-gradient(160deg, #FFFAF0 0%, #F5EFE0 100%); font-family: "Outfit"; color: #1A2118; }
.rule { position: absolute; inset: 0 0 auto 0; height: 6px; background: #1F6A37; }
.text { position: absolute; left: 80px; top: 0; bottom: 120px; width: 680px; display: flex; flex-direction: column; justify-content: center; }
.tag { font-size: 22px; letter-spacing: 0.22em; text-transform: uppercase; color: #A8352A; margin-bottom: 28px; }
h1 { font-family: "Cormorant Garamond"; font-weight: 400; font-size: 72px; line-height: 1.04; letter-spacing: -0.01em; }
p { font-size: 27px; line-height: 1.4; color: #3D4839; margin-top: 28px; }
.mark { position: absolute; right: 72px; top: 0; bottom: 40px; width: 320px; display: flex; align-items: center; justify-content: center; }
.word { position: absolute; left: 80px; bottom: 48px; display: flex; align-items: center; gap: 14px; font-family: "Cormorant Garamond"; font-size: 40px; }
</style></head><body>
<div class="rule"></div>
<div class="text"><div class="tag">Ouro HX · Under construction</div><h1>${escape(HERO_TITLE)}</h1><p>${escape(HERO_SUBLINE)}</p></div>
<div class="mark"><img src="${data("ouro-hx.png", "image/png")}" width="320" height="320" alt=""></div>
<div class="word"><img src="${data("ouro.png", "image/png")}" width="48" height="48" alt="">ouro</div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}
