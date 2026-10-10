import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { commands } from "./vitest.commands.ts";

const visual = process.env["CI_VISUAL"] === "1";

const shared = {
  plugins: [react()],
  // Pre-bundle Base UI entry points up front. A dependency Vite discovers mid-run
  // triggers a re-optimization and reload, which can load React twice for one file.
  optimizeDeps: { include: ["@base-ui/react/alert-dialog", "@base-ui/react/button", "@base-ui/react/dialog", "@base-ui/react/drawer"] },
};

// Fails any test that logs a React act() warning (see test/setup.ts).
const setupFiles = ["./test/setup.ts"];

const unitInclude = ["src/**/*.test.{ts,tsx}"];
const unitExclude = ["src/**/*.touch.test.{ts,tsx}", "src/**/*.visual.test.{ts,tsx}"];

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/*.stories.tsx", "**/*.test.{ts,tsx}", "**/*.test-d.ts", "src/**/index.ts", "src/parts.ts", "src/generated/**"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
    projects: [
      {
        ...shared,
        test: {
          name: "chromium",
          setupFiles,
          include: unitInclude,
          exclude: unitExclude,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            commands,
          },
        },
      },
      {
        ...shared,
        test: {
          name: "webkit",
          setupFiles,
          include: unitInclude,
          exclude: unitExclude,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "webkit" }],
            commands,
          },
        },
      },
      {
        // Coarse-pointer tests (touch targets, touch drags): Chromium emulating a phone.
        ...shared,
        test: {
          name: "touch",
          setupFiles,
          include: ["src/**/*.touch.test.{ts,tsx}"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              contextOptions: {
                hasTouch: true,
                isMobile: true,
                viewport: { width: 390, height: 844 },
              },
            }),
            instances: [{ browser: "chromium" }],
            viewport: { width: 390, height: 844 },
            commands,
          },
        },
      },
      ...(visual
        ? [
            {
              ...shared,
              test: {
                name: "visual",
                setupFiles,
                include: ["src/**/*.visual.test.{ts,tsx}"],
                browser: {
                  enabled: true,
                  headless: true,
                  provider: playwright(),
                  instances: [{ browser: "chromium" as const }],
                  commands,
                },
              },
            },
          ]
        : []),
    ],
  },
});
