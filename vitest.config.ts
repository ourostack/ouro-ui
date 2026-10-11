import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { commands } from "./registry/ouro/lib/ouro/testing/commands.ts";

const visual = process.env["CI_VISUAL"] === "1";

const shared = {
  // app.css compiles the registry source with Tailwind, as an app that installed Ouro UI does.
  plugins: [react(), tailwindcss()],
  // `@/` is the repo root, as in an app's components.json, so registry imports resolve here too.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // Pre-bundle Base UI entry points up front. A dependency Vite discovers mid-run
  // triggers a re-optimization and reload, which can load React twice for one file.
  optimizeDeps: { include: ["@base-ui/react/alert-dialog", "@base-ui/react/button", "@base-ui/react/dialog", "@base-ui/react/drawer"] },
};

// Loads app.css, and fails any test that logs a React act() warning (see test/setup.ts).
const setupFiles = ["./test/setup.ts"];

const unitInclude = ["{registry,test}/**/*.test.{ts,tsx}"];
const unitExclude = ["**/*.touch.test.{ts,tsx}", "**/*.visual.test.{ts,tsx}"];

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "istanbul",
      include: ["registry/**/*.{ts,tsx}"],
      exclude: ["**/*.stories.tsx", "registry/ouro/lib/ouro/testing/**", "**/*.test.{ts,tsx}", "**/*.test-d.ts", "**/*.d.ts"],
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
          include: ["registry/**/*.touch.test.{ts,tsx}"],
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
      {
        // The landing page and docs site (site/), rendered at the widths it is built for. It
        // declares its own Vite setup, matching site/vite.config.ts, rather than sharing the
        // registry projects'.
        plugins: [react(), tailwindcss()],
        resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
        optimizeDeps: { include: ["@base-ui/react/alert-dialog", "@base-ui/react/button", "@base-ui/react/dialog", "@base-ui/react/drawer"] },
        test: {
          name: "site",
          setupFiles: ["./site/test/setup.ts"],
          include: ["site/**/*.test.{ts,tsx}"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
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
                include: ["test/**/*.visual.test.{ts,tsx}"],
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
