import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { chromium, webkit, type Page } from "playwright";
import postcss from "postcss";
import { findCornerIssues, type CornerOptions } from "../../registry/ouro/check/corner-check.ts";
import { findDesignIssues } from "../../registry/ouro/check/design-check.ts";
import { check } from "../../registry/ouro/check/run.ts";
import { findSquirclePaint, type PaintClip } from "../../registry/ouro/check/squircle-paint.ts";
import { squircleCorners } from "../../registry/ouro/lib/ouro/squircle-corners.ts";
import { dir, fixtures, page, quiet, site } from "./kit.mts";

async function styles(css: string): Promise<string> {
  return (await postcss([squircleCorners()]).process(css, { from: undefined })).css;
}

function contour(w: number, h: number, r: number): string {
  return [
    `M 0 ${r}`,
    `C 0 ${.613 * r} ${-.0092 * r} ${.3274 * r} ${.1591 * r} ${.1591 * r}`,
    `C ${.3274 * r} ${-.0092 * r} ${.613 * r} 0 ${r} 0 H ${w - r}`,
    `C ${w - .613 * r} 0 ${w - .3274 * r} ${-.0092 * r} ${w - .1591 * r} ${.1591 * r}`,
    `C ${w + .0092 * r} ${.3274 * r} ${w} ${.613 * r} ${w} ${r} V ${h - r}`,
    `C ${w} ${h - .613 * r} ${w + .0092 * r} ${h - .3274 * r} ${w - .1591 * r} ${h - .1591 * r}`,
    `C ${w - .3274 * r} ${h + .0092 * r} ${w - .613 * r} ${h} ${w - r} ${h} H ${r}`,
    `C ${.613 * r} ${h} ${.3274 * r} ${h + .0092 * r} ${.1591 * r} ${h - .1591 * r}`,
    `C ${-.0092 * r} ${h - .3274 * r} 0 ${h - .613 * r} 0 ${h - r} Z`,
  ].join(" ");
}

async function scan(name: string, html: string, config: CornerOptions = {}) {
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

async function transparentClip({ clip = 24, own = 0, clipRound = false, ownRound = false, empty = false } = {}) {
  const radius = (value: number, round: boolean) => round
    ? `border-radius: ${value}px; corner-shape: round;`
    : `border-radius: ${value * .543}px; ${["tl", "tr", "br", "bl"].map((key) => `--sq-${key}: ${value}px;`).join(" ")}
       clip-path: path("${contour(100, 100, value)}");`;
  return `<style>
    body { margin: 0; background: white; }
    .outer { position: absolute; left: 80px; top: 80px; width: 200px; height: 160px; box-shadow: 0 2px 6px #0002;
      border-radius: ${32 * .543}px; --sq-tl: 32px; --sq-tr: 32px; --sq-br: 32px; --sq-bl: 32px; }
    .clip { position: absolute; left: 8px; top: 8px; width: 100px; height: 100px; overflow: hidden; ${radius(clip, clipRound)} }
    .tile { position: absolute; inset: 0; background: #557799; ${radius(own, ownRound)} }
  </style><div class="outer"><div class="clip">${empty ? "" : '<div class="tile"></div>'}</div></div>`;
}

test("corners-nest checks the marked surface in the nested-frame pass fixture", async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage();
    try {
      for (const width of [390, 1440]) {
        await tab.setViewportSize({ width, height: 900 });
        await tab.setContent(readFileSync(join(fixtures, "nested-frame-pass.html"), "utf8"));
        assert.deepEqual(await tab.evaluate(findCornerIssues), [], `${engine.name()}: ${width}px`);
        const design = await tab.evaluate(findDesignIssues, { legacyCorners: false });
        assert.deepEqual(design.filter((issue) => issue.rule === "nested-frame"), []);
        await tab.locator(".btn [data-ouro-surface]").evaluate((el) => { el.style.borderRadius = "0"; });
        const broken = await tab.evaluate(findCornerIssues);
        assert.equal(broken.length, 1);
        assert.match(broken[0]!.element, /span in button\.btn/);
        assert.match(broken[0]!.detail, /0px, expected 5px/);
      }
    } finally {
      await browser.close();
    }
  }
});

test("corners-nest attributes transparent clipping ancestors", async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 400 } });
    try {
      for (const options of [{}, { own: 8 }, { own: 5, ownRound: true }, { clip: 12, empty: true }]) {
        await tab.setContent(await transparentClip(options));
        assert.deepEqual(await tab.evaluate(findCornerIssues), [], `${engine.name()}: ${JSON.stringify(options)}`);
      }
    } finally {
      await browser.close();
    }
  }
});

test("corners-nest preserves visible curves through transparent clips", async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 400 } });
    try {
      for (const [options, detail] of [
        [{ clip: 12 }, /12px, expected 24px/],
        [{ clipRound: true }, /both corners must be squircles/],
        [{ own: 32 }, /32px, expected 24px/],
        [{ own: 24, ownRound: true }, /both corners must be squircles/],
        [{ own: 14, ownRound: true }, /incompatible clipping curves/],
      ] as const) {
        await tab.setContent(await transparentClip(options));
        const found = await tab.evaluate(findCornerIssues);
        assert.equal(found.length, 1, `${engine.name()}: ${JSON.stringify(options)}`);
        assert.match(found[0]!.element, /tile.*outer/);
        assert.match(found[0]!.detail, detail);
      }
    } finally {
      await browser.close();
    }
  }
});

test("corners-nest keeps transparent fallback shadow envelopes as anchors", async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 400 } });
    try {
      await tab.setContent(await transparentClip());
      const envelope = await tab.locator(".outer").evaluate((el) => {
        const s = getComputedStyle(el);
        return { clip: s.clipPath, radius: parseFloat(s.borderTopLeftRadius) };
      });
      assert.equal(envelope.clip, "none");
      assert.ok(Math.abs(envelope.radius - 32 * .543) < .01);
      assert.deepEqual(await tab.evaluate(findCornerIssues), []);
      await tab.setContent(await transparentClip({ clip: 12 }));
      const wrong = await tab.evaluate(findCornerIssues);
      assert.equal(wrong.length, 1);
      assert.match(wrong[0]!.element, /tile.*outer/);
      assert.match(wrong[0]!.detail, /12px, expected 24px/);
      await tab.setContent(await transparentClip());
      await tab.locator(".outer").evaluate((el) => { el.style.borderRadius = "32px"; });
      assert.match((await tab.evaluate(findCornerIssues))[0]!.detail, /both corners must be squircles/);
      await tab.setContent(await transparentClip());
      await tab.locator(".outer").evaluate((el) => { el.style.background = "#778899"; });
      assert.match((await tab.evaluate(findCornerIssues))[0]!.detail, /both corners must be squircles/);
    } finally {
      await browser.close();
    }
  }
});

