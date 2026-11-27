import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import postcss from "postcss";
import { check } from "../../registry/ouro/check/run.ts";
import { squircleCorners } from "../../registry/ouro/lib/ouro/squircle-corners.ts";
import { dir, page, quiet, site } from "./kit.mts";

async function styles(css: string): Promise<string> {
  return (await postcss([squircleCorners()]).process(css, { from: undefined })).css;
}

async function scan(name: string, html: string, config: { windowRadius?: number } = {}) {
  return check({
    targets: [site(name, { "index.html": html })],
    out: dir(name),
    sizes: [[390, 844]],
    themes: ["light"],
    axe: false,
    measured: false,
    config,
    chromium,
    log: quiet,
  });
}

test("corners-nest finds a mismatched bottom corner through a wrapper in a clipping shell", async () => {
  const css = await styles(`
    .shell { position: relative; width: 240px; height: 180px; overflow: hidden; border-radius: 32px; background: #dce5ef; }
    .wrapper { position: absolute; inset: 4px; }
    .panel { width: 100%; height: 100%; border-radius: 28px 28px 8px 28px; background: #557799; }
    .good { border-bottom-right-radius: 28px; }
  `);
  const fixture = (good: boolean) => page(
    `<h1>Projects</h1><div id="shell" class="shell"><div class="wrapper"><div id="panel" class="panel${good ? " good" : ""}">Notes</div></div></div>`,
    `<style>${css}</style>`,
  );
  const broken = (await scan("corners-broken", fixture(false))).findings.filter((finding) => finding.rule === "corners-nest");
  assert.equal(broken.length, 1);
  assert.match(broken[0]!.element, /#panel.*#shell/);
  assert.match(broken[0]!.detail, /bottom right/i);
  assert.match(broken[0]!.detail, /28px/);
  const sound = (await scan("corners-sound", fixture(true))).findings.filter((finding) => finding.rule === "corners-nest");
  assert.deepEqual(sound, []);
});

test("corners-nest compares a surface with the native window only when its radius is supplied", async () => {
  const css = await styles(`
    .window-panel { position: fixed; inset: 4px; border-radius: 8px; background: #557799; }
  `);
  const fixture = page(`<h1>Projects</h1><div id="window-panel" class="window-panel">Notes</div>`, `<style>${css}</style>`);
  const withoutWindow = (await scan("window-unspecified", fixture)).findings.filter((finding) => finding.rule === "corners-nest");
  assert.deepEqual(withoutWindow, []);
  const withWindow = (await scan("window-specified", fixture, { windowRadius: 32 })).findings.filter((finding) => finding.rule === "corners-nest");
  assert.equal(withWindow.length, 1);
  assert.match(withWindow[0]!.element, /#window-panel/);
  assert.match(withWindow[0]!.detail, /28px/);
});

test("squircle-paint finds a descendant's square fill beyond a squircle, but passes the clipped surface", async () => {
  const css = await styles(`
    body { background: linear-gradient(110deg, #f8f3e7, #dce8f4); }
    .surface { position: relative; width: 220px; height: 140px; border-radius: 32px; background: #557799; }
    .broken { clip-path: none !important; }
    .fill { position: absolute; inset: 0; background: #cc6655; }
  `);
  const fixture = (broken: boolean) => page(
    `<h1>Projects</h1><div id="surface" class="surface${broken ? " broken" : ""}"><div class="fill"></div></div>`,
    `<style>${css}</style>`,
  );
  const leaked = (await scan("paint-broken", fixture(true))).findings.filter((finding) => finding.rule === "squircle-paint");
  assert.equal(leaked.length, 1);
  assert.match(leaked[0]!.element, /#surface/);
  assert.match(leaked[0]!.detail, /corner/i);
  const clipped = (await scan("paint-clipped", fixture(false))).findings.filter((finding) => finding.rule === "squircle-paint");
  assert.deepEqual(clipped, []);
});
