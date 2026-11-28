import { chromium } from "playwright";
import { serve } from "../registry/ouro/check/serve.ts";
import { findSquirclePaint } from "../registry/ouro/check/squircle-paint.ts";

const server = await serve("site/dist");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.exposeBinding("__ouroPaintCapture", async ({ page: current }, clip) => (await current.screenshot({ clip, scale: "device", animations: "disabled", caret: "initial" })).toString("base64"));
  await page.goto(`${server.origin}/docs/button/`);
  await page.evaluate(() => document.fonts.ready);
  const issues = await page.evaluate(findSquirclePaint);
  console.log("INLINE-FINDINGS", JSON.stringify(issues));
  console.log("INLINE-DETAILS", JSON.stringify(await page.evaluate((refs) => refs.map((ref) => {
    const el = document.querySelector(`[data-ouro-check-ref~="${ref}"]`);
    if (!el) return null;
    const s = getComputedStyle(el);
    return { html: el.outerHTML, parent: el.parentElement?.outerHTML.slice(0, 1000), rect: el.getBoundingClientRect().toJSON(), rects: [...el.getClientRects()].map((rect) => rect.toJSON()), css: { font: s.font, fontSize: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, padding: s.padding, background: s.background, radius: s.borderRadius, shape: s.getPropertyValue("corner-top-left-shape"), boxDecorationBreak: s.boxDecorationBreak, position: s.position }, scroll: [scrollX, scrollY] };
  }), issues.map((issue) => issue.ref))));
} finally {
  await browser.close();
  await server.close();
}