test("corners-nest does not mistake an inherited radius for a clipped square", async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 400 } });
    try {
      await tab.setContent(`<style>
        body { margin: 0; background: white; }
        .outer { position:absolute; left:40px; top:40px; width:200px; height:160px; background:#ddd;
          border-radius:17.376px; clip-path:path("${contour(200, 160, 32)}");
          --sq-tl:32px; --sq-tr:32px; --sq-br:32px; --sq-bl:32px; }
        .wrapper { position:absolute; left:8px; top:8px; width:100px; height:100px;
          --sq-tl:24px; --sq-tr:24px; --sq-br:24px; --sq-bl:24px; }
        .inner { position:absolute; inset:0; background:#557799; clip-path:inset(0); }
      </style><div class="outer"><div class="wrapper"><div class="inner"></div></div></div>`);
      const wrapperStyle = await tab.locator(".wrapper").getAttribute("style");
      const issue = (await tab.evaluate(findCornerIssues))[0];
      assert.match(issue?.detail ?? "", /0px, expected 24px/, engine.name());
      assert.match(issue?.detail ?? "", /both corners must be squircles/);
      assert.equal(await tab.locator(".wrapper").getAttribute("style"), wrapperStyle);
      await tab.locator(".inner").evaluate((el, path) => {
        el.style.borderRadius = "13.032px";
        el.style.clipPath = `path("${path}")`;
        for (const corner of ["tl", "tr", "br", "bl"]) el.style.setProperty(`--sq-${corner}`, "24px");
      }, contour(100, 100, 24));
      assert.deepEqual(await tab.evaluate(findCornerIssues), [], `${engine.name()}: explicitly declared matching tokens`);
    } finally {
      await browser.close();
    }
  }
});

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

test("corners-nest accepts the rounded surface in the nested-frame pass fixture", async () => {
  const fixture = readFileSync(join(fixtures, "nested-frame-pass.html"), "utf8");
  const report = await scan("nested-frame-corners", fixture);
  assert.deepEqual(report.findings.filter((finding) => finding.rule === "corners-nest"), []);
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
  const asymmetric = page(`<h1>Projects</h1><div id="window-panel" class="window-panel">Notes</div>`, `<style>${css} .window-panel { border-radius: 8px 8px 28px 28px; }</style>`);
  const offsetWindow = await scan("window-offset", asymmetric, { windowRadius: 32, windowBounds: { x: 0, y: -40, width: 390, height: 884 } });
  assert.deepEqual(offsetWindow.findings.filter((finding) => finding.rule === "corners-nest"), []);
  const insetWindow = await scan("window-insets", asymmetric, { windowRadius: 32, windowInsets: { top: 40, right: 0, bottom: 0, left: 0 } });
  assert.deepEqual(insetWindow.findings.filter((finding) => finding.rule === "corners-nest"), []);
});

test("corners-nest uses native window bounds relative to the viewport", async () => {
  const css = await styles(`
    body { margin: 0; background: white; }
    .panel { position: fixed; inset: 8px; border-radius: 12px 12px 40px 40px; background: #557799; }
  `);
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
    try {
      await tab.setContent(`<style>${css}</style><div class="panel"></div>`);
      const bounds = { x: 0, y: -52, width: 390, height: 352 };
      const viewport = await tab.evaluate(findCornerIssues, { windowRadius: 48 });
      assert.match(viewport[0]!.detail, /top left/, `${engine.name()}: a viewport edge alone invents top corners`);
      assert.deepEqual(await tab.evaluate(findCornerIssues, { windowRadius: 48, windowBounds: bounds }), [], `${engine.name()}: the native top is outside the viewport`);
      await assert.rejects(tab.evaluate(findCornerIssues, { windowRadius: 48, windowBounds: { ...bounds, width: 300 } }), /native window bounds must contain the viewport/);
      await tab.locator(".panel").evaluate((el) => { el.style.borderBottomRightRadius = "12px"; });
      const bottom = await tab.evaluate(findCornerIssues, { windowRadius: 48, windowBounds: bounds });
      assert.equal(bottom.length, 1);
      assert.match(bottom[0]!.detail, /bottom right/);
      assert.doesNotMatch(bottom[0]!.detail, /top/);
      await tab.locator(".panel").evaluate((el) => {
        el.style.borderBottomRightRadius = "40px";
        el.style.borderBottomLeftRadius = "12px";
      });
      assert.deepEqual(await tab.evaluate(findCornerIssues, { windowRadius: 48, windowBounds: { x: -52, y: -52, width: 442, height: 352 } }), [], `${engine.name()}: the native left is outside the viewport`);
      await tab.setContent('<style>html, body { margin: 0; width: 100%; height: 100%; box-sizing: border-box; } body { background: white; }</style>');
      assert.deepEqual(await tab.evaluate(findCornerIssues, { windowRadius: 48 }), [], `${engine.name()}: the native window clips a full-bleed background`);
      await tab.locator("body").evaluate((el) => { el.style.border = "2px solid #557799"; });
      assert.match((await tab.evaluate(findCornerIssues, { windowRadius: 48 }))[0]!.detail, /bottom right/, `${engine.name()}: a full-bleed square border still shows`);
      await tab.locator("body").evaluate((el) => { el.style.background = "transparent"; el.style.border = "0"; });
      await tab.locator("html").evaluate((el) => { el.style.background = "white"; el.style.border = "2px solid #557799"; });
      assert.match((await tab.evaluate(findCornerIssues, { windowRadius: 48 }))[0]!.element, /^html/, `${engine.name()}: the document root is a painted surface too`);
    } finally {
      await browser.close();
    }
  }
});

test("corners-nest resolves native window insets at each viewport size", async () => {
  const css = await styles(`
    body { margin: 0; background: white; }
    .panel { position: fixed; inset: 8px; border-radius: 12px 12px 40px 40px; background: #557799; }
  `);
  const browser = await chromium.launch({ headless: true });
  const tab = await browser.newPage();
  try {
    for (const [width, height] of [[390, 300], [1440, 900]] as const) {
      await tab.setViewportSize({ width, height });
      await tab.setContent(`<style>${css}</style><div class="panel"></div>`);
      const options = { windowRadius: 48, windowInsets: { top: 52, right: 0, bottom: 0, left: 0 } };
      assert.deepEqual(await tab.evaluate(findCornerIssues, options), [], `${width}x${height}`);
      await tab.locator(".panel").evaluate((el) => { el.style.borderBottomRightRadius = "12px"; });
      assert.match((await tab.evaluate(findCornerIssues, options))[0]!.detail, /bottom right/);
      const insets = { top: 13, right: 7, bottom: 5, left: 3 };
      const windowBounds = { x: -insets.left, y: -insets.top, width: width + insets.left + insets.right, height: height + insets.top + insets.bottom };
      const insetIssues = await tab.evaluate(findCornerIssues, { windowRadius: 48, windowInsets: insets });
      const boundIssues = await tab.evaluate(findCornerIssues, { windowRadius: 48, windowBounds });
      assert.ok(insetIssues.length > 0);
      assert.deepEqual(insetIssues.map(({ element, detail }) => ({ element, detail })), boundIssues.map(({ element, detail }) => ({ element, detail })));
    }
  } finally {
    await browser.close();
  }
});

