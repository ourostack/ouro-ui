import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { baseCss, build, outDir, plainBlocks, presetCss, splitBase, SYSTEM_DARK, systemDark } from "./static-css.mts";
import { declarations, parseBlocks, presets, readFonts, themesDir } from "./themes.mts";

const repo = resolve(outDir, "../../..");
const outputs = build();
const fonts = readFonts();

test("the committed files under site/public/css are what the script writes", () => {
  assert.deepEqual(Object.keys(outputs).sort(), ["ouro-base.css", "ouro-theme.css", ...presets.map((preset) => `themes/${preset.name}.css`)].sort());
  for (const [file, text] of Object.entries(outputs)) {
    assert.equal(readFileSync(join(outDir, file), "utf8"), text, `${file} is stale; run node site/scripts/static-css.mts`);
  }
});

test("the files are plain CSS: no Tailwind at-rules, imports or nested rules", () => {
  for (const [file, text] of Object.entries(outputs)) {
    for (const tailwind of ["@theme", "@utility", "@apply", "@import", "@source", "@custom-variant", "@layer"]) {
      assert.ok(!text.includes(tailwind), `${file} has ${tailwind}`);
    }
  }
});

test("ouro-base keeps every value of ouro-base.css, turns @theme inline into :root and leaves out the press utility", () => {
  const source = readFileSync(join(repo, "registry/ouro/theme/ouro-base.css"), "utf8");
  const split = splitBase(source);
  assert.deepEqual(split.utilities, ["press"]);
  assert.deepEqual(
    split.keyframes.map((text) => /@keyframes\s+([\w-]+)/.exec(text)[1]),
    ["ouro-spin", "ouro-pulse", "ouro-progress", "ouro-shimmer"],
  );
  const css = outputs["ouro-base.css"];
  const root = parseBlocks(css.replace(/@media[^{]*\{[\s\S]*?\n\}/g, "").replace(/@keyframes[\s\S]*$/, "")).find((block) => block.selector === ":root");
  const rootLines = declarations(root.body);
  for (const line of [...declarations(split.inline), ...declarations(split.blocks.find((block) => block.selector === ":root").body)]) {
    assert.ok(rootLines.includes(line), line);
  }
  for (const name of ["ouro-spin", "ouro-pulse", "ouro-progress", "ouro-shimmer"]) assert.ok(css.includes(`@keyframes ${name} {`), name);
  assert.ok(css.includes("Tailwind utilities left out: press."));
  assert.throws(() => baseCss(":root { --a: 1; }"), /no @theme inline block/);
  assert.throws(() => baseCss("@theme inline { --a: 1; }\n.dark { --a: 2; }"), /no :root block/);
});

test("each .dark block is mirrored for the system's dark mode, at :root's specificity, unless the page chose .light or .dark", () => {
  assert.equal(SYSTEM_DARK, ":root:where(:not(.light, .dark))");
  assert.equal(systemDark(["--a: 2"]), "@media (prefers-color-scheme: dark) {\n  :root:where(:not(.light, .dark)) {\n    --a: 2;\n  }\n}");
  const css = plainBlocks(parseBlocks(":root { --a: 1; }\n.dark { --a: 2; }\n:root, .dark { --b: var(--a); }"));
  assert.equal(css, ":root {\n  --a: 1;\n}\n\n.dark {\n  --a: 2;\n}\n\n" + systemDark(["--a: 2"]) + "\n\n:root, .dark {\n  --b: var(--a);\n}");
  assert.throws(() => plainBlocks(parseBlocks("body { --a: 1; }")), /may only be :root or \.dark/);
  for (const [file, text] of Object.entries(outputs)) {
    assert.equal(text.split("\n.dark {").length, text.split("@media (prefers-color-scheme: dark)").length, file);
  }
});

test("every token of each theme reaches its file, in light and dark", () => {
  const themes = [["ouro-theme.css", readFileSync(join(repo, "registry/ouro/theme/ouro-theme.css"), "utf8")]];
  for (const preset of presets) themes.push([`themes/${preset.name}.css`, readFileSync(join(themesDir, `${preset.name}.css`), "utf8")]);
  for (const [file, source] of themes) {
    for (const block of parseBlocks(source)) {
      for (const line of declarations(block.body)) assert.ok(outputs[file].includes(`  ${line};`), `${file}: ${line}`);
    }
  }
});

test("a preset's fonts load from site/public/fonts, by a path that holds on Pages and in the repository", () => {
  for (const preset of presets) {
    const file = `themes/${preset.name}.css`;
    const urls = [...outputs[file].matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1]);
    const families = [...outputs[file].matchAll(/font-family: "([^"]+)";/g)].map((match) => match[1]);
    assert.ok(families.includes(preset.heading), `${file} names ${preset.heading}`);
    assert.equal(urls.length, families.length, file);
    for (const url of urls) {
      assert.match(url, /^\.\.\/\.\.\/fonts\/[\w.-]+\.woff2$/);
      assert.ok(existsSync(resolve(dirname(join(outDir, file)), url)), `${file}: ${url}`);
    }
    assert.ok(outputs[file].includes('--font-sans: "Geist", '), file);
    assert.ok(outputs[file].includes('--font-mono: "Geist Mono", '), file);
  }
  assert.throws(() => presetCss({ ...presets[0], heading: "Missing" }, ":root { --radius: 1rem; }", fonts), /fonts.json has no "Missing"/);
  assert.throws(() => presetCss(presets[0], ".dark { --radius: 1rem; }", fonts), /has no :root block/);
});

test("each file names its source, says not to edit it, and carries the MIT notice", () => {
  for (const [file, text] of Object.entries(outputs)) {
    assert.ok(text.startsWith("/*\n"), file);
    assert.ok(text.includes("Generated by site/scripts/static-css.mts. Don't edit; run it again."), file);
    assert.ok(text.includes("MIT License: https://github.com/ourostack/ouro-ui/blob/main/LICENSE"), file);
  }
});
