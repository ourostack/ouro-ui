import { defineConfig, devices } from "@playwright/test";
export default defineConfig({ testDir: ".", timeout: 600_000, reporter: "list", projects: [{ name: "webkit", use: { ...devices["Desktop Safari"] } }, { name: "chromium", use: { ...devices["Desktop Chrome"] } }] });