test("corners-nest reads a root corner painted by an inverse squircle cutout", async () => {
  const hole = (radius: number, round = false) => {
    const r = radius;
    const w = 374;
    const h = 284;
    const edge = round
      ? `M 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} Z`
      : contour(w, h, r);
    return `path(evenodd, "M 0 0 H ${w} V ${h} H 0 Z ${edge}")`;
  };
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
    await bindCapture(tab);
    try {
      await tab.setContent(`<style>
        body { margin: 0; background: white; }
        .panel { position: fixed; inset: 8px; background: #557799; }
        .cutout { position: absolute; inset: 0; background: white; pointer-events: none; --sq-tl: 40px; --sq-tr: 40px; --sq-br: 40px; --sq-bl: 40px; }
      </style><main class="panel"><div class="cutout" aria-hidden="true"></div></main>`);
      const bounds = { x: 0, y: -52, width: 390, height: 352 };
      await tab.locator(".cutout").evaluate((el, path) => { el.style.clipPath = path; }, hole(40));
      const before = await tab.locator(".panel, .cutout").evaluateAll((els) => els.map((el) => el.getAttribute("style")));
      assert.deepEqual(await tab.evaluate(findCornerIssues, { windowRadius: 48, windowBounds: bounds }), [], `${engine.name()}: the cutout supplies the visible corners`);
      assert.deepEqual(await tab.locator(".panel, .cutout").evaluateAll((els) => els.map((el) => el.getAttribute("style"))), before);
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], `${engine.name()}: an inverse layer is not itself a rounded surface`);
      for (const radius of [32, 36, 44]) {
        await tab.locator(".cutout").evaluate((el, path) => { el.style.clipPath = path; }, hole(radius));
        assert.notDeepEqual(await tab.evaluate(findCornerIssues, { windowRadius: 48, windowBounds: bounds }), [], `${engine.name()}: a ${radius}px cutout cannot claim to be 40px`);
      }
      await tab.locator(".cutout").evaluate((el, path) => { el.style.clipPath = path; }, hole(40));
      await tab.locator(".panel").evaluate((el) => {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "position:absolute;inset:0";
        el.prepend(wrapper);
      });
      assert.deepEqual(await tab.evaluate(findCornerIssues, { windowRadius: 48, windowBounds: bounds }), [], `${engine.name()}: a transparent wrapper does not hide the cutout`);
      await tab.locator(".cutout").evaluate((el, path) => {
        el.style.clipPath = path;
        for (const corner of ["tl", "tr", "br", "bl"]) el.style.setProperty(`--sq-${corner}`, "12px");
      }, hole(12));
      const mismatch = await tab.evaluate(findCornerIssues, { windowRadius: 48, windowBounds: bounds });
      assert.ok(mismatch.some((issue) => /bottom right/.test(issue.detail)), `${engine.name()}: a smaller cutout does not nest`);
      await tab.locator(".cutout").evaluate((el, path) => {
        el.style.clipPath = path;
        for (const corner of ["tl", "tr", "br", "bl"]) el.style.setProperty(`--sq-${corner}`, "40px");
      }, hole(40, true));
      assert.notDeepEqual(await tab.evaluate(findCornerIssues, { windowRadius: 48, windowBounds: bounds }), [], `${engine.name()}: a circular cutout is not a squircle`);
      await tab.locator(".cutout").evaluate((el, path) => {
        el.style.clipPath = path;
        el.style.background = "transparent";
      }, hole(40));
      assert.notDeepEqual(await tab.evaluate(findCornerIssues, { windowRadius: 48, windowBounds: bounds }), [], `${engine.name()}: a transparent cutout does not cover the square`);
      await tab.locator(".cutout").evaluate((el) => { el.style.background = "#557799"; });
      assert.notDeepEqual(await tab.evaluate(findCornerIssues, { windowRadius: 48, windowBounds: bounds }), [], `${engine.name()}: a cutout the same color as the panel does not cover the square`);
    } finally {
      await browser.close();
    }
  }
});

test("corners-nest reports when cross-origin image pixels cannot be inspected", async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
    try {
      const image = await tab.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 40;
        const pen = canvas.getContext("2d")!;
        pen.fillStyle = "#789";
        pen.fillRect(0, 0, 40, 40);
        return canvas.toDataURL().split(",")[1]!;
      });
      await tab.route("https://images.invalid/picture.png", (route) => route.fulfill({
        status: 200, contentType: "image/png", body: Buffer.from(image, "base64"),
      }));
      await tab.setContent(`<div style="position:relative;width:160px;height:120px;background:#345;border-radius:24px;corner-shape:squircle">
        <img alt="" src="https://images.invalid/picture.png" style="position:absolute;inset:4px;width:152px;height:112px">
      </div>`);
      await tab.locator("img").evaluate((el) => el.decode());
      assert.match((await tab.evaluate(findCornerIssues))[0]!.detail, /cannot inspect.*CORS/);
      await tab.locator("img").evaluate((el) => { el.style.objectFit = "contain"; });
      assert.deepEqual(await tab.evaluate(findCornerIssues), [], `${engine.name()}: letterboxing does not need image pixels`);
      await tab.locator("img").evaluate((el) => { el.style.border = "1px solid red"; });
      assert.match((await tab.evaluate(findCornerIssues))[0]!.detail, /expected 20px/);
    } finally {
      await browser.close();
    }
  }
});

