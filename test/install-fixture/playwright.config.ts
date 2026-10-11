import { defineConfig, devices } from "@playwright/test";

// The app's Playwright setup. Ouro UI's specs (e2e/ouro) open stories in this app's
// Storybook, at OURO_E2E_URL.
export default defineConfig({
  testDir: "e2e",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npx storybook dev -p 6006 --ci --no-open",
    url: "http://localhost:6006/iframe.html",
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
});
