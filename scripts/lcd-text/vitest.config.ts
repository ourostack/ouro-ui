import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { squircleCorners } from "../../registry/ouro/lib/ouro/squircle-corners.ts";
import { ouroTestProjects } from "../../registry/ouro/lib/ouro/testing/vitest.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));

// Chromium on Windows leaves a see-through scroller off the compositor only with LCD text on at device scale 1
// (ourostack/ouro-ui#2891, #3183). Linux CI paints greyscale text, so this runs the scrollers' surface tests with LCD
// text forced on, at scale 1, which fails a scroller that has lost its opaque background. Report-only:
// .github/workflows/lcd-text-windows.yml.
export const lcdTextArguments = ["--enable-lcd-text", "--force-device-scale-factor=1"];

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  css: { postcss: { plugins: [squircleCorners()] } },
  resolve: { alias: { "@": root } },
  test: {
    projects: ouroTestProjects({
      css: "./app.css",
      include: ["registry/ouro/components/ouro/{scroll-area,message}/*.surface.test.tsx"],
      browsers: ["chromium"],
    }).map((project) => ({
      ...project,
      test: {
        ...project.test,
        browser: {
          ...project.test?.browser,
          provider: playwright({ launchOptions: { args: lcdTextArguments } }),
        },
      },
    })),
  },
});