test("squircle-paint finds a descendant's square fill beyond a squircle, but passes the clipped surface", async () => {
  const css = await styles(`
    body { background: linear-gradient(110deg, #f8f3e7, #dce8f4); }
    .surface { position: relative; width: 220px; height: 140px; border-radius: 32px; background: #557799; }
    .broken { clip-path: none !important; }
    .square-clip { clip-path: inset(0) !important; }
    .sound { overflow: hidden; }
    .fill { position: absolute; inset: 0; background: #cc6655; }
  `);
  const fixture = (broken: boolean) => page(
    `<h1>Projects</h1><div id="surface" class="surface${broken ? " broken" : " sound"}"><div class="fill"></div></div>`,
    `<style>${css}</style>`,
  );
  const leaked = (await scan("paint-broken", fixture(true))).findings.filter((finding) => finding.rule === "squircle-paint");
  assert.equal(leaked.length, 1);
  assert.match(leaked[0]!.element, /#surface/);
  assert.match(leaked[0]!.detail, /corner/i);
  const clipped = (await scan("paint-clipped", fixture(false))).findings.filter((finding) => finding.rule === "squircle-paint");
  assert.deepEqual(clipped, []);
});

test("corners-nest reads all four corners, geometric siblings, clipping, and both squircle shapes", async () => {
  const css = await styles(`
    body { margin: 0; background: white; }
    .area { position: relative; width: 240px; height: 180px; }
    .shell { position: absolute; inset: 0; overflow: hidden; border-radius: 32px; background: #dce5ef; }
    .panel { position: absolute; inset: 4px; border-radius: 28px; background: #557799; }
    .paint { position: absolute; inset: 0; background: #557799; }
    .round { corner-shape: round !important; }
  `);
  const browser = await chromium.launch({ headless: true });
  const tab = await browser.newPage({ viewport: { width: 390, height: 400 } });
  try {
    for (const [property, name] of [
      ["border-top-left-radius", "top left"],
      ["border-top-right-radius", "top right"],
      ["border-bottom-right-radius", "bottom right"],
      ["border-bottom-left-radius", "bottom left"],
    ]) {
      await tab.setContent(`<style>${css}</style><div class="area"><div id="shell" class="shell"></div><div id="panel" class="panel" style="${property}:8px"></div></div>`);
      const found = await tab.evaluate(findCornerIssues, {});
      assert.equal(found.length, 1, name);
      assert.match(found[0]!.element, /#panel.*#shell/);
      assert.match(found[0]!.detail, new RegExp(name));
    }
    await tab.setContent(`<style>${css}</style><div class="area"><div id="shell" class="shell"></div><div id="panel" class="panel round"></div></div>`);
    const round = await tab.evaluate(findCornerIssues, {});
    assert.equal(round.length, 1);
    assert.match(round[0]!.detail, /both corners must be squircles/);
    await tab.setContent(`<style>${css}</style><div class="area"><div id="shell" class="shell"></div><div id="panel" class="panel"></div></div>`);
    assert.deepEqual(await tab.evaluate(findCornerIssues, {}), []);
    await tab.setContent(`<style>${css}</style><div class="area"><div id="shell" class="shell"></div><div id="panel" class="panel" style="border-radius:0;border:1px solid #224466"></div></div>`);
    const square = await tab.evaluate(findCornerIssues, {});
    assert.equal(square.length, 1, "a square bordered card near a pane's corners");
    assert.match(square[0]!.detail, /0px, expected 28px/);
    await tab.setContent(`<style>${css}</style><div class="area"><div id="shell" class="shell"><div class="paint"></div></div></div>`);
    assert.deepEqual(await tab.evaluate(findCornerIssues, {}), [], "a fill clipped to the outer surface is not a second corner");
    await tab.setContent(`<style>${css} body { position: fixed; inset: 4px; border-radius: 8px; background: #557799; corner-shape: squircle; }</style><body></body>`);
    const root = await tab.evaluate(findCornerIssues, { windowRadius: 32 });
    assert.equal(root.length, 1, "the native window also judges a rounded body");
    assert.match(root[0]!.element, /body.*native window/);
  } finally {
    await browser.close();
  }
});

async function bindCapture(tab: Page) {
  await tab.exposeBinding("__ouroPaintCapture", async ({ page: current }, clip: PaintClip) =>
    (await current.screenshot({ clip, scale: "device", animations: "disabled", caret: "initial" })).toString("base64"),
  );
}

test("squircle-paint measures fills, borders, outlines, shadows and pseudo-elements on the actual background", async () => {
  const css = await styles(`
    body { margin: 0; background: linear-gradient(110deg, #f8f3e7, #dce8f4); }
    .surface { position: absolute; left: 60px; top: 60px; width: 200px; height: 140px; border-radius: 32px; background: #557799; }
    .layer { position: absolute; inset: 0; }
    .fill .layer { background: #cc6655; }
    .border .layer { border: 6px solid #cc6655; }
    .outline .layer { outline: 6px solid #cc6655; }
    .shadow .layer { box-shadow: 0 0 0 6px #cc6655; }
    .pseudo::before { content: ""; position: absolute; inset: 0; background: #cc6655; }
    .clipped { overflow: hidden; }
    .soft { box-shadow: 0 5px 16px #18202980; outline: 3px solid #182029; }
  `);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 300 }, deviceScaleFactor: 2 });
  const tab = await context.newPage();
  await bindCapture(tab);
  try {
    for (const name of ["fill", "border", "outline", "shadow", "pseudo"]) {
      await tab.setContent(`<style>${css}</style><div id="surface" class="surface ${name}" style="color: navy"><div class="layer"></div></div>`);
      const before = await tab.locator("#surface").getAttribute("style");
      const found = await tab.evaluate(findSquirclePaint);
      assert.deepEqual(found.map((issue) => issue.rule), ["squircle-paint"], name);
      assert.equal(await tab.locator("#surface").getAttribute("style"), before, `${name}: restores inline styles`);
    }
    for (const name of ["clipped fill", "soft", ""]) {
      await tab.setContent(`<style>${css}</style><div id="surface" class="surface ${name}"><div class="layer"></div></div>`);
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], name || "plain squircle");
      assert.equal(await tab.locator("#surface").getAttribute("style"), null, `${name}: removes temporary styles`);
    }
    await tab.setContent(`<style>${css}</style><div id="surface" class="surface fill"><div class="layer"></div></div><div style="position:absolute;inset:0;background:#eee"></div>`);
    assert.deepEqual(await tab.evaluate(findSquirclePaint), [], "a fully obscured surface");
  } finally {
    await browser.close();
  }
});

test("squircle-paint passes a clipped surface at fractional layout coordinates", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const tab = await context.newPage();
  await bindCapture(tab);
  try {
    await tab.setContent(readFileSync(join(fixtures, "squircle-paint-pass.html"), "utf8"));
    assert.deepEqual(await tab.evaluate(findSquirclePaint), []);
  } finally {
    await browser.close();
  }
});

test("squircle-paint does not treat an inherited fallback token as a square child's corner", async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
    await bindCapture(tab);
    try {
      await tab.setContent(`<style>
        body { margin: 0; background: #eee; }
        .outer { position: absolute; left: 40px; top: 40px; width: 300px; height: 200px; background: white;
          border-radius: 30px; clip-path: inset(0 round 30px);
          --sq-tl: 30px; --sq-tr: 30px; --sq-br: 30px; --sq-bl: 30px; }
        .child { position: absolute; left: 50px; top: 50px; width: 100px; height: 100px; background: #557799; }
      </style><div class="outer"><div class="child"></div></div>`);
      assert.equal(await tab.locator(".child").evaluate((el) => getComputedStyle(el).getPropertyValue("--sq-tl").trim()), "30px");
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], engine.name());
      await tab.locator(".child").evaluate((el) => {
        el.style.borderRadius = "16.29px";
        for (const corner of ["tl", "tr", "br", "bl"]) el.style.setProperty(`--sq-${corner}`, "30px");
        el.insertAdjacentHTML("beforeend", '<div style="position:absolute;inset:0;background:#b44939"></div>');
      });
      assert.equal((await tab.evaluate(findSquirclePaint)).length, 1, `${engine.name()}: an explicit token equal to its parent's still detects square paint`);
      assert.equal(await tab.locator(".outer").getAttribute("style"), null, `${engine.name()}: restores the parent's inline style`);
    } finally {
      await browser.close();
    }
  }
});

test("squircle-paint treats wrapped inline fragments as separate painted boxes", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const tab = await context.newPage();
  await bindCapture(tab);
  try {
    await tab.setContent(`<style>
      body { margin: 0; background: white; }
      .line { position: absolute; left: 424px; top: 1202.453125px; width: 723px; font: 16px/21px sans-serif; }
      .prefix { display: inline-block; width: 613.75px; }
      a { color: #1d1d1f; text-decoration: underline; text-decoration-color: #1d1d1f66; text-decoration-thickness: 1px; text-underline-offset: 4px; }
      code { font: 14px/20px monospace; background: #f5f5f7; border-radius: 4.806px; corner-shape: squircle; padding: 0.1em 0.3em; overflow-wrap: break-word; }
    </style><div class="line"><span class="prefix"></span><a href="#example"><code><span>example/</span><span>parts/<wbr></span><span>documents/<wbr></span><span>AnotherInput.tsx</span></code></a></div>`);
    const rects = await tab.locator("code").evaluate((el) => [...el.getClientRects()].map((rect) => rect.toJSON()));
    assert.equal(rects.length, 2);
    assert.ok(rects[0]!.left > rects[1]!.left);
    assert.deepEqual(await tab.evaluate(findSquirclePaint), []);
    await tab.locator("code").evaluate((el) => {
      const line = el.closest(".line")!.getBoundingClientRect();
      const fragment = el.getClientRects()[1]!;
      el.insertAdjacentHTML("beforeend", `<span class="probe" style="position:absolute;left:${fragment.left - line.left}px;top:${fragment.bottom - line.top - 4}px;width:4px;height:4px;background:#b44939"></span>`);
    });
    assert.deepEqual(await tab.evaluate(findSquirclePaint), [], "the continuation's flat edge is not a squircle corner");
    await tab.locator("code").evaluate((el) => {
      const line = el.closest(".line")!.getBoundingClientRect();
      const fragment = el.getClientRects()[0]!;
      const probe = el.querySelector<HTMLElement>(".probe")!;
      probe.style.left = `${fragment.left - line.left}px`;
      probe.style.top = `${fragment.top - line.top}px`;
    });
    assert.equal((await tab.evaluate(findSquirclePaint)).length, 1, "the first fragment's curved start still catches paint");
  } finally {
    await browser.close();
  }
});

