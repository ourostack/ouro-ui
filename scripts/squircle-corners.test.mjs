import assert from "node:assert/strict";
import test from "node:test";
import postcss from "postcss";
import { squircleCorners } from "../registry/ouro/lib/ouro/squircle-corners.ts";

const run = async (css) => (await postcss([squircleCorners()]).process(css, { from: undefined })).css;

test("squircle corners: a rounded rule gets a sibling that records its radii and shrinks its own, and one clip path in the lowest layer", async () => {
  const out = await run("@layer utilities{.card{border-radius:12px}}");
  assert.match(out, /^@layer squircle-corners;@property/);
  assert.match(out, /\.card\{--sq-tl:12px;border-top-left-radius:calc\(12px \* 0\.543\);--sq-tr:12px/);
  assert.match(out, /@layer squircle-corners\{@supports \(corner-shape: squircle\)\{\.card\{corner-shape:squircle\}\}/);
  assert.match(out, /clip-path:shape\(nonzero from -9999px -9999px.*move to 0 var\(--sq-tl\), curve by/);
});

test("squircle corners: a capsule is measured, a circle and corner-shape: round stay round, and a rule clamps to half a size it sets", async () => {
  const out = await run(".a{border-radius:9999px}.b{border-radius:50%}.d{border-radius:8px;corner-shape:round}.c{height:20px;border-radius:30px}");
  assert.match(out, /\.a\{--sq-tl:var\(--sq-half\);border-top-left-radius:var\(--sq-capsule-radius\)/);
  assert.match(out, /@property --sq-half/);
  assert.match(out, /\.b\{--sq-tl:var\(--sq-half\)/);
  assert.doesNotMatch(out, /\.d\{--sq/);
  assert.match(out, /\.c\{--sq-tl:10px;/);
});

test("squircle corners: a copy sits right after its rule, so a later rule of equal specificity wins", async () => {
  const out = await run(".a{border-radius:8px}.a{border-radius:4px}");
  assert.match(out, /\.a\{border-radius:8px\}@supports[^{]*\{\.a\{--sq-tl:8px[^}]*\}\}\.a\{border-radius:4px\}@supports[^{]*\{\.a\{--sq-tl:4px/);
});

test("squircle corners: an important radius makes its variables important, and a longhand re-emits only its own corner", async () => {
  const out = await run(".a{border-radius:12px!important}.b{border-radius:8px;border-top-left-radius:2px}.c{border-top-left-radius:6px}");
  assert.match(out, /\.a\{--sq-tl:12px !important;border-top-left-radius:calc\(12px \* 0\.543\) !important/);
  assert.match(out, /\.c\{--sq-tl:6px;border-top-left-radius:calc\(6px \* 0\.543\)\}/);
  assert.doesNotMatch(out, /\)\{\.c\{[^}]*--sq-tr/);
});

test("squircle corners: keyframes, nested rules, slash radii, longhands and var radii are handled, and CSS with no rounding is left alone", async () => {
  assert.equal(await run(".x{color:red}"), ".x{color:red}");
  assert.doesNotMatch(await run("@keyframes k{from{border-radius:4px}}"), /--sq/);
  assert.match(await run(".f{border-radius:var(--r) 4px}"), /--sq-tl:var\(--r\);border-top-left-radius:calc\(var\(--r\) \* 0\.543\);--sq-tr:4px/);
  assert.match(await run(".g{border-radius:4px 8px 12px}"), /--sq-tr:8px;border-top-right-radius:calc\(8px \* 0\.543\);--sq-br:12px;border-bottom-right-radius:calc\(12px \* 0\.543\);--sq-bl:8px/);
  assert.doesNotMatch(await run(".h{.i{border-radius:4px}}"), /--sq/);
});
