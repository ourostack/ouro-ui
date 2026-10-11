import { defineConfig, devices } from "@playwright/test";

// Starts the app's Storybook, where Ouro UI's specs (e2e/ouro) open their stories.
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