test("squircle-paint separates distant fractional inline fragments and still finds a leaking end", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 300 }, deviceScaleFactor: 2 });
  const tab = await context.newPage();
  await bindCapture(tab);
  try {
    await tab.setContent(`<style>
      body { margin: 0; background: #fffaf7; }
      .line { position: absolute; left: 16px; top: 100.609375px; width: 350px; font: 16px/21px sans-serif; }
      .prefix { display: inline-block; width: 301.375px; }
      code { font: 14px/20px monospace; background: #f5f5f7; border-radius: 4.806px; corner-shape: squircle; padding: 0.1em 0.3em; }
    </style><div class="line"><span class="prefix"></span><code>alpha beta</code></div>`);
    const rects = await tab.locator("code").evaluate((el) => [...el.getClientRects()].map((rect) => rect.toJSON()));
    assert.equal(rects.length, 2);
    assert.ok(rects[0]!.left - rects[1]!.right > 200);
    assert.deepEqual(await tab.evaluate(findSquirclePaint), []);
    await tab.locator("code").evaluate((el) => {
      const line = el.closest(".line")!.getBoundingClientRect();
      const fragment = el.getClientRects()[0]!;
      el.insertAdjacentHTML("beforeend", `<span style="position:absolute;left:${fragment.left - line.left}px;top:${fragment.top - line.top}px;width:5px;height:5px;background:#b44939"></span>`);
    });
    assert.equal((await tab.evaluate(findSquirclePaint)).length, 1);
  } finally {
    await browser.close();
  }
});

test("squircle-paint does not hide a neighbor in a wrapped inline's bounding gap", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 300 }, deviceScaleFactor: 2 });
  const tab = await context.newPage();
  await bindCapture(tab);
  try {
    await tab.setContent(`<style>
      body { margin: 0; background: #fffaf7; }
      .line { position: absolute; left: 16px; top: 100.609375px; width: 350px; font: 16px/21px sans-serif; }
      .neighbor { position: absolute; left: 0; top: 0; width: 30px; height: 18px; background: #b44939; }
      .prefix { display: inline-block; width: 39px; }
      code { font: 14px/20px monospace; background: #f5f5f7; border-radius: 16px; corner-shape: squircle; padding: 0.1em 0.3em; }
    </style><div class="line"><span class="neighbor"></span><span class="prefix"></span><code>one two three four five six seven eight nine ten eleven twelve</code></div>`);
    const rects = await tab.locator("code").evaluate((el) => [...el.getClientRects()].map((rect) => rect.toJSON()));
    assert.equal(rects.length, 2);
    assert.ok(rects[0]!.left > rects[1]!.left);
    assert.deepEqual(await tab.evaluate(findSquirclePaint), []);
    await tab.locator(".neighbor").evaluate((el) => {
      const line = el.parentElement!.getBoundingClientRect();
      const fragment = el.nextElementSibling!.nextElementSibling!.getClientRects()[0]!;
      el.setAttribute("style", `left:${fragment.left - line.left}px;top:${fragment.top - line.top}px;width:8px;height:8px`);
    });
    assert.equal((await tab.evaluate(findSquirclePaint)).length, 1);
  } finally {
    await browser.close();
  }
});

test("squircle-paint passes adjacent native buttons at a fractional edge", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const tab = await context.newPage();
  await bindCapture(tab);
  try {
    for (const [first, second] of [[125.484375, 116.90625], [129.171875, 99.828125]]) {
      await tab.setContent(`<style>
      body { margin: 0; background: rgb(247,245,240); }
      .row { display: flex; position: absolute; left: 16px; top: 40px; }
      button { position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center;
        box-sizing: border-box; height: 44px; border: 1px solid transparent; border-radius: 6px;
        corner-shape: squircle; background: rgb(11,110,79); color: white; }
      .label { display: inline-flex; isolation: isolate; }
    </style><div class="row"><button style="width:${first}px"><span class="label">First</span></button><button style="width:${second}px"><span class="label">Second</span></button></div>`);
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], `${first}px beside ${second}px`);
    }
  } finally {
    await browser.close();
  }
});

test("squircle-paint finds a two-level difference in a square fill", async () => {
  const browser = await chromium.launch({ headless: true });
  const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
  await bindCapture(tab);
  try {
    await tab.setContent(`<style>
      body { margin: 0; background: white; }
      .surface { position: absolute; left: 60px; top: 60px; width: 200px; height: 140px; background: white; border-radius: 32px; corner-shape: squircle; }
      .fill { position: absolute; inset: 0; background: #fdfdfd; }
    </style><div class="surface"><div class="fill"></div></div>`);
    assert.equal((await tab.evaluate(findSquirclePaint)).length, 1);
  } finally {
    await browser.close();
  }
});

test("squircle-paint detects black paint against a transparent background", async () => {
  const browser = await chromium.launch({ headless: true });
  const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
  await tab.exposeBinding("__ouroPaintCapture", async ({ page: current }, clip: PaintClip) =>
    (await current.screenshot({ clip, scale: "device", animations: "disabled", omitBackground: true })).toString("base64"),
  );
  try {
    await tab.setContent(`<style>
      html, body { margin: 0; background: transparent; }
      .surface { position: absolute; left: 60px; top: 60px; width: 200px; height: 140px; border-radius: 32px; corner-shape: squircle; }
      .fill { position: absolute; inset: 0; background: black; }
    </style><div class="surface"><div class="fill"></div></div>`);
    assert.equal((await tab.evaluate(findSquirclePaint)).length, 1);
  } finally {
    await browser.close();
  }
});

test("squircle-paint ignores a surface fully hidden by an opaque sibling", async () => {
  const browser = await chromium.launch({ headless: true });
  const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
  await bindCapture(tab);
  try {
    for (const [top, pointer] of [[800, "none"], [60, "auto"], [60, "none"]] as const) {
      await tab.setContent(`<style>
        body { margin: 0; min-height: 1200px; background: white; }
        .stage { position: absolute; left: 60px; top: ${top}px; width: 200px; height: 140px; }
        .surface, .cover { position: absolute; inset: 0; }
        .surface { background: white; border-radius: 32px; corner-shape: squircle; }
        .fill { position: absolute; inset: 0; background: #d11; }
        .cover { background: #eee; pointer-events: ${pointer}; }
      </style><div class="stage"><div class="surface"><div class="fill"></div></div><div class="cover"></div></div>`);
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], `${top}px, pointer-events ${pointer}`);
      assert.equal(await tab.locator(".surface").getAttribute("style"), null);
      assert.equal(await tab.locator(".cover").getAttribute("style"), null);
    }
  } finally {
    await browser.close();
  }
});

