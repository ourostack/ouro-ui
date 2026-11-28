import { chromium } from "playwright";
import { serve } from "../registry/ouro/check/serve.ts";
import { findSquirclePaint } from "../registry/ouro/check/squircle-paint.ts";

const server = await serve("site/dist");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on("console", (message) => { if (message.text().startsWith("INLINE-CORNER")) console.log(message.text()); });
  await page.exposeBinding("__ouroPaintCapture", async ({ page: current }, clip) =>
    (await current.screenshot({ clip, scale: "device", animations: "disabled", caret: "initial" })).toString("base64"),
  );
  await page.goto(`${server.origin}/docs/button/`);
  await page.evaluate(() => document.fonts.ready);
  const candidates = await page.evaluate(() => {
    const codes = [...document.querySelectorAll("code")].filter((element) => element.getClientRects().length > 1);
    for (const element of codes.slice(0, 15)) element.setAttribute("data-corner-debug", "");
    return codes.length;
  });
  console.log("INLINE-CANDIDATES", candidates);
  const issues = await page.evaluate(findSquirclePaint);
  console.log("INLINE-ISSUES", issues.length, JSON.stringify(issues));
} finally {
  await browser.close();
  await server.close();
}
