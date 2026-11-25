import assert from "node:assert/strict";
import { test } from "node:test";
import { staleThemeTokenLines } from "./check-stale-theme-tokens.mjs";

test("flags a v0.1.0 @theme inline leftover that maps one Ouro token through another at :root", () => {
  const stale = staleThemeTokenLines(":root {\n  --ouro-backdrop-color: #18181b;\n  --color-ouro-backdrop-color: var(--ouro-backdrop-color);\n}\n");
  assert.equal(stale.length, 1);
  assert.match(stale[0], /--color-ouro-backdrop-color: var\(--ouro-backdrop-color\);/);
});

test("does not flag the same shape inside @keyframes, where an animation sets one Ouro custom property from another's value", () => {
  const stale = staleThemeTokenLines(
    "@keyframes ouro-composer-reveal {\n  from {\n    --ouro-composer-inset: var(--ouro-composer-gap);\n  }\n  to {\n    --ouro-composer-inset: 0px;\n  }\n}\n",
  );
  assert.deepEqual(stale, []);
});

test("still flags a stale mapping that sits beside an unrelated @keyframes block in the same file", () => {
  const stale = staleThemeTokenLines(
    "@keyframes ouro-spin {\n  to {\n    rotate: 1turn;\n  }\n}\n.dark {\n  --ouro-x: var(--ouro-x);\n}\n",
  );
  assert.equal(stale.length, 1);
  assert.match(stale[0], /--ouro-x: var\(--ouro-x\);/);
});

test("a clean file, with no self- or cross-mapped Ouro token outside @keyframes, has nothing stale", () => {
  assert.deepEqual(staleThemeTokenLines(":root {\n  --ouro-backdrop-color: #18181b;\n  --ouro-backdrop-max: 0.4;\n}\n"), []);
});
