import { chromium } from "playwright";
import { serve } from "../registry/ouro/check/serve.ts";

const server = await serve("site/dist");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${server.origin}/docs/button/`);
  await page.evaluate(() => document.fonts.ready);
  console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("code")].flatMap((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 600 || r.height < 50) return [];
    return [{
      html: el.outerHTML.slice(0, 1000),
      bounds: r.toJSON(),
      rects: [...el.getClientRects()].map((rect) => rect.toJSON()),
      offset: [el.offsetWidth, el.offsetHeight],
      display: s.display,
      radius: s.borderRadius,
      shape: s.getPropertyValue("corner-top-left-shape"),
      sq: ["tl", "tr", "br", "bl"].map((key) => s.getPropertyValue(`--sq-${key}`)),
      clip: s.clipPath,
      decoration: s.boxDecorationBreak,
      direction: s.direction,
    }];
  })), null, 2));
} finally {
  await browser.close();
  await server.close();
}
