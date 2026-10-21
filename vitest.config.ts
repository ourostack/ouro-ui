import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { MotionReporter } from "./scripts/motion-reporter.mts";
import { proofPlugin } from "./site/scripts/proof.mts";
import { commands } from "./registry/ouro/lib/ouro/testing/commands.ts";
import { ouroTestProjects } from "./registry/ouro/lib/ouro/testing/vitest.ts";
import { conformanceCommands } from "./test/conformance/commands.ts";

const visual = process.env["CI_VISUAL"] === "1";
// test/themes/: every story under each third-party theme fixture, heavy enough to run apart
// (`pnpm test:themes`, CI's sharded `themes` job), so `pnpm test` leaves it out.
const themes = process.env["OURO_THEMES"] === "1";
const themeTests = "test/themes/**";
// test/conformance/: the conformance matrix, every story through each recurring-finding check
// (focus, hydration under foreign time zones and locales, right-to-left, forced colours,
// announcements), only with OURO_CONFORMANCE=1 (`pnpm conformance`, CI's sharded `conformance` job).
const conformance = process.env["OURO_CONFORMANCE"] === "1";
const conformanceTests = "test/conformance/**";
// A mutation run (`pnpm mutation`, scripts/mutation.mjs): Stryker's mutants are switched on in the
// browser by scripts/mutation/setup.ts, from the mutant the runner in scripts/mutation/plugins.mjs
// is running, which the `ouroMutant` command reads in this process.
const mutation = process.env["OURO_MUTATION"] === "1";
const mutationCommands = { ouroMutant: () => (globalThis as { __ouroMutant?: string }).__ouroMutant ?? null };

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
      "@base-ui/react/accordion",
      "@base-ui/react/alert-dialog",
      "@base-ui/react/autocomplete",
      "@base-ui/react/avatar",
      "@base-ui/react/button",
      "@base-ui/react/checkbox",
      "@base-ui/react/checkbox-group",
      "@base-ui/react/collapsible",
      "@base-ui/react/combobox",
      "@base-ui/react/context-menu",
      "@base-ui/react/dialog",
      "@base-ui/react/drawer",
      "@base-ui/react/field",
      "@base-ui/react/fieldset",
      "@base-ui/react/form",
      "@base-ui/react/menu",
      "@base-ui/react/menubar",
      "@base-ui/react/navigation-menu",
      "@base-ui/react/number-field",
      "@base-ui/react/otp-field",
      "@base-ui/react/popover",
      "@base-ui/react/preview-card",
      "@base-ui/react/progress",
      "@base-ui/react/radio",
      "@base-ui/react/radio-group",
      "@base-ui/react/scroll-area",
      "@base-ui/react/select",
      "@base-ui/react/separator",
      "@base-ui/react/slider",
      "@base-ui/react/switch",
      "@base-ui/react/tabs",
      "@base-ui/react/toast",
      "@base-ui/react/toggle",
      "@base-ui/react/toggle-group",
      "@base-ui/react/tooltip",
      "recharts",
    ],
  },
  test: {
    passWithNoTests: true,
    // A pull request's reduced run (scripts/test-impact.mjs) names the component folders whose
    // stories the shared suites in test/ render; unset, they render every story (test/stories.tsx).
    provide: { ouroStories: process.env["OURO_STORIES"] ?? null, ouroShard: process.env["OURO_CONFORMANCE_SHARD"] ?? null },
    // Vitest's own reporters, and the motion evidence each run writes to .tmp/motion/ for
    // `pnpm motion:coverage` (scripts/motion-reporter.mts). A themes or conformance run proves
    // no motion and writes none, so it leaves `pnpm test`'s partitions as they were.
    reporters: [...configDefaults.reporters, ...(themes || conformance ? [] : [new MotionReporter()])],
    coverage: {
      provider: "istanbul",
      // The census kit's in-page collector is JavaScript an app's Playwright runs in the page; its
      // Node side is covered by scripts/kits.test.mjs.
      include: ["registry/**/*.{ts,tsx}", "registry/ouro/census/census-collect.mjs"],
      exclude: ["**/*.stories.tsx", "registry/ouro/lib/ouro/testing/**", "registry/ouro/e2e/**", "**/*.test.{ts,tsx}", "**/*.test-d.ts", "**/*.d.ts"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
    projects: [
      ...ouroTestProjects({ css, include: ["{registry,test}/**/*.test.{ts,tsx}"] }).map((project) => ({
        ...project,
        test: {
          ...project.test,
          exclude: [...(project.test?.exclude ?? configDefaults.exclude), themeTests, conformanceTests],
          ...(mutation
            ? {
                setupFiles: [...[project.test?.setupFiles ?? []].flat(), "./scripts/mutation/setup.ts"],
                browser: { ...project.test?.browser, commands: { ...project.test?.browser?.commands, ...mutationCommands } },
              }
            : {}),
        },
      })),
      {
        // The landing page and docs site (site/), rendered at the widths it is built for. It
        // inherits this file's Vite setup (React, Tailwind, the `@` alias), which matches
        // site/vite.config.ts.
        extends: true as const,
        publicDir: fileURLToPath(new URL("./site/public", import.meta.url)),
        // The hero's proof line, computed from the repository (site/scripts/proof.mts).
        plugins: [proofPlugin()],
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
      ...(themes
        ? [
            {
              extends: true as const,
              test: {
                name: "themes",
                expect: { poll: { timeout: 10_000 } },
                setupFiles: [css, "./registry/ouro/lib/ouro/testing/setup.ts"],
                include: [`${themeTests}/*.test.{ts,tsx}`],
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
      ...(conformance
        ? [
            {
              extends: true as const,
              test: {
                name: "conformance",
                expect: { poll: { timeout: 10_000 } },
                setupFiles: [css, "./registry/ouro/lib/ouro/testing/setup.ts"],
                include: [`${conformanceTests}/*.test.{ts,tsx}`],
                browser: {
                  enabled: true,
                  headless: true,
                  provider: playwright(),
                  instances: [{ browser: "chromium" as const }],
                  commands: { ...commands, ...conformanceCommands },
                },
              },
            },
          ]
        : []),
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
