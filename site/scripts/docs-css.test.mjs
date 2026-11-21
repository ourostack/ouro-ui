import assert from "node:assert/strict";
import { test } from "node:test";
import { URL, fileURLToPath } from "node:url";
import { declarationsByRule, docsDelta, dropDeclarations } from "./docs-css.mts";

const demo = (name) => fileURLToPath(new URL(`../src/docs/demos/${name}.demo.tsx`, import.meta.url));

test("a declaration the shell has in the same block is dropped, and the same text in another block stays", () => {
  const shell = declarationsByRule(":root, :host {\n  --a: 1;\n}\n@media (width < 40rem) {\n  :target {\n    scroll-margin-top: 5rem;\n  }\n}\n");
  const css = ":root, :host {\n  --a: 1;\n  --b: 2;\n}\n:target {\n  scroll-margin-top: 5rem;\n}\n";
  assert.equal(dropDeclarations(css, shell), css.replace("  --a: 1;\n", ""));
});

test("a top-level statement the shell has is dropped, and a descriptor's lines are kept", () => {
  const css = "@layer theme, base;\n@property --x {\n  syntax: \"*\";\n}\n";
  assert.equal(dropDeclarations(css, declarationsByRule(css)), css.replace("@layer theme, base;\n", ""));
});

test("a page without a demo adds nothing to the shell, and a demo adds the classes the shell lacks", async () => {
  assert.equal(await docsDelta(undefined), "");
  const delta = await docsDelta(demo("message-list"));
  assert.match(delta, /\.h-72\{/);
  assert.doesNotMatch(delta, /\.flex-wrap\{/, "flex-wrap is in the shell");
  assert.doesNotMatch(delta, /\/\*!/, "Tailwind's licence banner is the shell's");
  assert.doesNotMatch(delta, /@supports \(color:color-mix/, "the colour-mix fallbacks are dropped");
});