test("squircle-paint finds a square sibling exposed when the fallback clips a corner-covering shadow", async () => {
  const generated = await styles(`
    body { margin: 0; background: #edf2f6; }
    .stage { position: absolute; left: 60px; top: 60px; width: 200px; height: 140px; }
    .stage.sound { overflow: hidden; border-radius: 20px; }
    .content { position: absolute; inset: 0; background: #b44939; }
    .overlay { position: absolute; inset: 0; border-radius: 20px; box-shadow: 0 0 0 6px #edf2f6; }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-check-native-shape: squircle)");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 300 }, deviceScaleFactor: 2 });
  const tab = await context.newPage();
  await bindCapture(tab);
  try {
    for (const sound of [false, true]) {
      await tab.setContent(`<style>${css}</style><div class="stage${sound ? " sound" : ""}"><div class="content"></div><div class="overlay"></div></div>`);
      const style = await tab.locator(".overlay").evaluate((el) => ({ radius: getComputedStyle(el).getPropertyValue("--sq-tl").trim(), clip: getComputedStyle(el).clipPath }));
      assert.equal(style.radius, "20px");
      assert.notEqual(style.clip, "none");
      const found = await tab.evaluate(findSquirclePaint);
      assert.equal(found.length, sound ? 0 : 1, sound ? "the stage clips the square fill" : "the square fill is exposed");
    }
  } finally {
    await browser.close();
  }
});

test("squircle-paint finds a surface's own square paint outside its fallback corners", async () => {
  const generated = await styles(`
    body { margin: 0; background: white; }
    .surface { position: absolute; left: 60px; top: 60px; width: 200px; height: 140px; border-radius: 32px; box-shadow: 0 0 0 6px #b44939; }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-check-native-shape: squircle)");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
    await bindCapture(tab);
    try {
      await tab.setContent(`<style>${css}</style><div class="surface"></div>`);
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], `${engine.name()}: a curved shadow`);
      for (const paint of [
        "background:#b44939",
        "border:6px solid #b44939",
        "outline:6px solid #b44939",
        "outline:2px solid #b44939;outline-offset:6px",
        "box-shadow:0 0 0 6px #b44939",
      ]) {
        await tab.locator(".surface").evaluate((el, value) => { el.style.cssText = `border-radius:0;clip-path:none;box-shadow:none;${value}`; }, paint);
        assert.equal((await tab.evaluate(findSquirclePaint)).length, 1, `${engine.name()}: ${paint}`);
      }
    } finally {
      await browser.close();
    }
  }
});

test("squircle-paint checks coincident rounded siblings without treating their shadows as square paint", async () => {
  const generated = await styles(`
    body { margin: 0; background: #dce5ef; }
    .stage { position: absolute; left: 60px; top: 60px; width: 200px; height: 140px; }
    .surface { position: absolute; inset: 0; border-radius: 32px; }
    .raised { background: white; box-shadow: 0 4px 12px #0008; }
    .narrow { border-radius: 8px; }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-check-native-shape: squircle)");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
    await bindCapture(tab);
    try {
      await tab.setContent(`<style>${css}</style><div class="stage"><div class="surface raised"></div><div class="surface"></div></div>`);
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], `${engine.name()}: a separate curved shadow`);
      await tab.locator(".raised").evaluate((el) => {
        el.innerHTML = '<div style="position:absolute;left:-12px;top:-12px;width:8px;height:8px;background:#b44939"></div>';
      });
      assert.ok((await tab.evaluate(findSquirclePaint)).some((issue) => issue.element.includes(".raised")), `${engine.name()}: the raised surface still has a leaking child`);
      await tab.locator(".raised").evaluate((el) => {
        el.replaceChildren();
        el.classList.add("narrow");
      });
      assert.ok((await tab.evaluate(findSquirclePaint)).some((issue) => issue.element === "div.surface"), `${engine.name()}: a mismatched coincident surface protrudes`);
    } finally {
      await browser.close();
    }
  }
});

test("squircle-paint attributes a distant shadow separately from an overlapping overlay", async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
    await bindCapture(tab);
    try {
      await tab.setContent(`<style>
        body { margin: 0; background: #e8edf2; }
        .surface { position: absolute; left: 60px; top: 100px; width: 300px; height: 44px;
          background: #cdd7df; border-radius: 9.774px;
          --sq-tl: 18px; --sq-tr: 18px; --sq-br: 18px; --sq-bl: 18px;
          clip-path: path("M -500 -500 H 800 V 500 H -500 Z M 0 0 V 44 H 300 V 0 Z ${contour(300, 44, 18)}"); }
        .selected { position: absolute; left: 110px; top: 2px; width: 90px; height: 40px;
          background: white; box-shadow: 0 1px 3px #0008; }
        .overlay { position: absolute; left: 60px; top: 90px; width: 50px; height: 14px;
          z-index: 1; background: #1d1d1f; }
        .stage:has(.surface[style*="clip-path"]) + .overlay, .stage:has(.surface[data-ouro-paint-solo]) + .overlay { background: #2e2e30; }
        .stage:has(.surface[style*="opacity: 0"]) + .overlay { background: #272729; }
      </style><div class="stage"><div class="surface"><div class="selected"></div></div></div><div class="overlay"></div>`);
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], `${engine.name()}: an unrelated overlay is not the distant shadow`);
      await tab.locator(".surface").evaluate((el) => {
        el.insertAdjacentHTML("beforeend", '<div style="position:absolute;left:0;bottom:-6px;width:10px;height:10px;background:#b44939"></div>');
      });
      assert.equal((await tab.evaluate(findSquirclePaint)).length, 1, `${engine.name()}: a nearby leaking layer is still found`);
    } finally {
      await browser.close();
    }
  }
});

test("squircle-paint finds a leaking child under a strict content policy", async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
    await bindCapture(tab);
    try {
      await tab.setContent(`<meta http-equiv="Content-Security-Policy" content="style-src 'self'; img-src 'self'"><div class="surface"><div class="leak"></div></div>`);
      await tab.evaluate(() => {
        const surface = document.querySelector<HTMLElement>(".surface")!;
        const leak = document.querySelector<HTMLElement>(".leak")!;
        for (const [property, value] of Object.entries({
          position: "absolute", left: "60px", top: "60px", width: "200px", height: "140px",
          "border-radius": "32px", "corner-shape": "squircle", background: "#dce5ef",
        })) surface.style.setProperty(property, value);
        for (const [property, value] of Object.entries({
          position: "absolute", left: "0", top: "0", width: "24px", height: "24px", background: "#b44939",
        })) leak.style.setProperty(property, value);
      });
      const before = await tab.locator(".surface").getAttribute("style");
      assert.equal((await tab.evaluate(findSquirclePaint)).length, 1, `${engine.name()}: a visible square child`);
      assert.equal(await tab.locator(".surface").getAttribute("style"), before);
      await tab.locator(".surface").evaluate((el) => { el.style.setProperty("overflow", "hidden"); });
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], `${engine.name()}: the child is clipped`);
    } finally {
      await browser.close();
    }
  }
});

test("squircle-paint checks a separate SVG outline over a rounded surface", async () => {
  const generated = await styles(`
    body { margin: 0; background: #dce5ef; }
    .surface { position: absolute; left: 60px; top: 60px; width: 200px; height: 140px; background: white; border-radius: 32px; }
    .layer { position: fixed; inset: 0; pointer-events: none; }
    svg { position: absolute; left: 60px; top: 60px; width: 200px; height: 140px; overflow: visible; }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-check-native-shape: squircle)");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
    await bindCapture(tab);
    try {
      await tab.setContent(`<style>${css}</style><div class="surface"></div><div class="layer" data-ouro="inspector"><svg viewBox="0 0 200 140"><path d="${contour(200, 140, 32)}" fill="none" stroke="#b44939" stroke-width="2"></path></svg></div>`);
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], `${engine.name()}: a curved outline follows the surface`);
      await tab.locator("path").evaluate((path) => { path.setAttribute("stroke-width", "6"); });
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], `${engine.name()}: a thicker curved outline still follows the surface`);
      await tab.locator(".surface").evaluate((el) => { el.innerHTML = '<div style="position:absolute;left:-12px;top:-12px;width:8px;height:8px;background:#b44939"></div>'; });
      assert.equal((await tab.evaluate(findSquirclePaint)).length, 1, `${engine.name()}: the curved outline does not hide a leaking child`);
      await tab.locator(".surface").evaluate((el) => { el.replaceChildren(); });
      await tab.locator("svg").evaluate((svg) => { svg.insertAdjacentHTML("beforeend", '<rect x="0" y="0" width="12" height="12" fill="#b44939"></rect>'); });
      assert.equal((await tab.evaluate(findSquirclePaint)).length, 1, `${engine.name()}: a square SVG fill is still checked`);
      await tab.locator("rect").evaluate((rect) => rect.remove());
      await tab.locator("path").evaluate((path) => { path.setAttribute("d", "M 1 1 H 199 V 139 H 1 Z"); });
      assert.ok((await tab.evaluate(findSquirclePaint)).some((issue) => issue.element === "div.surface"), `${engine.name()}: a square outline crosses the curve`);
      await tab.locator("svg").evaluate((svg) => { svg.style.left = "300px"; });
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], `${engine.name()}: an unrelated outline is not attributed to the surface`);
      await tab.locator(".surface").evaluate((el) => { el.style.transform = "scale(.8)"; el.style.transformOrigin = "top left"; });
      await tab.locator("svg").evaluate((svg) => { svg.style.cssText = "left:60px;top:60px;width:160px;height:112px"; });
      assert.equal((await tab.evaluate(findSquirclePaint)).length, 1, `${engine.name()}: a square outline is checked on a scaled surface`);
      await tab.locator("path").evaluate((path, d) => { path.setAttribute("d", d); }, contour(200, 140, 32));
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], `${engine.name()}: a curved outline follows a scaled surface`);
    } finally {
      await browser.close();
    }
  }
});

