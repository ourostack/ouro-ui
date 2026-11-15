// Renders site/public/og.png, a 1200×630 screenshot of the landing page's hero, in the light
// theme with motion reduced so the frame is settled. No page's og:image or twitter:image uses it
// any more: link previews show the storybook cards site/scripts/og-cards.mts draws
// (site/public/og/, chosen by cardFor in site/src/head.ts). It is kept for links shared before
// those cards, so there is no need to rerun this when the landing page changes. To redraw it:
//
//   pnpm site:build && node site/scripts/og-image.mts
//
// It photographs the built site (site/dist), served as GitHub Pages serves it, because the hero's
// stage is hydrated in turn from the prerendered HTML: under Vite's dev server there is no
// prerendered HTML and the porthole never appears. It uses the Chromium Playwright installs for
// the tests.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = join(repo, "site/public/og.png");
const port = 4181;

if (!existsSync(join(repo, "site/dist/index.html"))) throw new Error("No built site in site/dist: run pnpm site:build first.");

const server = spawn(process.execPath, [join(repo, "site/scripts/serve-pages.mjs"), String(port)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise<void>((resolve, reject) => {
  server.once("exit", (code) => reject(new Error(`serve-pages.mjs exited with ${code}`)));
  server.stdout.on("data", () => resolve());
});
const browser = await chromium.launch();
try {
  // Laid out at 1600×840, a desktop width, and captured at 0.75 scale: 1200×630.
  const context = await browser.newContext({ viewport: { width: 1600, height: 840 }, deviceScaleFactor: 0.75, colorScheme: "light", reducedMotion: "reduce", ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(`https://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.locator(".site-console-stage svg").first().waitFor();
  // Wait until every transition that ends has ended, so the frame is the same on each run. The sea's
  // own loops run on even with motion reduced, so they are not waited for.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.effect?.getTiming().iterations === Infinity));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
  server.kill();
}
