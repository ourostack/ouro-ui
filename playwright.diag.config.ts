// PROBE (never merge): content-visibility on the chapters in WebKit and Chromium, under a dialog.
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "site/e2e",
  testMatch: /cv-diag\.spec\.ts$/,
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  projects: [
    { name: "webkit", use: { ...devices["Desktop Safari"], baseURL: "http://127.0.0.1:4179/" } },
    { name: "chromium", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4179/" } },
  ],
});
