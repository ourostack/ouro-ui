import { defineConfig, devices } from "@playwright/test";
// PROBE (never merged): catalog.spec.ts alone in WebKit against a server started outside Playwright.
export default defineConfig({
  testDir: "site/e2e",
  testMatch: /catalog\.spec\.ts$/,
  workers: 1,
  retries: 0,
  reporter: "list",
  globalSetup: process.env["PROBE_WARM"] ? "./site/e2e/warm-up.ts" : undefined,
  projects: [{ name: "site-webkit", use: { ...devices["Desktop Safari"], baseURL: process.env["PROBE_BASE"], ignoreHTTPSErrors: true } }],
});
