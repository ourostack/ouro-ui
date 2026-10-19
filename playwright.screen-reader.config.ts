import { defineConfig, devices } from "@playwright/test";

// The screen-reader lane (`pnpm test:sr --project <voiceover|nvda>`, .github/workflows/screen-reader.yml,
// docs/guides/screen-reader-lane.md): registry/ouro/e2e/screen-reader/*.sr.spec.ts with real
// VoiceOver on macOS (WebKit) and NVDA on Windows (Chromium), through Guidepup, one test at a time
// and headed, because a screen reader reads the screen. The specs open named stories from a static
// build of this repository's Storybook; the `stories` project checks their ids first. The
// settings @guidepup/playwright's screenReaderConfig holds are written out here, because importing
// Guidepup throws where no screen reader is supported (Linux), and the script tests read this file.
export default defineConfig({
  testDir: "registry/ouro/e2e/screen-reader",
  testMatch: /\.sr\.spec\.ts$/,
  outputDir: "test-results/screen-reader",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env["CI"],
  timeout: 3 * 60_000,
  reportSlowTests: null,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never", outputFolder: "playwright-report/screen-reader" }]] : "list",
  use: { baseURL: "http://localhost:6006/", headless: false, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "stories", testMatch: /stories\.sr\.setup\.ts$/ },
    { name: "voiceover", dependencies: ["stories"], use: { ...devices["Desktop Safari"], headless: false } },
    { name: "nvda", dependencies: ["stories"], use: { ...devices["Desktop Chrome"], headless: false } },
  ],
  webServer: {
    command: "pnpm build-storybook --output-dir .tmp/storybook-sr && pnpm exec vite preview --outDir .tmp/storybook-sr --port 6006 --strictPort",
    url: "http://localhost:6006/iframe.html",
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
