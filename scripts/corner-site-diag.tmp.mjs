import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { serve } from "../registry/ouro/check/serve.ts";
import { findSquirclePaint } from "../registry/ouro/check/squircle-paint.ts";

const server = await serve("site/dist");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on("console", (message) => console.log(message.text()));
  await page.exposeBinding("__ouroPaintCapture", async ({ page: current }, clip) => (await current.screenshot({ clip, scale: "device", animations: "disabled", caret: "initial" })).toString("base64"));
  await page.exposeBinding("__ouroPaintDiagnostic", async (_, data) => {
    await mkdir(".tmp/corner-images", { recursive: true });
    for (const key of ["actual", "hidden", "masked", "solo", "restored"]) {
      if (data[key]) await writeFile(`.tmp/corner-images/${key}.png`, Buffer.from(data[key].includes(",") ? data[key].split(",")[1] : data[key], "base64"));
    }
    await writeFile(".tmp/corner-images/details.json", JSON.stringify(data, (key, value) => ["actual", "hidden", "masked", "solo", "restored"].includes(key) ? undefined : value));
  });
  await page.goto(`${server.origin}/docs/button/`);
  await page.evaluate(() => document.fonts.ready);
  console.log("INLINE-FINDINGS", JSON.stringify(await page.evaluate(findSquirclePaint)));
  console.log("INLINE-RECTS", JSON.stringify(await page.locator("code[data-site-path]").evaluateAll((nodes) => nodes.map((node) => ({ box: node.getBoundingClientRect().toJSON(), rects: [...node.getClientRects()].map((rect) => rect.toJSON()), css: getComputedStyle(node).cssText, display: getComputedStyle(node).display, decoration: getComputedStyle(node).boxDecorationBreak, text: node.textContent })))));
} finally {
  await browser.close();
  await server.close();
}
