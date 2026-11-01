// PROBE (never merge): the reflow test's navigations in WebKit, many times over, counting goto failures.
import { devices, webkit } from "@playwright/test";
import { appendFileSync } from "node:fs";

const base = process.env["BASE"]!;
const tests = Number(process.env["TESTS"] ?? 100);
const { PRESET_NAMES, THEME_KEY } = await import("../src/themes/prepaint.ts");
const log = (line: string) => { console.log(line); appendFileSync("goto-probe.log", `${new Date().toISOString()} ${line}\n`); };
const browser = await webkit.launch();
let gotos = 0, errors = 0, notReady = 0;
for (let t = 0; t < tests; t++) {
  const context = await browser.newContext({ ...devices["Desktop Safari"], ignoreHTTPSErrors: true, baseURL: base, viewport: { width: 320, height: 640 } });
  const page = await context.newPage();
  const failed: string[] = [];
  page.on("requestfailed", (request) => failed.push(`${request.url().replace(base, "/")} ${request.failure()?.errorText}`));
  for (const path of ["./", "nautilus/"]) {
    for (const preset of PRESET_NAMES) {
      await page.addInitScript(([key, json]) => localStorage.setItem(key, json), [THEME_KEY, JSON.stringify({ preset })] as const);
      gotos++;
      const started = Date.now();
      try {
        await page.goto(path);
        await page.locator("html[data-site-ready]").waitFor({ state: "attached", timeout: 15_000 });
      } catch (error) {
        const message = String((error as Error).message).split("\n")[0];
        if (/internal error|goto/i.test(message)) errors++; else notReady++;
        log(`FAIL test ${t} goto ${gotos} ${path} ${preset} after ${Date.now() - started} ms: ${message} | failed requests: ${failed.slice(-8).join("; ")}`);
      }
      failed.length = 0;
    }
  }
  await context.close();
}
await browser.close();
log(`SUMMARY gotos ${gotos} goto-errors ${errors} not-ready ${notReady}`);
