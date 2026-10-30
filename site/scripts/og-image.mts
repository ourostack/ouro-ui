// Renders site/public/og.png, the 1200×630 image link previews show (the og:image and
// twitter:image tags, site/src/head.ts), from the landing page itself: the hero, in the light
// theme with motion reduced so the frame is settled. Rerun after the landing page changes,
// review the image, and commit it:
//
//   node site/scripts/og-image.mts
//
// It serves the site with Vite's dev server, so it needs no build, and uses the Chromium
// that Playwright installs for the tests.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = join(repo, "site/public/og.png");

const server = await createServer({ configFile: join(repo, "site/vite.config.ts"), server: { port: 4180, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
try {
  // Laid out at 1600×840, a desktop width, and captured at 0.75 scale: 1200×630.
  const context = await browser.newContext({ viewport: { width: 1600, height: 840 }, deviceScaleFactor: 0.75, colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("http://localhost:4180/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  // Wait until every transition has finished, so the frame is the same on each run.
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
  await server.close();
}
