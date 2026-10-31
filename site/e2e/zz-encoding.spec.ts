import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "@playwright/test";
import { PRESET_NAMES, THEME_KEY } from "../src/themes/prepaint";

// PROBE (never merged): voyage.spec.ts's 320 px reflow loop. When data-site-ready is late, keeps
// waiting (up to 30 s more) to tell slow from never, and prints what went wrong on the page.
const PAGES = ["./", "nautilus/"] as const;
// PROBE_PAGES: serve site/dist as GitHub Pages does (site/scripts/serve-pages.mjs: HTTP/2, TLS,
// gzip with a length), instead of vite preview's HTTP/1.1 with chunked on-the-fly gzip.
let server: ChildProcess | undefined;
test.use({ ignoreHTTPSErrors: true });
test.beforeAll(async ({}, workerInfo) => {
  if (!process.env["PROBE_PAGES"]) return;
  server = spawn(process.execPath, ["site/scripts/serve-pages.mjs", String(4300 + workerInfo.workerIndex)], { stdio: "inherit" });
  await new Promise((resolve) => setTimeout(resolve, 1500));
});
test.afterAll(() => server?.kill());

test("probe: reflow loop navigations", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  let events: string[] = [];
  const t0 = () => performance.now().toFixed(0);
  page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") events.push(`${t0()} console.${message.type()} ${message.text().slice(0, 200)}`); });
  page.on("pageerror", (error) => events.push(`${t0()} pageerror ${String(error).slice(0, 200)}`));
  page.on("requestfailed", (request) => events.push(`${t0()} requestfailed ${request.url()} ${request.failure()?.errorText}`));
  page.on("response", (response) => { if (response.status() >= 400) events.push(`${t0()} status ${response.status()} ${response.url()}`); });
  const inflight = new Map<object, string>();
  page.on("request", (request) => inflight.set(request, request.url()));
  page.on("requestfinished", (request) => inflight.delete(request));
  page.on("requestfailed", (request) => inflight.delete(request));
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of PAGES) {
    for (const preset of PRESET_NAMES) {
      if (process.env["PROBE_SETTLE"]) await page.waitForLoadState("networkidle");
      const left = [...inflight.values()].map((url) => url.split("/").pop()).join(",");
      events = [`in flight at navigation: ${inflight.size} ${left.slice(0, 300)}`];
      await page.addInitScript(([key, json]) => localStorage.setItem(key, json), [THEME_KEY, JSON.stringify({ preset })] as const);
      const start = Date.now();
      try {
        await page.goto(process.env["PROBE_PAGES"] ? `https://127.0.0.1:${4300 + testInfo.workerIndex}/${path === "./" ? "" : path}` : path);
      } catch (error) {
        console.log(`PROBE GOTO ${path} ${preset} repeat ${testInfo.repeatEachIndex}: ${String(error).split("\n")[0]}\n${events.join("\n")}`);
        throw error;
      }
      const loaded = Date.now() - start;
      try {
        await expect(page.locator("html[data-site-ready]")).toBeAttached();
      } catch {
        const late = await page.locator("html[data-site-ready]").waitFor({ state: "attached", timeout: 30_000 }).then(() => `ready after ${Date.now() - start} ms`, () => "never ready in 35 s");
        const doc = await page.evaluate(() => ({ gz: (document.body?.textContent ?? "").startsWith("\u001f"), scripts: performance.getEntriesByType("resource").filter((e) => /\.js/.test(e.name)).map((e) => `${e.name.split("/").pop()} ${(e as PerformanceResourceTiming).responseEnd.toFixed(0)}ms ${(e as PerformanceResourceTiming).decodedBodySize}b`), nav: (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.domContentLoadedEventEnd })).catch((e) => ({ gz: "?", scripts: [String(e)], nav: -1 }));
        console.log(`PROBE LATE ${path} ${preset} repeat ${testInfo.repeatEachIndex}: goto ${loaded} ms, ${late}, gzip-text=${doc.gz}, dcl=${doc.nav}\n  scripts: ${doc.scripts.slice(-12).join(" | ")}\n${events.join("\n")}`);
        throw new Error("late");
      }
      // Ready: did an island fall back, or did a chunk fail and load on its second try?
      const failed = await page.locator("[data-island-failed]").count();
      const loadErrors = events.filter((line) => /requestfailed|pageerror|did not load/.test(line));
      if (failed || loadErrors.length) console.log(`PROBE READY-WITH-TROUBLE ${path} ${preset} repeat ${testInfo.repeatEachIndex}: fallbacks=${failed}\n${loadErrors.slice(0, 12).join("\n")}`);
    }
  }
});
