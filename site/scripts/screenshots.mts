// Screenshots of the built site (run `pnpm site:build` first), for review:
//   node site/scripts/screenshots.mts <out-dir> [path ...]
// Serves site/dist with `vite preview`, captures each path at 390px and 1280px in light
// and dark, full page, and fails on any console error (a hydration mismatch shows there).
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const [out = ".tmp/site-screens", ...pathArgs] = process.argv.slice(2);
const paths = pathArgs.length > 0 ? pathArgs : ["/", "/docs/sheet/"];
const port = 4179;
mkdirSync(out, { recursive: true });

const preview = spawn("pnpm", ["exec", "vite", "preview", "--config", "site/vite.config.ts", "--port", String(port), "--strictPort"], {
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise<void>((resolve) => preview.stdout!.on("data", (chunk: Buffer) => chunk.toString().includes(String(port)) && resolve()));

const errors: string[] = [];
const browser = await chromium.launch();
try {
  for (const scheme of ["light", "dark"] as const) {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 }, colorScheme: scheme, deviceScaleFactor: 2 });
      const page = await context.newPage();
      page.on("console", (message) => message.type() === "error" && errors.push(`${message.text()}`));
      page.on("pageerror", (error) => errors.push(error.message));
      for (const path of paths) {
        await page.goto(`http://localhost:${port}/ouro-ui${path}`, { waitUntil: "networkidle" });
        const name = path === "/" ? "landing" : path.replace(/^\/|\/$/g, "").replace(/\//g, "-");
        await page.screenshot({ path: join(out, `${name}-${width}-${scheme}.png`), fullPage: true });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  preview.kill();
}
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`wrote screenshots to ${out}`);
