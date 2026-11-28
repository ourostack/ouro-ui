import assert from "node:assert/strict";
import test from "node:test";
import postcss from "postcss";
import { chromium, webkit } from "playwright";
import { squircleCorners, squircleCornersDedupe } from "../registry/ouro/lib/ouro/squircle-corners.ts";

const run = async (css) => (await postcss([squircleCorners()]).process(css, { from: undefined })).css;

// Runs the dedupe plugin's generateBundle hook over one fake CSS asset, as Vite would call it.
const dedupe = (source) => {
  const bundle = { "a.css": { type: "asset", fileName: "a.css", source } };
  squircleCornersDedupe().generateBundle({}, bundle);
  return bundle["a.css"].source;
};

test("squircle corners: a rounded rule gets a sibling that records its radii and shrinks its own, and one clip path in the lowest layer", async () => {
  const out = await run("@layer utilities{.card{border-radius:12px}}");
  assert.match(out, /^@layer squircle-corners;@property --sq-notch/);
  assert.match(out, /\.card\{--sq-tl:12px;--sq-tr:12px;--sq-br:12px;--sq-bl:12px;border-radius:calc\(12px \* 0\.543\)/);
  assert.match(out, /@layer squircle-corners\{@supports \(corner-shape: squircle\)\{\.card\{corner-shape:var\(--sq-shape-tl, squircle\)/);
  assert.match(out, /--sq-clip:shape\(nonzero from -9999px -9999px.*move to 0 var\(--sq-tl\), curve by/);
  assert.match(out, /close, var\(--sq-notch, move to 0 0, close\)\);clip-path:var\(--sq-clip\)\}/);
});

test("squircle corners: pills, circles, half a set height and corner-shape: round stay round, and a mixed rule squares only its squircle corners", async () => {
  const out = await run(".a{border-radius:9999px}.b{border-radius:50%}.c{height:2rem;border-radius:1rem}.d{border-radius:8px;corner-shape:round}.e{border-top-left-radius:8px;border-bottom-right-radius:calc(infinity * 1px)}");
  assert.match(out, /\.a,\.b,\.c,\.d\{--sq-tl:0px;--sq-tr:0px;--sq-br:0px;--sq-bl:0px\}/);
  assert.doesNotMatch(out.slice(out.indexOf("@layer squircle-corners{")), /\.[abcd](?=[,{])/);
  assert.match(out, /\.e\{--sq-tl:8px;--sq-br:0px;/);
  assert.doesNotMatch(out, /\.e\{--sq-tl:8px;[^}]*--sq-tr:/);
});

test("squircle corners: keyframes, nested rules, slash radii, longhands and var radii are handled, and CSS with no rounding is left alone", async () => {
  assert.equal(await run(".x{color:red}"), ".x{color:red}");
  assert.doesNotMatch(await run("@keyframes k{from{border-radius:4px}}"), /--sq/);
  assert.match(await run(".f{border-radius:var(--r) 4px}"), /--sq-tl:var\(--r\);--sq-tr:4px;--sq-br:var\(--r\);--sq-bl:4px/);
  assert.match(await run(".g{border-radius:4px 8px 12px}"), /--sq-tr:8px;--sq-br:12px;--sq-bl:8px/);
  assert.doesNotMatch(await run(".h{.i{border-radius:4px}}"), /--sq/);
});

test("squircle corners: two rules in the same place that round to the same radii share one fallback sibling, written once", async () => {
  const out = await run("@layer utilities{.a{border-radius:8px}.b{color:red}.c{border-radius:8px}}");
  const sibling = /\.a,\.c\{--sq-tl:8px;--sq-tr:8px;--sq-br:8px;--sq-bl:8px;border-radius:calc\(8px \* 0\.543\)[^}]*\}/;
  assert.match(out, sibling);
  // written once: no second, separate .a{...} or .c{...} fallback sibling remains
  assert.equal((out.match(/--sq-tl:8px/g) ?? []).length, 1);
});

test("squircle corners: the same radii in different places (a media query, a different layer) keep their own fallback siblings", async () => {
  const out = await run("@layer utilities{.a{border-radius:8px}@media (width>=40rem){.b{border-radius:8px}}}");
  const media = postcss.parse(out).nodes.find((node) => node.name === "layer" && node.params === "utilities").nodes.find((node) => node.name === "media");
  assert.equal(media.nodes[0].selector, ".b");
  const fallback = media.nodes.find((node) => node.name === "supports" && node.params.includes("not"));
  assert.equal(fallback.nodes[0].selector, ".b");
  assert.equal(fallback.nodes[0].nodes.find((node) => node.prop === "--sq-tl").value, "8px");
  assert.match(out, /@supports[^{]*\{\.a\{--sq-tl:8px/);
  assert.equal((out.match(/--sq-tl:8px/g) ?? []).length, 2);
});

test("squircle corners: an unsupported selector cannot discard another surface's native or fallback shape", async () => {
  const generated = await run(`
    .surface { position: relative; width: 120px; height: 80px; border-radius: 20px; background: #dce5ef; }
    .surface::before { content: ""; position: absolute; inset: 0; border-radius: 20px; background: #557799; }
    .quoted[data-note="::,]"] { width: 120px; height: 80px; border-radius: 20px; background: #dce5ef; }
    .picker::-moz-color-swatch { border-radius: 20px; }
    .other:ouro-unavailable { border-radius: 20px; }
  `);
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage();
    try {
      for (const built of [generated, dedupe(generated + generated)]) {
        for (const fallback of [false, true]) {
          const css = fallback ? built.replaceAll("(corner-shape: squircle)", "(ouro-native-corner-shape: squircle)") : built;
          await tab.setContent(`<style>${css}</style><div class="surface"></div><div class="quoted" data-note="::,]"></div>`);
          const styles = await tab.evaluate(() => {
            const { document, getComputedStyle } = globalThis;
            const read = (element, pseudo) => {
              const style = getComputedStyle(element, pseudo);
              return { radius: style.getPropertyValue("--sq-tl").trim(), clip: style.clipPath, shape: style.getPropertyValue("corner-top-left-shape") };
            };
            const surface = document.querySelector(".surface");
            return [read(surface, null), read(surface, "::before"), read(document.querySelector(".quoted"), null)];
          });
          for (const style of styles) {
            if (fallback) {
              assert.equal(style.radius, "20px", `${engine.name()}: fallback radius`);
              assert.notEqual(style.clip, "none", `${engine.name()}: fallback clip`);
            } else {
              assert.equal(style.shape, "superellipse(2)", `${engine.name()}: native shape`);
            }
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
});

test("squircle corners: separate longhand classes preserve each other's corners", async () => {
  const generated = await run(`
    .surface { width: 120px; height: 80px; background: #dce5ef; }
    .top { border-top-left-radius: 20px; border-top-right-radius: 20px; }
    .bottom { border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-native-corner-shape: squircle)");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage();
    try {
      await tab.setContent(`<style>${css}</style><div class="surface top bottom"></div>`);
      const corners = await tab.locator(".surface").evaluate((element) => {
        const style = globalThis.getComputedStyle(element);
        return {
          clip: ["tl", "tr", "br", "bl"].map((corner) => parseFloat(style.getPropertyValue(`--sq-${corner}`))),
          border: ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"].map((property) => parseFloat(style[property])),
        };
      });
      assert.deepEqual(corners.clip, [20, 20, 12, 12], `${engine.name()}: opposite corner clips compose`);
      corners.border.forEach((actual, index) => {
        assert.ok(Math.abs(actual - corners.clip[index] * 0.543) < 0.01, `${engine.name()}: the enclosing border follows each corner`);
      });
    } finally {
      await browser.close();
    }
  }
});

test("squircle corners: logical corners follow the writing direction", async () => {
  const generated = await run(`
    .surface { width: 120px; height: 80px; background: #dce5ef; }
    .start { border-start-start-radius: 20px; border-end-start-radius: 12px; }
    .end { border-start-end-radius: 16px; border-end-end-radius: 8px; }
    .marker:before { content: ""; border-start-start-radius: 10px; }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-native-corner-shape: squircle)");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage();
    try {
      for (const [direction, expected] of [["ltr", [20, 16, 8, 12]], ["rtl", [16, 20, 12, 8]]]) {
        await tab.setContent(`<style>${css}</style><div dir="${direction}" class="surface start end"><span class="marker"></span></div>`);
        const corners = await tab.locator(".surface").evaluate((element) => {
          const style = globalThis.getComputedStyle(element);
          return ["tl", "tr", "br", "bl"].map((corner) => parseFloat(style.getPropertyValue(`--sq-${corner}`)));
        });
        assert.deepEqual(corners, expected, `${engine.name()}: ${direction}`);
        const pseudo = await tab.locator(".marker").evaluate((element) => {
          const style = globalThis.getComputedStyle(element, "::before");
          return ["tl", "tr"].map((corner) => parseFloat(style.getPropertyValue(`--sq-${corner}`)));
        });
        assert.deepEqual(pseudo, direction === "ltr" ? [10, 0] : [0, 10], `${engine.name()}: ${direction} pseudo-element`);
      }
    } finally {
      await browser.close();
    }
  }
});

test("squircle corners: grouping fallback rules preserves the source cascade", async () => {
  const generated = await run(`
    .surface { width: 120px; height: 80px; background: #dce5ef; }
    .first { border-radius: 8px; }
    .middle { border-radius: 24px; }
    .last { border-radius: 8px; }
    .early { border-radius: 8px; }
    .reset { all: unset; }
    .again { border-radius: 8px; }
    @media (min-width: 500px) { .wide { border-radius: 28px; } }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-native-corner-shape: squircle)");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage();
    try {
      await tab.setContent(`<style>${css}</style><div class="surface first middle last"></div>`);
      const radius = await tab.locator(".surface").evaluate((element) => parseFloat(globalThis.getComputedStyle(element).getPropertyValue("--sq-tl")));
      assert.equal(radius, 8, `${engine.name()}: the last radius wins`);
      await tab.locator(".surface").evaluate((element) => { element.className = "surface first wide"; });
      const wide = await tab.locator(".surface").evaluate((element) => parseFloat(globalThis.getComputedStyle(element).getPropertyValue("--sq-tl")));
      assert.equal(wide, 28, `${engine.name()}: the later media rule wins`);
      await tab.locator(".surface").evaluate((element) => { element.className = "surface early reset"; });
      const reset = await tab.locator(".surface").evaluate((element) => globalThis.getComputedStyle(element).borderTopLeftRadius);
      assert.equal(reset, "0px", `${engine.name()}: an intervening all reset wins`);
    } finally {
      await browser.close();
    }
  }
});

test("squircle corners: a later circle clears an earlier squircle", async () => {
  const generated = await run(`
    .surface { width: 120px; height: 80px; background: #dce5ef; }
    .squircle { border-radius: 20px; }
    .circle { border-radius: 50%; }
    .later { border-radius: 12px; }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-native-corner-shape: squircle)");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage();
    try {
      await tab.setContent(`<style>${css}</style><div class="surface squircle circle"></div>`);
      const read = () => tab.locator(".surface").evaluate((element) => {
        const style = globalThis.getComputedStyle(element);
        return [parseFloat(style.getPropertyValue("--sq-tl")), style.borderTopLeftRadius];
      });
      assert.deepEqual(await read(), [0, "50%"], `${engine.name()}: a circle has no stale squircle clip`);
      await tab.locator(".surface").evaluate((element) => { element.classList.add("later"); });
      const later = await read();
      assert.equal(later[0], 12, `${engine.name()}: a still-later squircle wins`);
      assert.ok(Math.abs(parseFloat(later[1]) - 6.516) < 0.01, `${engine.name()}: its enclosing border wins too`);
    } finally {
      await browser.close();
    }
  }
});

test("squircle corners: native shapes follow a later circle and a still-later squircle", async () => {
  const css = await run(`
    .surface { width: 120px; height: 80px; background: #dce5ef; }
    .squircle { border-radius: 20px; }
    .circle { border-radius: 50%; }
    .later { border-radius: 12px; }
    .one-round { border-top-left-radius: 50% !important; }
    .explicit { corner-shape: bevel; }
  `);
  const browser = await chromium.launch({ headless: true });
  const tab = await browser.newPage();
  try {
    await tab.setContent(`<style>${css}</style><div class="surface squircle circle"></div>`);
    const shape = () => tab.locator(".surface").evaluate((element) => globalThis.getComputedStyle(element).getPropertyValue("corner-top-left-shape"));
    assert.ok(["round", "superellipse(1)"].includes(await shape()), "the later circle remains round");
    await tab.locator(".surface").evaluate((element) => { element.classList.add("later"); });
    assert.equal(await shape(), "superellipse(2)", "the still-later squircle wins");
    await tab.locator(".surface").evaluate((element) => { element.className = "surface squircle one-round later"; });
    const corners = await tab.locator(".surface").evaluate((element) =>
      ["top-left", "top-right", "bottom-right", "bottom-left"].map((corner) => globalThis.getComputedStyle(element).getPropertyValue(`corner-${corner}-shape`)),
    );
    assert.ok(["round", "superellipse(1)"].includes(corners[0]), "an important round longhand keeps its corner");
    assert.deepEqual(corners.slice(1), ["superellipse(2)", "superellipse(2)", "superellipse(2)"], "other corners stay squircles");
    await tab.locator(".surface").evaluate((element) => { element.classList.add("explicit"); });
    assert.ok(["bevel", "superellipse(0)"].includes(await shape()), "an explicit corner shape still wins");
  } finally {
    await browser.close();
  }
});

test("squircle corners: fallback radii honor important declarations", async () => {
  const generated = await run(`
    .surface { width: 120px; height: 80px; background: #dce5ef; }
    .first { border-top-left-radius: 20px !important; border-top-right-radius: 10px !important; border-top-right-radius: 5px; }
    .later { border-top-left-radius: 8px; }
  `);
  const css = generated.replaceAll("(corner-shape: squircle)", "(ouro-native-corner-shape: squircle)");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const tab = await browser.newPage();
    try {
      await tab.setContent(`<style>${css}</style><div class="surface first later"></div>`);
      const corners = await tab.locator(".surface").evaluate((element) => {
        const style = globalThis.getComputedStyle(element);
        return ["--sq-tl", "--sq-tr", "border-top-left-radius", "border-top-right-radius"].map((property) => parseFloat(style.getPropertyValue(property)));
      });
      assert.deepEqual(corners.slice(0, 2), [20, 10], `${engine.name()}: important radii keep their clip`);
      assert.ok(Math.abs(corners[2] - 10.86) < 0.01 && Math.abs(corners[3] - 5.43) < 0.01, `${engine.name()}: their enclosing borders match`);
    } finally {
      await browser.close();
    }
  }
});

test("squircleCornersDedupe: merges two source files' complete squircle-corners layers, bundled into one chunk, into one", async () => {
  const a = await run("@layer utilities{.a{border-radius:8px}}");
  const b = await run("@layer utilities{.b{border-radius:8px}.c{border-radius:4px}}");
  const bundled = a + b;
  const out = dedupe(bundled);
  // one merged layer, one corner-shape rule and one --sq-clip rule, covering every selector from both files
  assert.equal((out.match(/@layer squircle-corners\{/g) ?? []).length, 1);
  assert.equal((out.match(/corner-shape:var\(--sq-shape-tl, squircle\)/g) ?? []).length, 1);
  assert.equal((out.match(/--sq-clip:/g) ?? []).length, 1);
  for (const sel of [".a", ".b", ".c"]) assert.match(out, new RegExp(`${sel}[,{]`));
});

test("squircleCornersDedupe: within one chunk, collapses the same selector list repeated under both @layer blocks into one, same declarations", async () => {
  const a = await run("@layer utilities{.a{border-radius:8px}}");
  const out = dedupe(a + a);
  assert.equal((out.match(/@layer squircle-corners\{/g) ?? []).length, 1);
  assert.equal((out.match(/corner-shape:var\(--sq-shape-tl, squircle\)/g) ?? []).length, 1);
  assert.equal((out.match(/--sq-clip:/g) ?? []).length, 1);
  const layer = out.match(/@layer squircle-corners\{(.*?)\}\}(?=@layer squircle-corners;|$)/s)[1];
  assert.equal((layer.match(/\.a/g) ?? []).length, 2); // once per @supports fallback group, not once per source file
});

test("squircleCornersDedupe: a CSS file with no squircle-corners layer, and a non-CSS asset, pass through unchanged", () => {
  const bundle = {
    "plain.css": { type: "asset", fileName: "plain.css", source: ".x{color:red}" },
    "app.js": { type: "chunk", fileName: "app.js", source: "console.log(1)" },
  };
  squircleCornersDedupe().generateBundle({}, bundle);
  assert.equal(bundle["plain.css"].source, ".x{color:red}");
  assert.equal(bundle["app.js"].source, "console.log(1)");
});
