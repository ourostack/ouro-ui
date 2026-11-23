import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { scratchDir } from "../../scripts/scratch.mjs";
import {
  build,
  buildPreset,
  checkCookbook,
  checkFonts,
  cookbookCss,
  cookbookParts,
  extractSpoonjoy,
  FONT_BUDGET,
  fontFace,
  parseBlocks,
  presets,
  readFonts,
  readSpoonjoy,
  scopeSelector,
  SITE,
  sha256,
  themesDir,
} from "./themes.mts";

const fonts = readFonts();
const read = (file) => readFileSync(`${themesDir}/${file}`, "utf8");

test("a preset's :root is its light values and .dark its dark ones, scoped to its data-theme", () => {
  assert.equal(scopeSelector(":root", "abyss"), '[data-theme="abyss"]');
  assert.equal(scopeSelector(".dark", "abyss"), '.dark[data-theme="abyss"],\n.dark [data-theme="abyss"]');
  assert.equal(scopeSelector(":root, .dark", "cookbook"), '[data-theme="cookbook"],\n.dark[data-theme="cookbook"],\n.dark [data-theme="cookbook"]');
  assert.throws(() => scopeSelector("body", "abyss"), /may only be :root or \.dark/);
});

test("theme files parse into their top-level blocks and refuse anything else", () => {
  const blocks = parseBlocks("/* note { } */\n:root {\n  --a: 1;\n}\n.dark { --a: 2; }\n");
  assert.deepEqual(blocks.map((block) => block.selector), [":root", ".dark"]);
  assert.throws(() => parseBlocks(":root { --a: 1; }\nstray"), /Unparsed theme CSS/);
});

test("Copy theme carries @font-face for every face it names, at versioned addresses on Pages; Copy tokens only carries none", () => {
  const { built } = buildPreset(presets[1], read("abyss.css"), fonts);
  assert.deepEqual(built.fonts, ["Geist", "Geist Mono", "Space Grotesk"]);
  for (const family of built.fonts) {
    const font = fonts.find((candidate) => candidate.family === family);
    assert.ok(built.css.theme.includes(`font-family: "${family}";`), family);
    assert.ok(built.css.theme.includes(`url("${SITE}/fonts/${font.file}")`), family);
    assert.match(font.file, new RegExp(`-${font.version.replaceAll(".", "\\.")}\\.woff2$`));
  }
  assert.ok(!built.css.tokens.includes("@font-face"));
  for (const css of [built.css.theme, built.css.tokens]) {
    assert.ok(css.includes(":root {"));
    assert.ok(css.includes(".dark {"));
    assert.ok(css.includes("@theme inline {"));
    assert.ok(css.includes("--color-primary: var(--primary);"));
    assert.ok(css.includes('--font-heading: "Space Grotesk"'));
    assert.ok(css.includes('--font-sans: "Geist", '));
    assert.ok(!css.includes("data-theme"), "copied CSS is plain shadcn: no site scoping");
  }
  assert.equal(built.radius, "1rem");
});

test("a preset's corners show as a length, following a var() alias to its value", () => {
  const { built } = buildPreset(presets[1], ':root { --font-heading: "Space Grotesk"; --corner: 0.375rem; --radius: var(--corner); }', fonts);
  assert.equal(built.radius, "0.375rem");
});

test("a preset must set its display face and a radius", () => {
  assert.throws(() => buildPreset(presets[1], ":root { --radius: 1rem; --font-heading: Arial; }", fonts), /must set --font-heading to "Space Grotesk"/);
  assert.throws(() => buildPreset(presets[1], ':root { --font-heading: "Space Grotesk"; }', fonts), /must set --radius/);
});

test("the site's @font-face rules point at the public folder, which Vite puts under the base", () => {
  assert.match(fontFace(fonts[0], ""), /src: url\("\/fonts\/geist-5\.3\.0\.woff2"\) format\("woff2"\);/);
  assert.match(fontFace(fonts[0], ""), /font-display: swap;/);
});

test("every font is OFL, unchanged and within budget: 90 KB preloaded, 40 KB per display face", () => {
  assert.deepEqual(checkFonts(fonts), []);
  assert.ok(fonts.filter((font) => font.preload).every((font) => ["Geist", "Geist Mono"].includes(font.family)));
  const tampered = fonts.map((font) => (font.family === "Nunito" ? { ...font, sha256: "0".repeat(64) } : font));
  assert.deepEqual(checkFonts(tampered), ["nunito-5.3.0.woff2: checksum differs from fonts.json"]);
  const heavy = fonts.map((font) => (font.family === "Nunito" ? { ...font, bytes: FONT_BUDGET.face + 1 } : font));
  const big = (file) => (file === "nunito-5.3.0.woff2" ? Buffer.alloc(FONT_BUDGET.face + 1) : readFileSync(`site/public/fonts/${file}`));
  assert.ok(checkFonts(heavy, big).some((problem) => problem.includes("over the 40960-byte face budget")));
  assert.deepEqual(checkFonts([{ ...fonts[2], licence: "Proprietary" }]), ["space-grotesk-5.3.0.woff2: licence Proprietary is not OFL-1.1"]);
});

