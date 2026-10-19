import { defineConfig, devices } from "@playwright/test";

// End-to-end specs: registry/ouro/e2e/ouro/*.spec.ts, the specs each item installs into an
// app's e2e/ouro/. They open stories in a Storybook (OURO_E2E_URL, default
// http://localhost:6006); here, this repository's own.
export default defineConfig({
  testDir: "registry/ouro/e2e",
  // The screen-reader specs need VoiceOver or NVDA: playwright.screen-reader.config.ts runs them.
  testIgnore: /\.sr\.spec\.ts$/,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "site-chromium", testDir: "site/e2e", retries: 0, use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4179/ouro-ui/" } },
    { name: "site-webkit", testDir: "site/e2e", retries: 0, use: { ...devices["Desktop Safari"], baseURL: "http://127.0.0.1:4179/ouro-ui/" } },
  ],
  webServer: [
    {
      command: "pnpm exec storybook dev -p 6006 --ci --no-open",
      url: "http://localhost:6006/iframe.html",
      reuseExistingServer: !process.env["CI"],
      timeout: 180_000,
    },
    {
      command: "pnpm site:build && pnpm site:preview --host 127.0.0.1 --port 4179 --strictPort",
      url: "http://127.0.0.1:4179/ouro-ui/",
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
