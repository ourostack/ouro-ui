// Ouro HX's tokens as plain stylesheets, for a page with no build step and no Tailwind: one <link>
// for ouro-base, one for a theme. They are served from Pages, and from the repository at a commit
// for a pinned copy. This script writes them from the registry's theme files and the site's
// presets:
//
//   node site/scripts/static-css.mts           writes site/public/css/
//   node site/scripts/static-css.mts --check   fails when a file there is stale (site:build runs it)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { type Block, declarations, fontFace, type Font, parseBlocks, type Preset, presets, readFonts, SITE, stack, themesDir } from "./themes.mts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const outDir = join(repo, "site/public/css");
const themeDir = join(repo, "registry/ouro/theme");

/** From a file in site/public/css/themes/ to site/public/fonts/: the same on Pages and in the repository. */
export const FONTS_FROM_THEMES = "../..";

/**
 * The selector that follows the system's dark mode when the page sets neither .light nor .dark. Its
 * specificity is that of :root, so a page's own :root rule after these files still overrides it.
 */
export const SYSTEM_DARK = ":root:where(:not(.light, .dark))";

const rule = (selector: string, lines: readonly string[], indent = "") =>
  `${indent}${selector} {\n${lines.map((line) => `${indent}  ${line};`).join("\n")}\n${indent}}`;

/** A .dark block again, applied under prefers-color-scheme: dark unless the page chose a mode. */
export function systemDark(lines: readonly string[]): string {
  return `@media (prefers-color-scheme: dark) {\n${rule(SYSTEM_DARK, lines, "  ")}\n}`;
}

/** Theme blocks as plain CSS: each as written, and each .dark block mirrored for the system's dark mode. */
export function plainBlocks(blocks: readonly Block[]): string {
  return blocks
    .flatMap((block) => {
      const parts = block.selector.split(",").map((part) => part.trim());
      for (const part of parts) {
        if (part !== ":root" && part !== ".dark") throw new Error(`A theme block may only be :root or .dark, not "${part}"`);
      }
      const lines = declarations(block.body);
      const written = rule(parts.join(", "), lines);
      return parts.length === 1 && parts[0] === ".dark" ? [written, systemDark(lines)] : [written];
    })
    .join("\n\n");
}

/**
 * The rules of ouro-base.css's @layer base that are plain CSS for any markup (Ouro's classes,
 * .ouro-focus-ring and the rest), and the file without that layer, whose other rules need Tailwind.
 */
export function plainClasses(css: string): { classes: string[]; rest: string } {
  const root = postcss.parse(css);
  const classes: string[] = [];
  const lines = (node: postcss.Rule) => node.nodes.flatMap((decl) => (decl.type === "decl" ? [`${decl.prop}: ${decl.value}`] : []));
  const ours = (node: postcss.Rule) => node.selectors.every((selector) => selector.trim().startsWith(".ouro-"));
  root.walkAtRules("layer", (layer) => {
    if (layer.params !== "base") return;
    layer.each((node) => {
      if (node.type === "rule" && ours(node)) classes.push(rule(node.selectors.map((selector) => selector.trim()).join(", "), lines(node)));
      if (node.type === "atrule" && node.name === "media") {
        const inner = node.nodes?.flatMap((child) => (child.type === "rule" && ours(child) ? [rule(child.selector, lines(child), "  ")] : [])) ?? [];
        if (inner.length > 0) classes.push(`@media ${node.params} {\n${inner.join("\n")}\n}`);
      }
    });
    layer.remove();
  });
  return { classes, rest: root.toString() };
}

