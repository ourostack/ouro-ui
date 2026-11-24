import assert from "node:assert/strict";
import test from "node:test";
import postcss from "postcss";
import { squircleCorners } from "../registry/ouro/lib/ouro/squircle-corners.ts";

const run = async (css) => (await postcss([squircleCorners()]).process(css, { from: undefined })).css;

test("squircle corners: a rounded rule gets a sibling that records its radii and shrinks its own, and one clip path in the lowest layer", async () => {
  const out = await run("@layer utilities{.card{border-radius:12px}}");
  assert.match(out, /^@layer squircle-corners;@property --sq-bl/);
  assert.match(out, /\.card\{--sq-tl:12px;--sq-tr:12px;--sq-br:12px;--sq-bl:12px;border-radius:calc\(12px \* 0\.543\)/);
  assert.match(out, /@layer squircle-corners\{@supports \(corner-shape: squircle\)\{\.card\{corner-shape:squircle\}\}/);
  assert.match(out, /clip-path:shape\(nonzero from -9999px -9999px.*move to 0 var\(--sq-tl\), curve by/);
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
