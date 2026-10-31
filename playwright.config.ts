import { defineConfig, devices } from "@playwright/test";

// End-to-end specs: registry/ouro/e2e/ouro/*.spec.ts, the specs each item installs into an
// app's e2e/ouro/. They open stories in a Storybook (OURO_E2E_URL, default
// http://localhost:6006); here, this repository's own.
/** Where the site's specs find the built site (site/scripts/serve-pages.mjs). */
const SITE = "https://127.0.0.1:4179/";

export default defineConfig({
  testDir: "registry/ouro/e2e",
  // The screen-reader specs need VoiceOver or NVDA: playwright.screen-reader.config.ts runs them.
  testIgnore: /\.sr\.spec\.ts$/,
  // Every test on its own, so CI's --shard splits tests, not files: by file, the site projects'
  // long specs all landed in the last of the e2e shards (8.5 min of specs against 3-4 for the
  // others). The specs share no state between tests.
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"]
    ? [
        ["list"],
        ["html", { open: "never" }],
        // CI's e2e shards: how long each spec file took, for `node scripts/shard.mjs refresh`.
        ...(process.env["OURO_E2E_TIMINGS"] ? [["./scripts/timings-playwright-reporter.mjs", { outputFile: process.env["OURO_E2E_TIMINGS"] }] as const] : []),
      ]
    : "list",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    // The stage's latency spec runs alone (playwright.latency.config.ts). The site's specs run
    // against the build served as GitHub Pages serves it (site/scripts/serve-pages.mjs: HTTP/2, TLS,
    // gzip with a length), so they check what people get; its certificate is self-signed.
    { name: "site-chromium", testDir: "site/e2e", testIgnore: /\.latency\.spec\.ts$/, retries: 0, use: { ...devices["Desktop Chrome"], baseURL: SITE, ignoreHTTPSErrors: true } },
    { name: "site-webkit", testDir: "site/e2e", testIgnore: /\.latency\.spec\.ts$/, retries: 0, use: { ...devices["Desktop Safari"], baseURL: SITE, ignoreHTTPSErrors: true } },
  ],
  webServer: [
    {
      command: "pnpm exec storybook dev -p 6006 --ci --no-open",
      url: "http://localhost:6006/iframe.html",
      reuseExistingServer: !process.env["CI"],
      timeout: 180_000,
    },
    {
      // Vite preview's HTTP/1.1 server, with gzip made on the fly in chunks, left WebKit with pages
      // whose own requests failed ("WebKit encountered an internal error") or whose HTML arrived
      // still compressed (probe run 41191679257: 9 such runs of the 320 px reflow loop in 80 under
      // Vite preview, 1 in 160 served this way).
      command: "pnpm site:build && node site/scripts/serve-pages.mjs 4179",
      url: SITE,
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
