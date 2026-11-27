import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { chromium, webkit, type Page } from "playwright";
import postcss from "postcss";
import { findCornerIssues } from "../../registry/ouro/check/corner-check.ts";
import { check } from "../../registry/ouro/check/run.ts";
import { findSquirclePaint, type PaintClip } from "../../registry/ouro/check/squircle-paint.ts";
import { squircleCorners } from "../../registry/ouro/lib/ouro/squircle-corners.ts";
import { dir, fixtures, page, quiet, site } from "./kit.mts";

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

test("squircle-paint does not attribute changing background pixels to a surface", async () => {
  const browser = await chromium.launch({ headless: true });
  const tab = await browser.newPage({ viewport: { width: 390, height: 300 } });
  try {
    await tab.setContent('<div style="position:absolute;left:60px;top:60px;width:160px;height:120px;background:white;border-radius:28px;corner-shape:squircle"></div>');
    const captures = await tab.evaluate(() => ["red", "blue", "green"].map((color) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 32;
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
        for (const broken of [true, false]) {
          await tab.setContent(`<style>${css}</style><div id="surface" class="surface ${effect}${broken ? " broken" : ""}"></div>`);
          const found = await tab.evaluate(findSquirclePaint);
          assert.equal(found.length, broken ? 1 : 0, `${engine.name()} ${effect}: ${broken ? "unclipped" : "clipped"}`);
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
