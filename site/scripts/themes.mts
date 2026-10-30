// The site's theme presets, from site/src/themes/<preset>.css (plain shadcn/ui themes: :root and
// .dark) and site/src/themes/fonts.json (the self-hosted fonts in site/public/fonts):
//
//   node site/scripts/themes.mts            writes site/src/themes/presets.generated.css (each
//                                           preset scoped to [data-theme="<preset>"], with the
//                                           fonts' @font-face rules) and themes.json (each
//                                           preset's "Copy theme" and "Copy tokens only" CSS)
//   node site/scripts/themes.mts --check    fails when either is stale, a font's checksum or
//                                           budget is off, or cookbook.css's synced part was edited
//   node site/scripts/themes.mts sync-cookbook <spoonjoy-v2 checkout>
//                                           copies Spoonjoy's token blocks from its
//                                           app/styles/tailwind.css into cookbook.css, recording
//                                           the commit and the blocks' checksum
//   node site/scripts/themes.mts --check --upstream <spoonjoy-v2 checkout>
//                                           also fails when that checkout's blocks differ
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const themesDir = join(repo, "site/src/themes");
const fontsDir = join(repo, "site/public/fonts");

/** Where Pages serves the site; "Copy theme" CSS points at the fonts there. */
export const SITE = "https://ui.ouro.bot";

export interface Font {
  family: string;
  file: string;
  package: string;
  version: string;
  source: string;
  weight: string;
  fallback: string;
  role: "sans" | "mono" | "display";
  preload: boolean;
  modifications: string;
  licence: string;
  bytes: number;
  sha256: string;
}

export interface Preset {
  name: string;
  label: string;
  /** One line for the picker. */
  mood: string;
  /** The display face, from fonts.json. */
  heading: string;
}

/** The six presets, in the order the picker shows them. Sleek is the default. */
export const presets: readonly Preset[] = [
  { name: "sleek", label: "Sleek", mood: "Cool greys, glass and ink", heading: "Geist" },
  { name: "abyss", label: "Abyss", mood: "Pale aqua, then a cyan glow in the dark", heading: "Space Grotesk" },
  { name: "brass", label: "Brass", mood: "Ivory, walnut and polished brass", heading: "Cormorant Garamond" },
  { name: "chart", label: "Chart", mood: "Parchment and ink, like a sea chart", heading: "Chart Fell" },
  { name: "coral", label: "Coral", mood: "Warm sand, kelp and coral", heading: "Nunito" },
  { name: "cookbook", label: "Cookbook", mood: "Spoonjoy's own look, synced from the app", heading: "Fraunces" },
];

/** Budgets from the site design: the preloaded sans and mono together, and each display face. */
export const FONT_BUDGET = { preloaded: 90 * 1024, face: 40 * 1024 };

/** Fontsource's Latin unicode-range, which every file here is a subset of. */
const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

export const readFonts = (): Font[] => JSON.parse(readFileSync(join(themesDir, "fonts.json"), "utf8")) as Font[];

const fontNamed = (fonts: readonly Font[], family: string): Font => {
  const font = fonts.find((candidate) => candidate.family === family);
  if (!font) throw new Error(`fonts.json has no "${family}"`);
  return font;
};

/** A CSS font-family list: the face, then its fallbacks. */
export const stack = (font: Font): string => `"${font.family}", ${font.fallback}`;

/** One @font-face rule. `base` is "" for the site (Vite adds its base) or the site's address for copied CSS. */
export function fontFace(font: Font, base: string): string {
  return [
    "@font-face {",
    `  font-family: "${font.family}";`,
    "  font-style: normal;",
    "  font-display: swap;",
    `  font-weight: ${font.weight};`,
    `  src: url("${base}/fonts/${font.file}") format("woff2");`,
    `  unicode-range: ${LATIN};`,
    "}",
  ].join("\n");
}

export interface Block {
  selector: string;
  body: string;
}

