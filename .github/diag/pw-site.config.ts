import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../../site/e2e",
  testIgnore: /\.latency\.spec\.ts$/,
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  projects: [
    { name: "site-chromium", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4179/ouro-ui/" } },
    { name: "site-webkit", use: { ...devices["Desktop Safari"], baseURL: "http://127.0.0.1:4179/ouro-ui/" } },
  ],
});
