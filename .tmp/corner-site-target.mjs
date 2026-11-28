import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { serve } from "../registry/ouro/check/serve.ts";
import { findSquirclePaint } from "./squircle-site-diag.ts";

await mkdir(".tmp/corner-target-images", { recursive: true });
const server = await serve("site/dist");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  let captures = 0;
  page.on("console", (message) => { if (message.text().startsWith("INLINE-CORNER")) console.log(message.text()); });
  await page.exposeBinding("__ouroPaintCapture", async ({ page: current }, clip) => {
    const png = await current.screenshot({ clip, scale: "device", animations: "disabled", caret: "initial" });
    await writeFile(`.tmp/corner-target-images/capture-${String(++captures).padStart(2, "0")}.png`, png);
    return png.toString("base64");
  });
  await page.goto(`${server.origin}/docs/kbd/`);
  await page.evaluate(() => document.fonts.ready);
  const target = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll("code")].map((element) => {
      const rect = element.getBoundingClientRect();
      return { element, rect, distance: Math.abs(rect.x - 1062.4375) + Math.abs(rect.y - 2725.53125) };
    }).sort((a, b) => a.distance - b.distance);
    const { element, rect, distance } = candidates[0];
    element.setAttribute("data-corner-debug", "");
    const style = getComputedStyle(element);
    const css = Object.fromEntries([
      "font-family", "font-size", "font-size-adjust", "font-weight", "font-style",
      "line-height", "letter-spacing", "padding", "box-sizing", "white-space",
      "word-break", "overflow-wrap", "border-radius", "corner-shape",
    ].map((property) => [property, style.getPropertyValue(property)]));
    element.textContent = "several small signs show a series of quiet ideas along the winding road";
    return {
      distance, rect: rect.toJSON(), text: element.textContent, html: element.outerHTML,
      parent: element.parentElement.outerHTML.slice(0, 3000),
      fragments: [...element.getClientRects()].map((part) => part.toJSON()),
      display: style.display, radius: style.borderRadius, shape: style.getPropertyValue("corner-top-left-shape"),
      decoration: style.boxDecorationBreak, background: style.backgroundColor, color: style.color,
      font: style.font, css, dark: document.documentElement.classList.contains("dark"),
    };
  });
  console.log("TARGET", JSON.stringify(target));
  console.log("ISSUES", JSON.stringify(await page.evaluate(findSquirclePaint)));
} finally {
  await browser.close();
  await server.close();
}