/** The top-level rules of a theme file (no nesting), without comments. */
export function parseBlocks(css: string): Block[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: Block[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of source.matchAll(pattern)) {
    blocks.push({ selector: match[1]!.trim().replace(/\s+/g, " "), body: match[2]! });
  }
  const rest = source.replace(pattern, "").trim();
  if (rest) throw new Error(`Unparsed theme CSS: ${rest.slice(0, 80)}`);
  return blocks;
}

/** The declarations of a block, one per line, as written. */
export const declarations = (body: string): string[] =>
  body
    .split(";")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean);

/** The selector a theme's block gets on the site: `:root` is the preset's light values, `.dark` its dark ones. */
export function scopeSelector(selector: string, name: string): string {
  const scope = `[data-theme="${name}"]`;
  return selector
    .split(",")
    .map((part) => part.trim())
    .flatMap((part) => {
      if (part === ":root") return [scope];
      if (part === ".dark") return [`.dark${scope}`, `.dark ${scope}`];
      throw new Error(`A theme block may only be :root or .dark, not "${part}"`);
    })
    .join(",\n");
}

const rule = (selector: string, lines: readonly string[]) => `${selector} {\n${lines.map((line) => `  ${line};`).join("\n")}\n}`;

/** shadcn's mapping, as `shadcn init` writes it, so copied CSS works in an app that lacks it. */
const THEME_INLINE = [
  "--color-background: var(--background)",
  "--color-foreground: var(--foreground)",
  "--color-card: var(--card)",
  "--color-card-foreground: var(--card-foreground)",
  "--color-popover: var(--popover)",
  "--color-popover-foreground: var(--popover-foreground)",
  "--color-primary: var(--primary)",
  "--color-primary-foreground: var(--primary-foreground)",
  "--color-secondary: var(--secondary)",
  "--color-secondary-foreground: var(--secondary-foreground)",
  "--color-muted: var(--muted)",
  "--color-muted-foreground: var(--muted-foreground)",
  "--color-accent: var(--accent)",
  "--color-accent-foreground: var(--accent-foreground)",
  "--color-destructive: var(--destructive)",
  "--color-border: var(--border)",
  "--color-input: var(--input)",
  "--color-ring: var(--ring)",
  "--color-chart-1: var(--chart-1)",
  "--color-chart-2: var(--chart-2)",
  "--color-chart-3: var(--chart-3)",
  "--color-chart-4: var(--chart-4)",
  "--color-chart-5: var(--chart-5)",
  "--color-sidebar: var(--sidebar)",
  "--color-sidebar-foreground: var(--sidebar-foreground)",
  "--color-sidebar-primary: var(--sidebar-primary)",
  "--color-sidebar-primary-foreground: var(--sidebar-primary-foreground)",
  "--color-sidebar-accent: var(--sidebar-accent)",
  "--color-sidebar-accent-foreground: var(--sidebar-accent-foreground)",
  "--color-sidebar-border: var(--sidebar-border)",
  "--color-sidebar-ring: var(--sidebar-ring)",
  "--radius-sm: calc(var(--radius) * 0.6)",
  "--radius-md: calc(var(--radius) * 0.8)",
  "--radius-lg: var(--radius)",
  "--radius-xl: calc(var(--radius) * 1.4)",
];

export interface BuiltPreset extends Preset {
  radius: string;
  fonts: string[];
  css: { theme: string; tokens: string };
}

/** A preset's fonts: the site's sans and mono, and its display face. */
function presetFonts(fonts: readonly Font[], preset: Preset): Font[] {
  const sans = fonts.find((font) => font.role === "sans")!;
  const mono = fonts.find((font) => font.role === "mono")!;
  const heading = fontNamed(fonts, preset.heading);
  return [...new Set([sans, mono, heading])];
}