/** The top-level at-rules of ouro-base.css, by name, and the rest of the file without them. */
export function splitBase(css: string): { inline: string; utilities: string[]; properties: string[]; keyframes: string[]; supports: string[]; classes: string[]; blocks: Block[] } {
  const { classes, rest: unlayered } = plainClasses(css.replace(/\/\*[\s\S]*?\*\//g, ""));
  const source = unlayered;
  const inline = /@theme inline\s*\{([^{}]*)\}/.exec(source);
  if (!inline) throw new Error("ouro-base.css has no @theme inline block");
  const utilities = [...source.matchAll(/@utility\s+([\w-]+)\s*\{[^{}]*\}/g)].map((match) => match[1]!);
  const propertyPattern = /@property\s+--[\w-]+\s*\{[^{}]*\}/g;
  const properties = [...source.matchAll(propertyPattern)].map((match) => {
    const name = /@property\s+(--[\w-]+)/.exec(match[0])![1]!;
    return rule(`@property ${name}`, declarations(match[0].slice(match[0].indexOf("{") + 1, -1)), "");
  });
  const keyframes = [...source.matchAll(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g)].map((match) => match[0]);
  const supportsPattern = /@(?:supports|container)[^{]*\{(?:\s*[^{}]*\{[^{}]*\})*\s*\}/g;
  // The keyboard-only focus rules need Ouro's last-input tracker, which a page without the components never runs.
  const supports = [...source.matchAll(supportsPattern)].filter((match) => !match[0].includes("data-ouro-pressed-focus")).map((match) => {
    const query = /(@(?:supports|container)[^{]*?)\s*\{/.exec(match[0])![1]!;
    const inner = match[0].slice(match[0].indexOf("{") + 1, match[0].lastIndexOf("}"));
    const rules = [...inner.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((rm) => rule(rm[1]!.trim(), declarations(rm[2]!), "  "));
    return `${query} {\n${rules.join("\n")}\n}`;
  });
  const rest = source
    .replace(inline[0], "")
    .replace(supportsPattern, "")
    .replace(propertyPattern, "")
    .replace(/@utility\s+[\w-]+\s*\{[^{}]*\}/g, "")
    .replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  return { inline: inline[1]!, utilities, properties, keyframes, supports, classes, blocks: parseBlocks(rest) };
}

/** A keyframes rule, indented two spaces a level. */
function formatKeyframes(text: string): string {
  const name = /@keyframes\s+([\w-]+)/.exec(text)![1]!;
  const steps = [...text.slice(text.indexOf("{") + 1).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) =>
    rule(match[1]!.trim(), declarations(match[2]!), "  "),
  );
  return `@keyframes ${name} {\n${steps.join("\n")}\n}`;
}

const header = (lines: readonly string[]) => ["/*", ...lines.map((line) => (line ? ` * ${line}` : " *")), " */"].join("\n");

const LICENSE = "Ouro HX, MIT License: https://github.com/ourostack/ouro-ui/blob/main/LICENSE";
const GENERATED = "Generated by site/scripts/static-css.mts. Don't edit; run it again.";
const MODES = [
  "Dark mode: a .dark class on <html> as in shadcn, or, with neither .light nor .dark there,",
  "the system's setting (prefers-color-scheme).",
];

/** ouro-base.css as plain CSS: its @theme inline aliases become :root properties, and its Tailwind utilities are left out. */
export function baseCss(css: string): string {
  const { inline, utilities, properties, keyframes, supports, classes, blocks } = splitBase(css);
  const root = blocks.find((block) => block.selector === ":root");
  if (!root) throw new Error("ouro-base.css has no :root block");
  const merged = blocks.map((block) => (block === root ? { selector: ":root", body: `${inline};${block.body}` } : block));
  return [
    header([
      "Ouro HX base tokens as plain CSS, for a page without Tailwind: radii, status colors,",
      "motion durations and easings, the overlay layer, and the ouro-* keyframes. Load it with a",
      "theme (ouro-theme.css or themes/<name>.css), and ouro-plain.css for the classes that give plain",
      "markup Ouro's states.",
      `Tailwind utilities left out: ${utilities.join(", ")}.`,
      ...MODES,
      `From registry/ouro/theme/ouro-base.css. ${GENERATED}`,
      LICENSE,
    ]),
    plainBlocks(merged),
    ...classes,
    ...supports,
    ...properties,
    ...keyframes.map(formatKeyframes),
  ].join("\n\n") + "\n";
}

/** ouro-plain.css as plain CSS: its tokens, with the system's dark mode, and its classes for markup that is not an Ouro component. */
export function plainCss(css: string): string {
  const { classes, rest } = plainClasses(css.replace(/\/\*[\s\S]*?\*\//g, ""));
  return [
    header([
      "Ouro HX's states as classes for plain markup, for a page without Tailwind: the focus ring",
      "(.ouro-focus-ring, -inset, -within), a linked row (.ouro-row), a disclosure (.ouro-disclosure),",
      "a skip link and its target (.ouro-skip-link, .ouro-focus-target), what shows on hover or focus",
      "(.ouro-reveal, .ouro-reveal-host), current links (.ouro-nav-link), toggles (.ouro-toggle),",
      "segmented choices (.ouro-segmented, .ouro-segment) and options (.ouro-option). Load it after",
      "ouro-base.css and a theme.",
      ...MODES,
      `From registry/ouro/theme/ouro-plain.css. ${GENERATED}`,
      LICENSE,
    ]),
    plainBlocks(parseBlocks(rest)),
    ...classes,
  ].join("\n\n") + "\n";
}

/** ouro-theme.css, Ouro HX's default shadcn theme, with the system's dark mode. */
export function themeCss(css: string): string {
  return [
    header([
      "Ouro HX's default theme as plain CSS: shadcn/ui's tokens (--background, --primary, --chart-1",
      "and the rest) in light and dark. Load ouro-base.css with it.",
      ...MODES,
      `From registry/ouro/theme/ouro-theme.css. ${GENERATED}`,
      LICENSE,
    ]),
    plainBlocks(parseBlocks(css)),
  ].join("\n\n") + "\n";
}

/** A site preset as plain CSS, with @font-face rules for its fonts at the fonts beside it. */
export function presetCss(preset: Preset, css: string, fonts: readonly Font[]): string {
  const sans = fonts.find((font) => font.role === "sans")!;
  const mono = fonts.find((font) => font.role === "mono")!;
  const heading = fonts.find((font) => font.family === preset.heading);
  if (!heading) throw new Error(`fonts.json has no "${preset.heading}"`);
  const used = [...new Set([sans, mono, heading])];
  const blocks = parseBlocks(css);
  const root = blocks.find((block) => block.selector.split(",").map((part) => part.trim()).includes(":root"));
  if (!root) throw new Error(`${preset.name}.css has no :root block`);
  const families = { selector: ":root", body: `--font-sans: ${stack(sans)}; --font-mono: ${stack(mono)};` };
  return [
    header([
      `Ouro HX "${preset.label}" theme as plain CSS: ${preset.mood.toLowerCase()}. shadcn/ui's tokens,`,
      "--font-sans, --font-mono, --font-heading and the --shadow-* scale, in light and dark. Load",
      `ouro-base.css with it. Preview: ${SITE}/`,
      ...MODES,
      `Fonts: ${used.map((font) => font.family).join(", ")}, from ../../fonts/ (SIL Open Font License; LICENSE.txt there).`,
      `From site/src/themes/${preset.name}.css. ${GENERATED}`,
      LICENSE,
    ]),
    ...used.map((font) => fontFace(font, FONTS_FROM_THEMES)),
    plainBlocks([families, ...blocks]),
  ].join("\n\n") + "\n";
}

/** Every file this writes, by its path under site/public/css/. */
export function build(
  readTheme: (file: string) => string = (file) => readFileSync(join(themeDir, file), "utf8"),
  readPreset: (file: string) => string = (file) => readFileSync(join(themesDir, file), "utf8"),
  fonts: readonly Font[] = readFonts(),
): Record<string, string> {
  const outputs: Record<string, string> = {
    "ouro-base.css": baseCss(readTheme("ouro-base.css")),
    "ouro-plain.css": plainCss(readTheme("ouro-plain.css")),
    "ouro-theme.css": themeCss(readTheme("ouro-theme.css")),
  };
  for (const preset of presets) outputs[`themes/${preset.name}.css`] = presetCss(preset, readPreset(`${preset.name}.css`), fonts);
  return outputs;
}

function main(args: string[]): void {
  const check = args.includes("--check");
  const problems: string[] = [];
  for (const [file, text] of Object.entries(build())) {
    const path = join(outDir, file);
    let current = "";
    try {
      current = readFileSync(path, "utf8");
    } catch {
      // A missing file is stale.
    }
    if (current === text) continue;
    if (check) problems.push(`site/public/css/${file} is stale; run node site/scripts/static-css.mts`);
    else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    }
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(check ? "static CSS is current" : "wrote site/public/css/");
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
