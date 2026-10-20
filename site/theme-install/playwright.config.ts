import { defineConfig, devices } from "@playwright/test";

// The copy-theme install proof (site/scripts/theme-install-test.sh runs it): the built site and
// a clean shadcn app per preset, served side by side, compared in Chromium.
export default defineConfig({
  testDir: ".",
  forbidOnly: !!process.env["CI"],
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  projects: [{ name: "theme-install", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4190/" } }],
  webServer: {
    command: "node serve.mjs",
    url: "http://127.0.0.1:4190/ouro-ui/voyage/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