/** One preset: its scoped site rules and its copied CSS. */
export function buildPreset(preset: Preset, css: string, fonts: readonly Font[]): { site: string; built: BuiltPreset } {
  const blocks = parseBlocks(css);
  const root = blocks.find((block) => block.selector.split(",").map((part) => part.trim()).includes(":root"));
  if (!root) throw new Error(`${preset.name}.css has no :root block`);
  const all = blocks.flatMap((block) => declarations(block.body));
  const heading = all.find((line) => line.startsWith("--font-heading:"));
  if (!heading?.includes(preset.heading) && !heading?.includes("var(--font-sj-display)")) {
    throw new Error(`${preset.name}.css must set --font-heading to "${preset.heading}"`);
  }
  if (!all.some((line) => /^--radius:/.test(line))) throw new Error(`${preset.name}.css must set --radius`);
  const used = presetFonts(fonts, preset);
  const sans = used.find((font) => font.role === "sans")!;
  const mono = used.find((font) => font.role === "mono")!;
  const radius = all.find((line) => line.startsWith("--radius:"))!.slice("--radius:".length).trim();

  const site = blocks
    .map((block) => {
      const lines = declarations(block.body);
      const extra = block === root ? [`--font-sans: ${stack(sans)}`, `--font-mono: ${stack(mono)}`] : [];
      return rule(scopeSelector(block.selector, preset.name), [...lines, ...extra]);
    })
    .join("\n\n");

  const header = (withFonts: boolean) =>
    [
      "/*",
      ` * Ouro HX "${preset.label}" theme, in shadcn/ui's standard tokens: ${preset.mood.toLowerCase()}.`,
      ` * From ${SITE}/. Paste it at the end of your global CSS, after the Tailwind import and`,
      " * your current theme: its :root, .dark and @theme inline values take over. Ouro HX components",
      " * also need ouro-base: npx shadcn@latest add ourostack/ouro-ui/ouro-base",
      withFonts
        ? ` * The fonts are served from ${SITE}/fonts/ (SIL Open Font License; LICENSE.txt there).`
        : ` * Fonts are not included: install ${used.map((font) => font.family).join(", ")}, or keep your own.`,
      " */",
    ].join("\n");
  const themeBlocks = blocks.map((block) => rule(block.selector, declarations(block.body))).join("\n\n");
  const inline = rule("@theme inline", [`--font-sans: ${stack(sans)}`, `--font-mono: ${stack(mono)}`, ...THEME_INLINE]);
  const faces = used.map((font) => fontFace(font, SITE)).join("\n\n");
  return {
    site,
    built: {
      ...preset,
      radius,
      fonts: used.map((font) => font.family),
      css: {
        theme: [header(true), faces, themeBlocks, inline].join("\n\n") + "\n",
        tokens: [header(false), themeBlocks, inline].join("\n\n") + "\n",
      },
    },
  };
}

export const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

