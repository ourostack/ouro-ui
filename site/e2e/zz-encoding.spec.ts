import { expect, test } from "@playwright/test";
import { PRESET_NAMES, THEME_KEY } from "../src/themes/prepaint";

// PROBE (never merged): voyage.spec.ts's 320 px reflow loop, recording each navigation's response.
const base = process.env["PROBE_PROXY"] ? "http://127.0.0.1:4180/" : "";
const PAGES = ["./", "nautilus/"] as const;

test("probe: reflow loop navigations", async ({ page }, testInfo) => {
  const records: string[] = [];
  page.on("response", async (response) => {
    if (!response.request().isNavigationRequest() || response.frame() !== page.mainFrame()) return;
    const headers = await response.allHeaders().catch(() => ({}) as Record<string, string>);
    const request = await response.request().allHeaders().catch(() => ({}) as Record<string, string>);
    records.push(`${performance.now().toFixed(0)} ${response.status()} ${response.url()} enc=${headers["content-encoding"]} len=${headers["content-length"]} te=${headers["transfer-encoding"]} type=${headers["content-type"]} etag=${headers["etag"]} cache=${headers["cache-control"]} vary=${headers["vary"]} | req ae=${request["accept-encoding"]} inm=${request["if-none-match"]} fromSW=${response.fromServiceWorker()}`);
  });
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of PAGES) {
    for (const preset of PRESET_NAMES) {
      await page.addInitScript(([key, json]) => localStorage.setItem(key, json), [THEME_KEY, JSON.stringify({ preset })] as const);
      await page.goto(base + path);
      try {
        await expect(page.locator("html[data-site-ready]")).toBeAttached();
      } catch (error) {
        const doc = await page.evaluate(() => ({ type: document.contentType, start: (document.documentElement?.outerHTML ?? "").slice(0, 120) })).catch((e) => ({ type: "?", start: String(e) }));
        console.log(`PROBE BAD ${path} ${preset} repeat ${testInfo.repeatEachIndex}\ncontentType=${doc.type} start=${JSON.stringify(doc.start)}\n${records.slice(-4).join("\n")}`);
        throw error;
      }
    }
  }
  console.log(`PROBE OK repeat ${testInfo.repeatEachIndex} first: ${records[0]}`);
});
