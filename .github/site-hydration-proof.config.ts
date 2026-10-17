import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../site/e2e",
  testMatch: "hydration.probe.spec.ts",
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "site-hydration-tests.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4179/ouro-ui/",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "site-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "site-webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "pnpm site:build && pnpm site:preview --host 127.0.0.1 --port 4179 --strictPort",
    url: "http://127.0.0.1:4179/ouro-ui/",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
