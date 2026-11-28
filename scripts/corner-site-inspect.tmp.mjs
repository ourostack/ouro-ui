import { chromium } from "playwright";
import { serve } from "../registry/ouro/check/serve.ts";

const server = await serve("site/dist");
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(`${server.origin}/docs/button/`);
    await page.evaluate(() => document.fonts.ready);
    const codes = await page.evaluate(() => [...document.querySelectorAll("code")].flatMap((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const fragments = [...element.getClientRects()];
      if (rect.height < 30 || style.backgroundColor === "rgba(0, 0, 0, 0)") return [];
      return [{
        text: element.textContent?.slice(0, 180),
        html: element.outerHTML.slice(0, 800),
        parent: element.parentElement?.outerHTML.slice(0, 1500),
        rect: rect.toJSON(), fragments: fragments.map((part) => part.toJSON()),
        display: style.display, radius: style.borderRadius, shape: style.getPropertyValue("corner-top-left-shape"),
        decoration: style.boxDecorationBreak, webkitDecoration: style.getPropertyValue("-webkit-box-decoration-break"),
        sq: style.getPropertyValue("--sq-tl"), clip: style.clipPath, font: style.font,
      }];
    }));
    console.log("INLINE", width, JSON.stringify(codes.slice(0, 6)));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