test("squircle-paint finds a sibling control protruding from a rounded pane's corner", async () => {
  const browser = await chromium.launch({ headless: true });
  const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
  await bindCapture(tab);
  try {
    for (const leaking of [false, true]) {
      await tab.setContent(`<style>
        body { margin: 0; background: white; }
        .stage { position: absolute; left: 60px; top: 60px; width: 200px; height: 140px; }
        .surface { position: absolute; inset: 0; border-radius: 32px; corner-shape: squircle; background: #dce5ef; }
        .control { position: absolute; width: 24px; height: 24px; background: #b44939; box-shadow: 0 0 4px #b44939; }
      </style><div class="stage"><div class="surface"></div><div class="control" style="${leaking ? "top:-6px;right:-6px" : "top:24px;right:24px"}"></div></div>`);
      const found = await tab.evaluate(findSquirclePaint);
      assert.equal(found.length, leaking ? 1 : 0, leaking ? "control protrudes" : "control is inset");
    }
  } finally {
    await browser.close();
  }
});

test("squircle-paint checks overlapping rounded surfaces independently", async () => {
  const generated = await styles(`
    body { margin: 0; background: white; }
    .row { position: absolute; left: 60px; top: 60px; display: flex; }
    .surface { position: relative; width: 48px; height: 48px; border-radius: 40%; background: #557799; }
    .surface + .surface { margin-left: -8px; background: #b44939; }
    .leak { position: absolute; inset: 0; background: #4a9; }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-check-native-shape: squircle)");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
    await bindCapture(tab);
    try {
      await tab.setContent(`<style>${css}</style><div class="row"><div class="surface"></div><div class="surface"></div></div>`);
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], engine.name());
      await tab.locator(".surface").last().evaluate((el) => { el.style.clipPath = "none"; el.innerHTML = '<div class="leak"></div>'; });
      assert.equal((await tab.evaluate(findSquirclePaint)).length, 1, `${engine.name()}: a separate surface still catches its own leak`);
    } finally {
      await browser.close();
    }
  }
});

test("squircle-paint distinguishes a round badge in a cut-out from square or unnotched paint", async () => {
  const generated = await styles(`
    body { margin: 0; background: white; }
    .frame { position: absolute; left: 60px; top: 60px; width: 80px; height: 80px; border-radius: 40%; }
    .surface { position: absolute; inset: 0; background: #dce5ef; border-radius: 40%; }
    .cut { --sq-notch: move to calc(100% + 8px) calc(100% - 5px), arc to calc(100% - 18px) calc(100% - 5px) of 13px, arc to calc(100% + 8px) calc(100% - 5px) of 13px, close; }
    .badge { position: absolute; right: -5px; bottom: -5px; width: 20px; height: 20px; border-radius: 50%; corner-shape: round; --corner-shape: round; background: #149b55; }
    .square { border-radius: 0; }
    .leak { position: absolute; left: -6px; top: -6px; width: 8px; height: 8px; background: #b44939; }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-check-native-shape: squircle)");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
    await bindCapture(tab);
    try {
      for (const [cut, square, leak, expected] of [
        [true, false, false, false],
        [false, false, false, true],
        [true, true, false, true],
        [true, false, true, true],
      ] as const) {
        await tab.setContent(`<style>${css}</style><div class="frame"><div class="surface${cut ? " cut" : ""}"></div><div class="badge${square ? " square" : ""}"></div>${leak ? '<div class="leak"></div>' : ""}</div>`);
        const found = await tab.evaluate(findSquirclePaint);
        assert.equal(found.length > 0, expected, `${engine.name()}: cut=${cut}, square=${square}, leak=${leak}`);
      }
    } finally {
      await browser.close();
    }
  }
});

test("squircle-paint does not attribute changing background pixels to a surface", async () => {
  const browser = await chromium.launch({ headless: true });
  const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
  try {
    await tab.setContent('<div style="position:absolute;left:60px;top:60px;width:160px;height:120px;background:white;border-radius:28px;corner-shape:squircle"></div>');
    const captures = await tab.evaluate(() => ["red", "blue", "green", "purple", "orange", "red", "blue", "green", "purple", "orange"].map((color) => {
      const canvas = document.createElement("canvas");
      canvas.width = 224;
      canvas.height = 184;
      const context = canvas.getContext("2d")!;
      context.fillStyle = color;
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    }));
    await tab.exposeBinding("__ouroPaintCapture", () => captures.shift()!);
    assert.deepEqual(await tab.evaluate(findSquirclePaint), []);
  } finally {
    await browser.close();
  }
});

test("squircle-paint ignores compositing noise on an unchanged overlapping surface", async () => {
  const browser = await chromium.launch({ headless: true });
  const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
  try {
    await tab.setContent('<div style="position:absolute;left:60px;top:60px;width:160px;height:120px;background:white;border-radius:28px;corner-shape:squircle;box-shadow:0 0 0 1px black"></div>');
    const captures = await tab.evaluate(() => [false, true, true, false].map((noise) => {
      const canvas = document.createElement("canvas");
      canvas.width = 224;
      canvas.height = 184;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#777";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (noise) {
        context.fillStyle = "#797979";
        context.fillRect(0, 0, 32, canvas.height);
      }
      return canvas.toDataURL("image/png");
    }));
    await tab.exposeBinding("__ouroPaintCapture", () => captures.shift()!);
    assert.deepEqual(await tab.evaluate(findSquirclePaint), []);
  } finally {
    await browser.close();
  }
});

test("squircle-paint preserves focus while it measures a raised surface", async () => {
  const generated = await styles(`
    body { margin: 0; background: white; }
    .stage:focus-within .trigger { background: #b44939; }
    .trigger { position: absolute; left: 65px; top: 43px; width: 30px; height: 22px; background: #557799; }
    .surface { position: absolute; left: 60px; top: 70px; width: 200px; height: 140px; border-radius: 32px; background: white; box-shadow: 0 4px 12px #0008; }
    input { position: absolute; left: 40px; top: 40px; }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-check-native-shape: squircle)");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
    await bindCapture(tab);
    try {
      await tab.setContent(`<style>${css}</style><div class="stage"><div class="trigger"></div><div class="surface"><input aria-label="Search"></div></div>`);
      await tab.locator("input").focus();
      assert.deepEqual(await tab.evaluate(findSquirclePaint), [], engine.name());
      assert.equal(await tab.evaluate(() => document.activeElement?.tagName), "INPUT", `${engine.name()}: keeps the focused field`);
    } finally {
      await browser.close();
    }
  }
});

test("squircle-paint finds an external descendant beside a native surface's intentional shadow", async () => {
  const browser = await chromium.launch({ headless: true });
  const tab = await browser.newPage({ viewport: { width: 390, height: 300 }, deviceScaleFactor: 2 });
  await bindCapture(tab);
  try {
    for (const leaking of [false, true]) {
      await tab.setContent(`<style>
        body { margin: 0; background: white; }
        .stage { position: absolute; left: 60px; top: 60px; width: 200px; height: 140px; }
        .under, .surface { position: absolute; inset: 0; }
        .surface { background: white; border-radius: 20px; corner-shape: squircle; box-shadow: 0 4px 12px #0008; }
        .square { position: absolute; left: -12px; top: -12px; width: 8px; height: 8px; background: #d11; }
      </style><div class="stage"><div class="under"></div><div class="surface">${leaking ? '<div class="square"></div>' : ""}</div></div>`);
      const found = await tab.evaluate(findSquirclePaint);
      assert.equal(found.length, leaking ? 1 : 0, leaking ? "external descendant" : "native shadow");
    }
  } finally {
    await browser.close();
  }
});

test("squircle-paint keeps a fallback popup's soft shadow separate from its content", async () => {
  const generated = await styles(`
    body { margin: 0; background: #f8f8f9; }
    .surface { position: absolute; left: 69px; top: 73px; width: 288px; height: 240px; border-radius: 18px; background: white;
      box-shadow: 0 0 0 1px #eee9, 0 10px 15px -3px #0002, 0 4px 6px -4px #0002; }
    .content { position: absolute; inset: 16px; }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-check-native-shape: squircle)");
  const browser = await chromium.launch({ headless: true });
  const tab = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await bindCapture(tab);
  try {
    await tab.setContent(`<style>${css}</style><div class="surface"><div class="content">Members</div></div>`);
    assert.deepEqual(await tab.evaluate(findSquirclePaint), []);
  } finally {
    await browser.close();
  }
});

test("squircle-paint reads the generated fallback in both browser engines", async () => {
  const generated = await styles(`
    body { margin: 0; background: #eef4fa; }
    .surface { position: absolute; left: 60px; top: 60px; width: 200px; height: 140px; border-radius: 32px; background: #557799; }
    .broken { clip-path: none !important; }
    .layer { position: absolute; inset: 0; background: #cc6655; }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-check-native-shape: squircle)");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 300 }, deviceScaleFactor: 2 });
    const tab = await context.newPage();
    await bindCapture(tab);
    try {
      for (const broken of [true, false]) {
        await tab.setContent(`<style>${css}</style><div id="surface" class="surface${broken ? " broken" : ""}"><div class="layer"></div></div>`);
        const computed = await tab.locator("#surface").evaluate((el) => {
          const style = getComputedStyle(el);
          return { radius: style.getPropertyValue("--sq-tl").trim(), clip: style.clipPath, shape: style.getPropertyValue("corner-shape") };
        });
        assert.equal(computed.radius, "32px", `${engine.name()}: fallback radii are active`);
        assert.notEqual(computed.shape, "superellipse(2)", `${engine.name()}: native squircle is inactive`);
        assert.equal(computed.clip === "none", broken, `${engine.name()}: fallback clip is ${broken ? "broken" : "active"}`);
        const found = await tab.evaluate(findSquirclePaint);
        assert.equal(found.length, broken ? 1 : 0, `${engine.name()}: ${broken ? "square fill" : "clipped fill"}`);
      }
    } finally {
      await browser.close();
    }
  }
});

test("squircle-paint finds a fallback surface's own square outline and hard shadow", async () => {
  const generated = await styles(`
    body { margin: 0; background: #eef4fa; }
    .surface { position: absolute; left: 60px; top: 60px; width: 200px; height: 140px; border-radius: 32px; background: #557799; }
    .broken { clip-path: none !important; }
    .outline { outline: 6px solid #cc6655; }
    .shadow { box-shadow: 0 0 0 6px #cc6655; }
    .control { position: absolute; width: 8px; height: 8px; background: #149b55; }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-check-native-shape: squircle)");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 300 }, deviceScaleFactor: 2 });
    const tab = await context.newPage();
    await bindCapture(tab);
    try {
      for (const effect of ["outline", "shadow"]) {
        for (const clip of ["square-clip", "broken", ""]) {
          await tab.setContent(`<style>${css}</style><div id="surface" class="surface ${effect} ${clip}"></div>`);
          const found = await tab.evaluate(findSquirclePaint);
          assert.equal(found.length, clip ? 1 : 0, `${engine.name()} ${effect}: ${clip || "clipped"}`);
        }
        for (const leaking of [false, true]) {
          const position = leaking ? "left:73px;top:54px" : "left:100px;top:80px";
          await tab.setContent(`<style>${css}</style><div id="surface" class="surface ${effect}"></div><div class="control" style="${position}"></div>`);
          const found = await tab.evaluate(findSquirclePaint);
          assert.equal(found.length, leaking ? 1 : 0, `${engine.name()} ${effect}: ${leaking ? "protruding" : "inset"} sibling`);
        }
      }
    } finally {
      await browser.close();
    }
  }
});

test("squircle-paint restores inline styles and scroll positions when a capture fails", async () => {
  const css = await styles(`
    html { scroll-behavior: smooth; }
    body { height: 1200px; }
    .surface { position: absolute; top: 600px; left: 30px; width: 200px; height: 140px; border-radius: 32px; background: #557799; }
  `);
  const browser = await chromium.launch({ headless: true });
  const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
  await tab.exposeBinding("__ouroPaintCapture", () => { throw new Error("capture failed"); });
  try {
    await tab.setContent(`<style>${css}</style><div id="surface" class="surface" style="color: navy"></div>`);
    const before = await tab.locator("#surface").getAttribute("style");
    await assert.rejects(tab.evaluate(findSquirclePaint), /capture failed/);
    assert.equal(await tab.locator("#surface").getAttribute("style"), before);
    assert.equal(await tab.evaluate(() => scrollY), 0);
  } finally {
    await browser.close();
  }
});
