import { chromium } from "playwright";
import { serve } from "../registry/ouro/check/serve.ts";

const server = await serve("site/dist");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${server.origin}/docs/button/`);
  await page.evaluate(() => document.fonts.ready);
  console.log(JSON.stringify(await page.evaluate(() => {
    const root = document.querySelector('[data-slot="theme-picker-trigger"]');
    const tile = root?.querySelector('[data-shows]:not([hidden]) [data-slot="theme-picker-wordmark"]');
    const values = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        html: el.outerHTML.slice(0, 1000),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        radius: s.borderRadius,
        topLeft: s.borderTopLeftRadius,
        shape: s.getPropertyValue("corner-top-left-shape"),
        controlRadius: s.getPropertyValue("--ouro-control-r"),
        sq: s.getPropertyValue("--sq-tl"),
        buttonHeight: s.getPropertyValue("--ouro-button-h"),
        spacing: s.getPropertyValue("--spacing"),
        height: s.height,
        minHeight: s.minHeight,
        borderWidth: s.borderWidth,
        background: s.backgroundColor,
        border: s.borderTopColor,
        padding: s.padding,
      };
    };
    return { trigger: values(root), tile: values(tile) };
  }), null, 2));
} finally {
  await browser.close();
  await server.close();
}
