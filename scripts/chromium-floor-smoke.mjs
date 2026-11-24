// The Chromium floor smoke test: builds the real app.css (ouro-base plus squircleCorners()) through
// Vite exactly as the test and Storybook configs do, then loads it in the pinned
// playwright-core-chromium-floor Chromium (docs/guides/browser-support.md's documented floor) and
// checks that a plain rule positioned after squircleCorners()'s shape()/var() output still applies.
// ourostack/ouro-ui#3491 (fixed by #3494) was exactly this: that Chromium range stopped parsing the
// rest of the stylesheet after a shape() value with a bare var() segment, so every later rule,
// including this one, silently stopped applying. Run with `node --test scripts/chromium-floor-smoke.mjs`;
// .github/workflows/chromium-floor-smoke.yml runs it report-only on a pull request.
import assert from "node:assert/strict";
import { createReadStream, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";
import { squircleCorners } from "../registry/ouro/lib/ouro/squircle-corners.ts";
import { scratchDir } from "./scratch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const markerClass = "chromium-floor-smoke-marker";
const markerColor = "rgb(1, 2, 3)";
const contentTypes = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

/** Serves `dir` statically on an ephemeral localhost port; callers must call the returned close(). */
async function serveStatic(dir) {
  const server = createServer((req, res) => {
    const path = join(dir, decodeURIComponent(new URL(req.url, "http://localhost").pathname));
    res.setHeader("Content-Type", contentTypes[extname(path)] ?? "application/octet-stream");
    createReadStream(path).on("error", () => {
      res.statusCode = 404;
      res.end();
    }).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}


test("the built ouro-base stylesheet, loaded in the pinned Chromium 158 floor, still applies a rule positioned after squircleCorners()'s output", async () => {
  const dir = scratchDir("chromium-floor-smoke-");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "src", "entry.css"),
    `@import "${join(root, "app.css")}";\n\n.${markerClass} { color: ${markerColor}; }\n`,
  );
  writeFileSync(
    join(dir, "index.html"),
    [
      "<!doctype html>",
      '<html><head><link rel="stylesheet" href="/src/entry.css"></head>',
      '<body><div class="rounded-ouro-lg" style="width: 40px; height: 40px"></div>',
      `<div class="${markerClass}">marker</div></body></html>`,
      "",
    ].join("\n"),
  );
  const outDir = join(dir, "dist");
  await build({
    root: dir,
    logLevel: "warn",
    plugins: [tailwindcss()],
    css: { postcss: { plugins: [squircleCorners()] } },
    build: { outDir, cssCodeSplit: false },
  });

  const [css] = readdirSync(join(outDir, "assets")).filter((name) => name.endsWith(".css"));
  assert.ok(css, "the build produced no CSS asset; the scratch Vite config no longer matches app.css's build");
  const builtCss = readFileSync(join(outDir, "assets", css), "utf8");
  // Guards against a vacuous pass: if squircleCorners() ever stopped combining selectors into
  // --sq-clip (the exact construct #3491's Chromium range choked on), this test would prove
  // nothing about the regression it exists to catch.
  assert.match(builtCss, /--sq-clip:shape\(/, "squircleCorners() did not emit its shape()/var() --sq-clip declaration; the build no longer exercises ourostack/ouro-ui#3491's trigger");
  assert.ok(
    builtCss.indexOf("--sq-clip:shape(") < builtCss.indexOf(`.${markerClass}`),
    "the marker rule must land after squircleCorners()'s --sq-clip declaration in the built stylesheet for this test to prove anything",
  );

  const { chromium } = await import("playwright-core-chromium-floor");
  const browser = await chromium.launch();
  const server = await serveStatic(outDir);
  try {
    const [major] = browser.version().split(".").map(Number);
    assert.equal(
      major,
      158,
      `playwright-core-chromium-floor must stay pinned to the documented floor (docs/guides/browser-support.md); it launched Chromium ${browser.version()} instead`,
    );
    const page = await browser.newPage();
    await page.goto(`${server.url}/index.html`);
    const color = await page
      .locator(`.${markerClass}`)
      .evaluate((el) => globalThis.getComputedStyle(el).color);
    assert.equal(
      color,
      markerColor,
      `the marker rule, positioned after squircleCorners()'s output in the built stylesheet, did not apply in Chromium ${browser.version()}; that is ourostack/ouro-ui#3491's regression`,
    );
  } finally {
    await browser.close();
    await server.close();
  }
});
