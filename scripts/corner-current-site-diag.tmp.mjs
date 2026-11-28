import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { serve } from "../registry/ouro/check/serve.ts";
import { findSquirclePaint } from "../registry/ouro/check/squircle-paint.ts";

const server = await serve("site/dist");
const browser = await chromium.launch({ headless: true });
const cases = [
  { name: "home", path: "/", width: 390, height: 844, dark: false, selector: "[data-site-preset]" },
  { name: "inline", path: "/docs/reorderable/", width: 390, height: 844, dark: true, selector: "code" },
  { name: "video", path: "/apple/hx/", width: 1440, height: 900, dark: false, selector: ".apple-loop-frame" },
];
try {
  for (const entry of cases) {
    const page = await browser.newPage({ viewport: { width: entry.width, height: entry.height }, deviceScaleFactor: 2 });
    page.on("console", (message) => {
      if (message.text().startsWith("CORNER-DIAGNOSTIC")) console.log(entry.name, message.text());
    });
    let count = 0;
    await page.exposeBinding("__ouroPaintCapture", async ({ page: current }, clip) => (await current.screenshot({ clip, scale: "device", animations: "disabled", caret: "initial" })).toString("base64"));
    await page.exposeBinding("__ouroPaintDiagnostic", async (_, data) => {
      const base = `.tmp/corner-current-site/${entry.name}-${++count}`;
      await mkdir(base, { recursive: true });
      for (const key of ["actual", "hidden", "masked", "solo", "restored", "withoutEffects"]) {
        if (data[key]) await writeFile(`${base}/${key}.png`, Buffer.from(data[key].includes(",") ? data[key].split(",")[1] : data[key], "base64"));
      }
      await writeFile(`${base}/details.json`, JSON.stringify(data, (key, value) => ["actual", "hidden", "masked", "solo", "restored", "withoutEffects"].includes(key) ? undefined : value));
    });
    await page.goto(`${server.origin}${entry.path}`);
    await page.evaluate(({ selector, dark }) => {
      document.documentElement.classList.toggle("dark", dark);
      window.__ouroDiagnosticSelector = selector;
    }, entry);
    await page.evaluate(() => document.fonts.ready);
    console.log("CASE", entry.name, JSON.stringify(await page.evaluate(findSquirclePaint)));
    if (entry.name === "video") {
      await page.evaluate(() => {
        HTMLMediaElement.prototype.play = async () => {};
        for (const video of document.querySelectorAll("video")) video.pause();
      });
      console.log("PAUSED", JSON.stringify(await page.evaluate(findSquirclePaint)));
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
