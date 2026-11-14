import { defineConfig, devices } from "@playwright/test";

// The Skeleton frame probe (registry/ouro/e2e/probes/): a repository-only measurement that
// skeleton-frames.yml runs on a schedule and by hand. Its frame counts are noisy by design (a
// permutation test, 20 runs per arm), so CI's e2e shards never run it (playwright.config.ts ignores probes/).
// It runs WebKit only, where the frames are dropped.
export default defineConfig({
  testDir: "registry/ouro/e2e/probes",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  reporter: process.env["CI"] ? [["list"], ["github"]] : "list",
  projects: [{ name: "webkit", use: { ...devices["Desktop Safari"] } }],
  webServer: {
    command: "pnpm exec storybook dev -p 6006 --ci --no-open",
    url: "http://localhost:6006/iframe.html",
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
});
