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
  assert.deepEqual(Object.keys(outputs).sort(), ["ouro-base.css", "ouro-plain.css", "ouro-theme.css", ...presets.map((preset) => `themes/${preset.name}.css`)].sort());
  for (const [file, text] of Object.entries(outputs)) {
    assert.equal(readFileSync(join(outDir, file), "utf8"), text, `${file} is stale; run node site/scripts/static-css.mts`);
  }
});

test("ouro-plain keeps every class of ouro-plain.css and its tokens, as plain CSS", () => {
  const source = readFileSync("registry/ouro/theme/ouro-plain.css", "utf8");
  const classes = [...new Set([...source.matchAll(/\.(ouro-[\w-]+)/g)].map((match) => match[1]))];
  assert.ok(classes.length > 10);
  for (const name of classes) assert.ok(outputs["ouro-plain.css"].includes(`.${name}`), `ouro-plain.css lacks .${name}`);
  assert.match(outputs["ouro-plain.css"], /--ouro-segment-selected: var\(--background\)/);
  assert.match(outputs["ouro-plain.css"], /prefers-color-scheme: dark/);
  assert.ok(!outputs["ouro-base.css"].includes(".ouro-focus-ring"), "ouro-base.css still carries ouro-plain's classes");
});

test("the files are plain CSS: no Tailwind at-rules, imports or nested rules", () => {
  for (const [file, text] of Object.entries(outputs)) {
    for (const tailwind of ["@theme", "@utility", "@apply", "@import", "@source", "@custom-variant", "@layer"]) {
      assert.ok(!text.includes(tailwind), `${file} has ${tailwind}`);
    }
  }
});

test("ouro-base keeps every value of ouro-base.css, turns @theme inline into :root and leaves out its Tailwind utilities", () => {
  const source = readFileSync(join(repo, "registry/ouro/theme/ouro-base.css"), "utf8");
  const split = splitBase(source);
  assert.deepEqual(split.utilities, ["rounded-full", "rounded-ouro-control", "rounded-ouro-control-md", "rounded-ouro-inner", "rounded-ouro-check", "press", "ouro-fade-end", "ouro-fade-start"]);
  assert.deepEqual(
    split.keyframes.map((text) => /@keyframes\s+([\w-]+)/.exec(text)[1]),
    ["ouro-spin", "ouro-composer-reveal", "ouro-composer-conceal", "ouro-composer-toolbar-in", "ouro-composer-toolbar-out", "ouro-composer-fade-in", "ouro-pulse", "ouro-progress", "ouro-skeleton-breathe", "ouro-hero-rise", "ouro-hero-fade", "ouro-moment-arrive"],
  );
  assert.deepEqual(split.properties, ['@property --ouro-composer-inset {\n  syntax: "<length>";\n  inherits: false;\n  initial-value: 0px;\n}']);
  assert.ok(outputs["ouro-base.css"].includes(split.properties[0]), "ouro-base.css carries the registered properties");
  const css = outputs["ouro-base.css"];
  const root = parseBlocks(css.replace(/@media[^{]*\{[\s\S]*?\n\}/g, "").replace(/@(?:supports|container)[^{]*\{[\s\S]*?\n\}/g, "").replace(/@keyframes[\s\S]*$/, "")).find((block) => block.selector === ":root");
  const rootLines = declarations(root.body);
  for (const line of [...declarations(split.inline), ...declarations(split.blocks.find((block) => block.selector === ":root").body)]) {
    assert.ok(rootLines.includes(line), line);
  }
  for (const name of ["ouro-spin", "ouro-pulse", "ouro-progress", "ouro-skeleton-breathe"]) assert.ok(css.includes(`@keyframes ${name} {`), name);
  assert.ok(css.includes("Tailwind utilities left out: rounded-full, rounded-ouro-control, rounded-ouro-control-md, rounded-ouro-inner, rounded-ouro-check, press, ouro-fade-end, ouro-fade-start."));
  assert.equal(split.supports.length, 1);
  assert.match(split.supports[0], /^@supports \(corner-shape: squircle\) and \(clip-path: shape\(from 0 0, close\)\) \{\n {2}\[data-ouro-bite\] \{/);
  assert.ok(css.includes(split.supports[0]));
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
