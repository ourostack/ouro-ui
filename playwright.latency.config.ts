import { defineConfig, devices } from "@playwright/test";

// The voyage stage's interaction latency (`pnpm test:latency`, CI's latency job):
// site/e2e/*.latency.spec.ts against the production build, in Chromium (CPU throttling is a DevTools
// feature), one test at a time, so no other worker shares the CPU being measured.
export default defineConfig({
  testDir: "site/e2e",
  testMatch: /\.latency\.spec\.ts$/,
  outputDir: "test-results/latency",
  workers: 1,
  // Each control is pressed 22 times, each press settling before the next (site/e2e/latency.ts).
  timeout: 120_000,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env["CI"],
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never", outputFolder: "playwright-report/latency" }]] : "list",
  projects: [
    { name: "site-latency", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4179/" } },
    // The switch to still water's frames in WebKit too, where its costs were found (#667). Served as GitHub Pages serves
    // the site (site/scripts/serve-pages.mjs), as the site's other WebKit specs are: under Vite preview WebKit lost pages.
    { name: "site-latency-webkit", testMatch: /stage-switch\.latency\.spec\.ts$/, use: { ...devices["Desktop Safari"], baseURL: "https://127.0.0.1:4181/", ignoreHTTPSErrors: true } },
  ],
  // In order: the first builds the site, then the second serves that build.
  webServer: [
    {
      command: "pnpm site:build && pnpm site:preview --host 127.0.0.1 --port 4179 --strictPort",
      url: "http://127.0.0.1:4179/",
      reuseExistingServer: !process.env["CI"],
      timeout: 180_000,
    },
    {
      command: "node site/scripts/serve-pages.mjs 4181",
      url: "https://127.0.0.1:4181/",
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
    },
  ],
});
