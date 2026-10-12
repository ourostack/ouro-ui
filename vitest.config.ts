import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { commands } from "./registry/ouro/lib/ouro/testing/commands.ts";
import { ouroTestProjects } from "./registry/ouro/lib/ouro/testing/vitest.ts";

const visual = process.env["CI_VISUAL"] === "1";

// The repository as its own app: app.css compiles the registry source with Tailwind,
// and `@/` is the repo root, as in an app's components.json, so registry imports resolve.
// The test projects are the ones the `ouro-testing` item ships to apps
// (registry/ouro/lib/ouro/testing/vitest.ts), so the repo runs its tests the way apps do.
const css = "./app.css";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // Pre-bundle Base UI entry points up front. A dependency Vite discovers mid-run
  // triggers a re-optimization and reload, which can load React twice for one file.
  optimizeDeps: {
    include: [
      "@base-ui/react/alert-dialog",
      "@base-ui/react/avatar",
      "@base-ui/react/button",
      "@base-ui/react/checkbox",
      "@base-ui/react/dialog",
      "@base-ui/react/drawer",
      "@base-ui/react/field",
      "@base-ui/react/fieldset",
      "@base-ui/react/form",
      "@base-ui/react/popover",
      "@base-ui/react/preview-card",
      "@base-ui/react/progress",
      "@base-ui/react/scroll-area",
      "@base-ui/react/separator",
      "@base-ui/react/toast",
      "@base-ui/react/tooltip",
    ],
  },
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "istanbul",
      include: ["registry/**/*.{ts,tsx}"],
      exclude: ["**/*.stories.tsx", "registry/ouro/lib/ouro/testing/**", "registry/ouro/e2e/**", "**/*.test.{ts,tsx}", "**/*.test-d.ts", "**/*.d.ts"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
    projects: [
      ...ouroTestProjects({ css, include: ["{registry,test}/**/*.test.{ts,tsx}"] }),
      {
        // The landing page and docs site (site/), rendered at the widths it is built for. It
        // inherits this file's Vite setup (React, Tailwind, the `@` alias), which matches
        // site/vite.config.ts.
        extends: true as const,
        test: {
          name: "site",
          expect: { poll: { timeout: 10_000 } },
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
              extends: true as const,
              test: {
                name: "visual",
                expect: { poll: { timeout: 10_000 } },
                setupFiles: [css, "./registry/ouro/lib/ouro/testing/setup.ts"],
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
