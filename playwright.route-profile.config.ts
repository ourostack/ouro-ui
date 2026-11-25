import { defineConfig, devices } from "@playwright/test";

// route-profile.yml's probe (site/probes/route-profile.spec.ts): where a slow route spends its time in WebKit. CI's e2e
// shards never run it (their testDir is site/e2e), and it runs by hand only.
export default defineConfig({
  testDir: "site/probes",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  timeout: 180_000,
  reporter: process.env["CI"] ? [["list"], ["github"]] : "list",
  use: { ...devices["Desktop Safari"], baseURL: "https://127.0.0.1:4179/", ignoreHTTPSErrors: true },
  projects: [{ name: "webkit" }],
  webServer: {
    command: "pnpm site:build && node site/scripts/serve-pages.mjs 4179",
    url: "https://127.0.0.1:4179/",
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