const tailwindFixture = `@import "tailwindcss";
@import "./sj-tokens.css";

:root {
  --warning: #b05109;
}

.dark {
  --warning: #fbbf24;
}

/* mapping */
:root,
.dark {
  --background: var(--sj-paper);
}

[data-sj-action] {
  font-weight: 600;
}
`;

const tokensFixture = `/* generated */

:root {
  color-scheme: light;
  --sj-paper: #fff;
}

.dark {
  color-scheme: dark;
  --sj-paper: #000;
}
`;

test("the Cookbook sync copies Spoonjoy's token blocks verbatim and records their checksum and commit", () => {
  const blocks = extractSpoonjoy(tailwindFixture, tokensFixture);
  assert.equal(blocks, ":root {\n  color-scheme: light;\n  --sj-paper: #fff;\n  --warning: #b05109;\n}\n\n.dark {\n  color-scheme: dark;\n  --sj-paper: #000;\n  --warning: #fbbf24;\n}\n\n:root,\n.dark {\n  --background: var(--sj-paper);\n}");
  const css = cookbookCss(blocks, "a".repeat(40));
  assert.deepEqual(checkCookbook(css), []);
  assert.equal(cookbookParts(css).blocks, blocks);
  assert.equal(cookbookParts(css).recorded, sha256(blocks));
  assert.equal(cookbookParts(css).commit, "a".repeat(40));
  assert.deepEqual(checkCookbook(css.replace("#000", "#111")), [
    "cookbook.css: its synced part differs from the Spoonjoy blocks it records; run sync-cookbook, never edit it",
  ]);
});

test("a block missing from sj-tokens.css or tailwind.css fails the sync, naming that file", () => {
  assert.throws(() => extractSpoonjoy(tailwindFixture, "/* generated, no palette */"), /app\/styles\/sj-tokens\.css has no :root block/);
  assert.throws(() => extractSpoonjoy(tailwindFixture, ":root {\n  --sj-paper: #fff;\n}\n"), /app\/styles\/sj-tokens\.css has no \.dark block/);
  assert.throws(() => extractSpoonjoy(":root {\n  --warning: #b05109;\n}\n", tokensFixture), /app\/styles\/tailwind\.css has no \.dark block/);
});

test("the Cookbook sync reads both files from a checkout, and a checkout missing sj-tokens.css fails by its path", () => {
  const checkout = scratchDir("ouro-cookbook-checkout-");
  mkdirSync(join(checkout, "app/styles"), { recursive: true });
  writeFileSync(join(checkout, "app/styles/tailwind.css"), tailwindFixture);
  writeFileSync(join(checkout, "app/styles/sj-tokens.css"), tokensFixture);
  assert.equal(readSpoonjoy(checkout), extractSpoonjoy(tailwindFixture, tokensFixture));
  rmSync(join(checkout, "app/styles/sj-tokens.css"));
  assert.throws(() => readSpoonjoy(checkout), /app\/styles\/sj-tokens\.css/);
});

test("the committed Cookbook preset is an untouched sync of Spoonjoy, with Fraunces as its display face", () => {
  const css = read("cookbook.css");
  assert.deepEqual(checkCookbook(css), []);
  assert.match(cookbookParts(css).commit, /^[0-9a-f]{40}$/);
  assert.match(css, /--font-sj-display: "Fraunces"/);
  const { built } = buildPreset(presets.find((preset) => preset.name === "cookbook"), css, fonts);
  assert.ok(built.fonts.includes("Fraunces"));
});

test("the generated stylesheet and themes.json are current, and list the six presets in order", () => {
  const outputs = build();
  assert.equal(outputs["presets.generated.css"], read("presets.generated.css"), "run node site/scripts/themes.mts");
  assert.equal(outputs["themes.json"], read("themes.json"), "run node site/scripts/themes.mts");
  assert.deepEqual(JSON.parse(outputs["themes.json"]).map((preset) => preset.name), ["pearl", "abyss", "brass", "chart", "coral", "cookbook"]);
});

test("ouro-theme.css, the look apps install, is Pearl's colours and radius, light and dark", () => {
  const values = (css) =>
    Object.fromEntries(
      parseBlocks(css).map((block) => [
        block.selector,
        block.body
          .split(";")
          .map((line) => line.trim())
          .filter((line) => line && !/^--(font-|shadow-|ouro-)/.test(line)),
      ]),
    );
  const shipped = readFileSync(`${themesDir}/../../../registry/ouro/theme/ouro-theme.css`, "utf8");
  assert.deepEqual(values(shipped), values(read("pearl.css")));
});
