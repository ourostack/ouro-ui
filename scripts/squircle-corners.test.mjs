import assert from "node:assert/strict";
import test from "node:test";
import postcss from "postcss";
import { squircleCorners } from "../registry/ouro/lib/ouro/squircle-corners.ts";

const run = async (css) => (await postcss([squircleCorners()]).process(css, { from: undefined })).css;

test("squircle corners: a rounded rule gets a sibling that records its radii and shrinks its own, and one clip path in the lowest layer", async () => {
  const out = await run("@layer utilities{.card{border-radius:12px}}");
  assert.match(out, /^@layer squircle-corners;@property/);
  assert.match(out, /\.card\{border-radius:12px\}@supports \(not \(corner-shape: squircle\)\) and \(clip-path: shape\(from 0 0, close\)\)\{\.card\{--sq-tl:12px;--sq-tr:12px;--sq-br:12px;--sq-bl:12px;border-radius:calc\(12px \* 0\.543\)\}\}/);
  assert.match(out, /@layer squircle-corners\{@supports \(corner-shape: squircle\)\{\.card\{corner-shape:squircle\}\}/);
  assert.match(out, /--sq-clip:shape\(nonzero from -9999px -9999px.*move to 0 var\(--sq-tl\), curve by/);
  assert.match(out, /close, var\(--sq-notch, move to 0 0, close\)\);clip-path:var\(--sq-clip\)\}/);
});

test("squircle corners: a copy sits right after its rule, so a later rule with another radius wins", async () => {
  const out = await run(".y{border-radius:8px}.y{border-top-left-radius:4px}");
  const first = out.indexOf(".y{border-radius:8px}");
  const firstSibling = out.indexOf("--sq-tl:8px");
  const second = out.indexOf(".y{border-top-left-radius:4px}");
  const secondSibling = out.indexOf("--sq-tl:4px");
  assert.ok(first < firstSibling && firstSibling < second && second < secondSibling, "each sibling sits between its rule and the next one");
  assert.match(out, /\.y\{border-top-left-radius:4px\}@supports[^{]*\{\.y\{--sq-tl:4px;border-top-left-radius:calc\(4px \* 0\.543\)\}\}/);
});

test("squircle corners: an important radius makes its --sq-* variables important, and a longhand re-emits only its own corner", async () => {
  const out = await run(".imp{border-radius:8px !important}");
  assert.match(out, /\.imp\{--sq-tl:8px !important;--sq-tr:8px !important;--sq-br:8px !important;--sq-bl:8px !important;border-radius:calc\(8px \* 0\.543\) !important\}/);
  const longhand = await run(".e{border-top-left-radius:8px;border-bottom-right-radius:12px}");
  // The sibling sets only the two corners actually declared; the untouched ones (--sq-tr, --sq-bl)
  // are not forced to 0, they are simply absent from .e's own sibling rule.
  assert.match(longhand, /\.e\{--sq-tl:8px;border-top-left-radius:calc\(8px \* 0\.543\);--sq-br:12px;border-bottom-right-radius:calc\(12px \* 0\.543\)\}/);
});

test("squircle corners: a pill, a circle and corner-shape: round are capsules or stay round, never squares", async () => {
  const out = await run(".a{border-radius:9999px}.b{border-radius:50%}.c{height:2rem;border-radius:1.5rem}.d{border-radius:8px;corner-shape:round}");
  assert.doesNotMatch(out, /\.d\{--sq/);
  assert.match(out, /\.a\{--sq-tl:var\(--sq-half\);--sq-tr:var\(--sq-half\);--sq-br:var\(--sq-half\);--sq-bl:var\(--sq-half\);border-radius:var\(--sq-capsule-radius\)\}/);
  assert.match(out, /\.b\{--sq-tl:var\(--sq-half\)/);
  // .c's radius (1.5rem = 24px) is clamped to half its own 2rem (32px) height: 16px.
  assert.match(out, /\.c\{--sq-tl:16px;--sq-tr:16px;--sq-br:16px;--sq-bl:16px;border-radius:calc\(16px \* 0\.543\)\}/);
});

test("squircle corners: keyframes, nested rules, slash radii, longhands and var radii are handled, and CSS with no rounding is left alone", async () => {
  assert.equal(await run(".x{color:red}"), ".x{color:red}");
  assert.doesNotMatch(await run("@keyframes k{from{border-radius:4px}}"), /--sq/);
  assert.match(await run(".f{border-radius:var(--r) 4px}"), /--sq-tl:var\(--r\);--sq-tr:4px;--sq-br:var\(--r\);--sq-bl:4px;border-radius:calc\(var\(--r\) \* 0\.543\) calc\(4px \* 0\.543\) calc\(var\(--r\) \* 0\.543\) calc\(4px \* 0\.543\)\}/);
  assert.match(await run(".g{border-radius:4px 8px 12px}"), /--sq-bl:8px;border-radius:calc\(4px \* 0\.543\) calc\(8px \* 0\.543\) calc\(12px \* 0\.543\) calc\(8px \* 0\.543\)\}/);
  assert.doesNotMatch(await run(".h{.i{border-radius:4px}}"), /--sq/);
  // A var()-based radius keeps its reference text in each corner's own declaration, rather than through a shared
  // property: Ouro check's off-theme rule reads each corner's declared value to tell a theme token from a fixed one.
  assert.match(await run(".x{border-radius:var(--ouro-control-r)}"), /\.x\{--sq-tl:var\(--ouro-control-r\);--sq-tr:var\(--ouro-control-r\);--sq-br:var\(--ouro-control-r\);--sq-bl:var\(--ouro-control-r\)/);
});