/** Every check on the font files: present, unchanged, OFL, and within budget. */
export function checkFonts(fonts: readonly Font[], read: (file: string) => Buffer = (file) => readFileSync(join(fontsDir, file))): string[] {
  const problems: string[] = [];
  let preloaded = 0;
  for (const font of fonts) {
    if (!/^[a-z0-9-]+-\d+\.\d+\.\d+\.woff2$/.test(font.file)) problems.push(`${font.file}: name it <family>-<version>.woff2`);
    if (!font.file.endsWith(`-${font.version}.woff2`)) problems.push(`${font.file}: its name must carry version ${font.version}`);
    if (font.licence !== "OFL-1.1") problems.push(`${font.file}: licence ${font.licence} is not OFL-1.1`);
    let bytes: Buffer;
    try {
      bytes = read(font.file);
    } catch {
      problems.push(`${font.file}: missing from site/public/fonts`);
      continue;
    }
    if (sha256(bytes) !== font.sha256) problems.push(`${font.file}: checksum differs from fonts.json`);
    if (bytes.byteLength !== font.bytes) problems.push(`${font.file}: ${bytes.byteLength} bytes, fonts.json says ${font.bytes}`);
    if (font.preload) preloaded += bytes.byteLength;
    else if (bytes.byteLength > FONT_BUDGET.face) problems.push(`${font.file}: ${bytes.byteLength} bytes is over the ${FONT_BUDGET.face}-byte face budget`);
  }
  if (preloaded > FONT_BUDGET.preloaded) problems.push(`preloaded fonts: ${preloaded} bytes is over the ${FONT_BUDGET.preloaded}-byte budget`);
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Cookbook: Spoonjoy's tokens, synced.

const SYNC_START = "/* synced from Spoonjoy: begin */";
const SYNC_END = "/* synced from Spoonjoy: end */";

/**
 * What the site adds for the variables Spoonjoy does not define (it has no --card, --chart-*,
 * --sidebar-*, --font-heading or --shadow-* of shadcn's names, and no --ouro-action), each mapped
 * onto Spoonjoy's own palette so the preset still follows its .dark. --ouro-action and its
 * foreground give the primary Button Spoonjoy's charcoal action (amber in the dark) while its
 * selection stays brass (--primary).
 */
const COOKBOOK_ADDITIONS = [
  "--card: var(--sj-panel-solid)",
  "--card-foreground: var(--sj-ink)",
  "--chart-1: var(--sj-brass)",
  "--chart-2: var(--sj-herb)",
  "--chart-3: var(--sj-brass)",
  "--chart-4: var(--sj-tomato)",
  "--chart-5: var(--sj-ink-soft)",
  "--sidebar: var(--sj-page)",
  "--sidebar-foreground: var(--sj-ink)",
  "--sidebar-primary: var(--sj-brass)",
  "--sidebar-primary-foreground: var(--sj-paper)",
  "--sidebar-accent: var(--sj-flour)",
  "--sidebar-accent-foreground: var(--sj-ink)",
  "--sidebar-border: var(--sj-border)",
  "--sidebar-ring: var(--sj-brass)",
  "--font-heading: var(--font-sj-display)",
  "--shadow-xs: 0 1px 2px color-mix(in srgb, var(--sj-charcoal) 8%, transparent)",
  "--shadow-sm: 0 1px 3px color-mix(in srgb, var(--sj-charcoal) 10%, transparent)",
  "--shadow-md: var(--sj-shadow-soft)",
  "--shadow-lg: var(--sj-shadow-soft)",
  "--shadow-xl: var(--sj-shadow)",
  "--ouro-action: var(--sj-action)",
  "--ouro-action-foreground: var(--sj-on-action)",
];

/**
 * Spoonjoy's token blocks from its app/styles/tailwind.css, verbatim: the first :root block (its
 * fonts, the --sj-* palette and its copies of the Ouro tokens), the first .dark block, and the
 * `:root, .dark` block that maps shadcn's names onto the palette.
 */
export function extractSpoonjoy(css: string): string {
  const find = (selector: RegExp, from = 0) => {
    const rest = css.slice(from);
    const match = selector.exec(rest);
    if (!match) throw new Error(`Spoonjoy's tailwind.css has no ${selector} block`);
    const start = from + match.index;
    const end = css.indexOf("\n}", start);
    if (end === -1) throw new Error(`Spoonjoy's ${selector} block does not end`);
    return { text: css.slice(start, end + 2), end: end + 2 };
  };
  const root = find(/^:root \{$/m);
  const dark = find(/^\.dark \{$/m, root.end);
  const mapping = find(/^:root,\n\.dark \{$/m, dark.end);
  return [root.text, dark.text, mapping.text].join("\n\n");
}

/** cookbook.css from Spoonjoy's blocks and where they came from. */
export function cookbookCss(blocks: string, commit: string): string {
  return [
    "/*",
    " * Cookbook: Spoonjoy's own tokens, synced from spoonjoy/spoonjoy-v2's app/styles/tailwind.css at",
    ` * commit ${commit} by \`node site/scripts/themes.mts sync-cookbook <checkout>\`. Don't edit the`,
    " * synced part; CI checks its checksum. Spoonjoy defines no --card, --chart-*, --sidebar-*,",
    " * --font-heading or --shadow-* of shadcn's names and no --ouro-action, so the last block maps them",
    " * onto its palette.",
    ` * sha256 of the synced part: ${sha256(blocks)}`,
    " */",
    SYNC_START,
    blocks,
    SYNC_END,
    "",
    rule(":root,\n.dark", COOKBOOK_ADDITIONS),
    "",
  ].join("\n");
}

/** The synced part of cookbook.css and the checksum its header records. */
export function cookbookParts(css: string): { blocks: string; recorded: string | undefined; commit: string | undefined } {
  const start = css.indexOf(SYNC_START);
  const end = css.indexOf(SYNC_END);
  if (start === -1 || end === -1) throw new Error("cookbook.css has no synced part");
  return {
    blocks: css.slice(start + SYNC_START.length + 1, end - 1),
    recorded: /sha256 of the synced part: ([0-9a-f]{64})/.exec(css)?.[1],
    commit: /commit ([0-9a-f]{7,40})/.exec(css)?.[1],
  };
}

export function checkCookbook(css: string): string[] {
  const { blocks, recorded } = cookbookParts(css);
  if (recorded !== sha256(blocks)) return ["cookbook.css: its synced part differs from the Spoonjoy blocks it records; run sync-cookbook, never edit it"];
  return [];
}

// ---------------------------------------------------------------------------------------------

export interface Outputs {
  "presets.generated.css": string;
  "themes.json": string;
}

export function build(read: (file: string) => string = (file) => readFileSync(join(themesDir, file), "utf8")): Outputs {
  const fonts = readFonts();
  const built = presets.map((preset) => buildPreset(preset, read(`${preset.name}.css`), fonts));
  const css = [
    "/* Generated by site/scripts/themes.mts from site/src/themes/<preset>.css and fonts.json. Do not edit. */",
    ...fonts.map((font) => fontFace(font, "")),
    ...built.map((preset) => preset.site),
  ].join("\n\n");
  return {
    "presets.generated.css": `${css}\n`,
    "themes.json": `${JSON.stringify(built.map((preset) => preset.built), null, 2)}\n`,
  };
}

function main(args: string[]): void {
  if (args[0] === "sync-cookbook") {
    const checkout = args[1];
    if (!checkout) throw new Error("usage: themes.mts sync-cookbook <spoonjoy-v2 checkout>");
    const blocks = extractSpoonjoy(readFileSync(join(checkout, "app/styles/tailwind.css"), "utf8"));
    const commit = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    writeFileSync(join(themesDir, "cookbook.css"), cookbookCss(blocks, commit));
    console.log(`cookbook.css synced from spoonjoy-v2 ${commit.slice(0, 12)}`);
    args = [];
  }
  const check = args.includes("--check");
  const outputs = build();
  const problems = [...checkFonts(readFonts()), ...checkCookbook(readFileSync(join(themesDir, "cookbook.css"), "utf8"))];
  const upstream = args.indexOf("--upstream");
  if (upstream !== -1) {
    const checkout = args[upstream + 1]!;
    const theirs = extractSpoonjoy(readFileSync(join(checkout, "app/styles/tailwind.css"), "utf8"));
    if (theirs !== cookbookParts(readFileSync(join(themesDir, "cookbook.css"), "utf8")).blocks) {
      problems.push(`cookbook.css is behind ${checkout}; run sync-cookbook`);
    }
  }
  for (const [file, text] of Object.entries(outputs)) {
    const path = join(themesDir, file);
    let current: string;
    try {
      statSync(path);
      current = readFileSync(path, "utf8");
    } catch {
      current = "";
    }
    if (current === text) continue;
    if (check) problems.push(`${file} is stale; run node site/scripts/themes.mts`);
    else writeFileSync(path, text);
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(check ? "themes are current" : "wrote presets.generated.css and themes.json");
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
