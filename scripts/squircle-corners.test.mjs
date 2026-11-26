import assert from "node:assert/strict";
import test from "node:test";
import postcss from "postcss";
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
  assert.match(out, /@layer squircle-corners\{@supports \(corner-shape: squircle\)\{\.card\{corner-shape:squircle\}\}/);
  assert.match(out, /--sq-clip:shape\(nonzero from -9999px -9999px.*move to 0 var\(--sq-tl\), curve by/);
  assert.match(out, /close, var\(--sq-notch, move to 0 0, close\)\);clip-path:var\(--sq-clip\)\}/);
});

test("squircle corners: pills, circles, half a set height and corner-shape: round stay round, and a mixed rule squares only its squircle corners", async () => {
  const out = await run(".a{border-radius:9999px}.b{border-radius:50%}.c{height:2rem;border-radius:1rem}.d{border-radius:8px;corner-shape:round}.e{border-top-left-radius:8px;border-bottom-right-radius:calc(infinity * 1px)}");
  assert.doesNotMatch(out, /\.[abcd]\{--sq/);
  assert.match(out, /\.e\{--sq-tl:8px;--sq-tr:0px;--sq-br:0px;/);
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
  assert.match(out, /@media \(width>=40rem\)\{\.b\{border-radius:8px\}@supports[^{]*\{\.b\{--sq-tl:8px/);
  assert.match(out, /@supports[^{]*\{\.a\{--sq-tl:8px/);
  assert.equal((out.match(/--sq-tl:8px/g) ?? []).length, 2);
});

test("squircleCornersDedupe: merges two source files' complete squircle-corners layers, bundled into one chunk, into one", async () => {
  const a = await run("@layer utilities{.a{border-radius:8px}}");
  const b = await run("@layer utilities{.b{border-radius:8px}.c{border-radius:4px}}");
  const bundled = a + b;
  const out = dedupe(bundled);
  // one merged layer, one corner-shape rule and one --sq-clip rule, covering every selector from both files
  assert.equal((out.match(/@layer squircle-corners\{/g) ?? []).length, 1);
  assert.equal((out.match(/corner-shape:squircle\}/g) ?? []).length, 1);
  assert.equal((out.match(/--sq-clip:/g) ?? []).length, 1);
  for (const sel of [".a", ".b", ".c"]) assert.match(out, new RegExp(`${sel}[,{]`));
});

test("squircleCornersDedupe: within one chunk, collapses the same selector list repeated under both @layer blocks into one, same declarations", async () => {
  const a = await run("@layer utilities{.a{border-radius:8px}}");
  const out = dedupe(a + a);
  assert.equal((out.match(/@layer squircle-corners\{/g) ?? []).length, 1);
  assert.equal((out.match(/corner-shape:squircle\}/g) ?? []).length, 1);
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
