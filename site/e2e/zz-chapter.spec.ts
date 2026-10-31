import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "@playwright/test";

// PROBE (never merged): catalog.spec's home -> nautilus visit, then how long Chapter I's island
// takes to mark itself ready, and what failed on the way. PROBE_SERVER=preview serves with Vite
// preview on 4188 instead of the config's Pages-style server.
let server: ChildProcess | undefined;
test.use({ ignoreHTTPSErrors: true });
test.beforeAll(async () => {
  if (process.env["PROBE_SERVER"] !== "preview") return;
  server = spawn("pnpm", ["exec", "vite", "preview", "--config", "site/vite.config.ts", "--host", "127.0.0.1", "--port", "4188", "--strictPort"], { stdio: "ignore" });
  await new Promise((resolve) => setTimeout(resolve, 4000));
});
test.afterAll(() => server?.kill());
const base = () => (process.env["PROBE_SERVER"] === "preview" ? "http://127.0.0.1:4188/" : "");

test("probe: home then nautilus, chapter one ready", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const events: string[] = [];
  page.on("requestfailed", (request) => events.push(`requestfailed ${new URL(request.url()).pathname} ${request.failure()?.errorText}`));
  page.on("pageerror", (error) => events.push(`pageerror ${String(error).slice(0, 160)}`));
  page.on("console", (message) => message.type() === "error" && events.push(`console.error ${message.text().slice(0, 160)}`));
  await page.goto(base() + "./");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.waitForLoadState("networkidle");
  events.length = 0;
  const start = Date.now();
  await page.goto(base() + "nautilus/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  const ready = await page.locator("#chapter-one[data-chapter-ready]").waitFor({ state: "attached", timeout: 60_000 }).then(() => Date.now() - start, () => -1);
  console.log(`PROBE CH1 ${ready < 0 ? "NEVER" : ready > 5000 ? "SLOW" : "OK"} ${ready} ms repeat ${testInfo.repeatEachIndex}${events.length ? " | " + events.slice(0, 8).join(" | ") : ""}`);
  expect(ready).toBeGreaterThan(0);
});
