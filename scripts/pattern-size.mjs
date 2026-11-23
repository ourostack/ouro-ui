// What installing a page pattern adds to an app, in gzip bytes of JavaScript and CSS: the pattern and the registry
// closure `shadcn add` brings with it, built as an app builds them (Vite, React, Tailwind v4 with ouro-base and the
// Ouro theme), less a bare app with the same stylesheet that renders one paragraph. Each app is a build of its own,
// so no chunk is shared between them, and its files carry no content hash, so a build measures the same every time.
//
//   node scripts/pattern-size.mjs            measure every pattern against its ceiling (CEILINGS)
//   node scripts/pattern-size.mjs --record   measure, and write what each pattern's JavaScript is made of to
//                                            scripts/pattern-size.json, which names what grew when one is over
//   node scripts/pattern-size.mjs --out dir  build each app in dir/<name>/ (its build in dir/<name>/dist/, to serve)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prefix = "ourostack/ouro-ui/";

/**
 * What each pattern may add over the bare app, gzip bytes: its measurement when the ceiling was set, plus 1 KiB of
 * JavaScript and 512 bytes of CSS, so a change that grows a pattern by more fails and names what grew. Raise a ceiling
 * only with the reason and the new measurement in a comment here, and run --record with it.
 */
// Set 2026-11-18 over main at 0e124635, from a bare app of 67,836 bytes of JavaScript and 3,619 of CSS. Before minifying,
// about two thirds of what list-detail-page and settings-page add is Base UI and Floating UI (ColorSchemeToggle's Menu
// in all three, Select in settings-page). dashboard-page's lowered 2026-11-18 from 190,829 and 10,161, once Chart drew
// its own marks and stopped loading Recharts.
// JavaScript ceilings raised 2026-11-20 (the disabledReason prop): Button imports Tooltip for its reason, so Base UI's
// tooltip, Floating UI's helpers and the shared reason hook arrive with every page; measured over main at e37c6a4a4 with the
// same bare app, 85,116, 85,689 and 103,760 bytes of JavaScript.
// Every ceiling set again 2026-11-20, once the disabledReason prop (#2572) and Card's backdrop picture (#2628) merged
// side by side and settings-page's CSS went 26 bytes over: Button's reason tooltip and the backdrop's squircle clipping
// are new classes in every page that renders a Button or a Card. Measured by CI over main at f9d696b42 with the same bare
// app (main's run 44810561463, scripts 2/2), in JavaScript and CSS: 85,369 and 10,798; 85,796 and 9,731; 104,027 and 13,895.
// CSS ceilings lowered 2026-11-20 once Card's backdrop styles itself inline (#2643), so an app compiles none of it unless a
// card has a backdrop: measured with and without the change over the same main, settings-page's CSS fell 158 bytes and
// dashboard-page's 200.
// settings-page's JavaScript ceiling raised 2026-11-23 (#3151): many small, already-merged fixes each grew it a little
// since the 2026-11-20 baseline (Card's backdrop, disabledReason's tooltip, and forced-colours edges for Button, Dialog,
// Field, Menu, Select, SegmentedControl, Switch, Tooltip and TextField among others), so no one of them alone crossed its
// own pull request's budget; #3107 (cfc87eaf5), the plain Button and Popover forced-colours fix, was the commit whose
// small addition tipped the running total over the ceiling. Measured by CI over main at cfc87eaf5 (main's run 45146865070,
// scripts 2/2): 105,063 bytes of JavaScript, 13,990 of CSS (CSS stays under its own ceiling, so only JavaScript moves).
export const CEILINGS = {
  "dashboard-page": { js: 85_369 + 1024, css: 10_598 + 512 },
  "list-detail-page": { js: 85_796 + 1024, css: 9_731 + 512 },
  "settings-page": { js: 105_063 + 1024, css: 13_737 + 512 },
};

/**
 * The most one pull request may add to what a pattern adds, gzip bytes: on a pull request the size check judges that
 * pull request's growth over its base (scripts/size-gate.mjs), and a ceiling is enforced on main.
 */
export const BUDGET = { js: 1024, css: 512 };

/** Each pattern's JavaScript and CSS as the size gate reads them, with its ceiling and budget. */
export function patternSizes(results, ceilings = CEILINGS) {
  const sizes = {};
  for (const [name, result] of Object.entries(results)) {
    if (name === BARE || !ceilings[name]) continue;
    sizes[`${name} JavaScript`] = { bytes: result.addedJs, ceiling: ceilings[name].js, budget: BUDGET.js };
    sizes[`${name} CSS`] = { bytes: result.addedCss, ceiling: ceilings[name].css, budget: BUDGET.css };
  }
  return sizes;
}

/** The name of the bare app, built beside the patterns. */
export const BARE = "bare-app";

/** The page patterns in a registry, by name. */
export function patternNames(registry) {
  return registry.items.filter((item) => (item.files ?? []).some((file) => file.path.startsWith("registry/ouro/patterns/"))).map((item) => item.name).toSorted();
}

/** The items `shadcn add` installs for an item: the item and every item it depends on, by name. */
export function closure(registry, name) {
  const items = new Map(registry.items.map((item) => [item.name, item]));
  const seen = new Set();
  const visit = (next) => {
    if (seen.has(next)) return;
    const item = items.get(next);
    if (!item) throw new Error(`${name} depends on ${next}, which is no item in registry.json.`);
    seen.add(next);
    for (const dependency of item.registryDependencies ?? []) {
      if (!dependency.startsWith(prefix)) throw new Error(`${next} depends on ${dependency}, which is not an Ouro item.`);
      visit(dependency.slice(prefix.length));
    }
  };
  visit(name);
  return [...seen].toSorted();
}

/** Each registry file, by its path in the repository, and the item that ships it. */
export function owners(registry) {
  return new Map(registry.items.flatMap((item) => (item.files ?? []).map((file) => [file.path, item.name])));
}

/** Who a built module belongs to: the app's own (its folder, `app`), its registry item, or its npm package. */
export function ownerOf(id, files, root = repo, app = null) {
  const path = id.replace(/^\0/, "").split("?")[0];
  // The app's folder first: --record builds it inside node_modules/.cache.
  if (app && path.startsWith(`${app}/`)) return "app";
  const inModules = path.lastIndexOf("/node_modules/");
  if (inModules >= 0) {
    const [scope, name] = path.slice(inModules + "/node_modules/".length).split("/");
    return scope.startsWith("@") ? `${scope}/${name}` : scope;
  }
  return files.get(relative(root, path)) ?? "app";
}

/**
 * The rendered bytes of a build's JavaScript by owner, largest first, leaving out the app's own entry and Vite's helpers:
 * no pattern grows them, and their size moves with the folder the app is built in.
 */
export function breakdown(chunks, files, root = repo, app = null) {
  const bytes = {};
  for (const chunk of chunks) {
    for (const [id, module] of Object.entries(chunk.modules)) {
      const owner = ownerOf(id, files, root, app);
      if (owner === "app") continue;
      bytes[owner] = (bytes[owner] ?? 0) + module.renderedLength;
    }
  }
  return Object.fromEntries(Object.entries(bytes).filter(([, size]) => size > 0).toSorted(([a, x], [b, y]) => y - x || a.localeCompare(b)));
}

/** The owners whose bytes rose since the breakdown was recorded, or that are new, by how much, most first. */
export function grew(recorded, now) {
  return Object.entries(now)
    .map(([owner, size]) => [owner, size - (recorded[owner] ?? 0)])
    .filter(([, rise]) => rise > 0)
    .toSorted(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([owner, rise]) => `${owner} +${rise}${owner in recorded ? "" : " (new)"}`);
}

/** The stylesheet an app has: app.css's, scanning only the given files. */
export function stylesheet(sources) {
  const css = readFileSync(join(repo, "app.css"), "utf8");
  if (!css.includes('@source "./registry";')) throw new Error('app.css no longer scans "./registry": update scripts/pattern-size.mjs to match it.');
  if (!css.includes('@import "tailwindcss" source(none);')) throw new Error('app.css no longer imports "tailwindcss" with source(none): update scripts/pattern-size.mjs to match it.');
  // From the repository, as the app's own folder may be outside it.
  return css
    .replace('@import "tailwindcss" source(none);', `@import "${repo}/node_modules/tailwindcss/index.css" source(none);`)
    .replaceAll('@import "./registry/', `@import "${repo}/registry/`)
    .replace('@source "./registry";', sources.map((source) => `@source "${source}";`).join("\n"));
}

/** The page a pattern's file exports. */
export function pageExport(source, file) {
  const pages = [...source.matchAll(/^export function (\w+Page)\b/gm)].map((match) => match[1]);
  if (pages.length !== 1) throw new Error(`${file} should export one page (a function named *Page), and exports ${pages.length}.`);
  return pages[0];
}

/** Builds one app in dir and measures it: gzip bytes of its JavaScript and CSS, and what its JavaScript is made of. */
export async function buildApp({ dir: where, entry, sources, files }) {
  const dir = resolve(where);
  const { build } = await import("vite");
  const { default: react } = await import("@vitejs/plugin-react");
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pattern</title></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>\n');
  writeFileSync(join(dir, "main.tsx"), entry);
  writeFileSync(join(dir, "index.css"), stylesheet([join(dir, "main.tsx"), ...sources.map((source) => join(repo, source))]));
  const output = await build({
    root: dir,
    configFile: false,
    logLevel: "silent",
    mode: "production",
    base: "./",
    plugins: [react(), tailwindcss()],
    // The app's entry may sit outside the repository (a test's scratch folder), so React resolves to the repository's.
    resolve: { alias: [{ find: /^@\//, replacement: `${repo}/` }, { find: /^(react|react-dom)(\/.*)?$/, replacement: `${repo}/node_modules/$1$2` }] },
    build: {
      outDir: join(dir, "dist"),
      emptyOutDir: true,
      reportCompressedSize: false,
      rolldownOptions: { output: { entryFileNames: "assets/[name].js", chunkFileNames: "assets/[name].js", assetFileNames: "assets/[name][extname]" } },
    },
  });
  const files_ = (Array.isArray(output) ? output : [output]).flatMap((result) => result.output);
  const chunks = files_.filter((file) => file.type === "chunk");
  const css = files_.filter((file) => file.type === "asset" && file.fileName.endsWith(".css"));
  return {
    js: chunks.reduce((sum, chunk) => sum + gzipSync(chunk.code).byteLength, 0),
    css: css.reduce((sum, sheet) => sum + gzipSync(sheet.source).byteLength, 0),
    modules: breakdown(chunks, files, repo, dir),
  };
}

/** Measures the bare app and every pattern, each built in work/<name>/. */
export async function measureAll({ registry, work }) {
  const files = owners(registry);
  const results = {};
  const bare = await buildApp({
    dir: join(work, BARE),
    entry: 'import { createRoot } from "react-dom/client";\nimport "./index.css";\n\ncreateRoot(document.getElementById("root")!).render(<p>Bare</p>);\n',
    sources: [],
    files,
  });
  results[BARE] = bare;
  for (const name of patternNames(registry)) {
    const file = `registry/ouro/patterns/${name}/${name}.tsx`;
    const page = pageExport(readFileSync(join(repo, file), "utf8"), file);
    const sources = closure(registry, name).flatMap((item) => (registry.items.find((entry) => entry.name === item).files ?? []).map((entry) => entry.path));
    const app = await buildApp({
      dir: join(work, name),
      entry: `import { createRoot } from "react-dom/client";\nimport "./index.css";\nimport { ${page} } from "@/${file.replace(/\.tsx$/, "")}";\n\ncreateRoot(document.getElementById("root")!).render(<${page} />);\n`,
      sources,
      files,
    });
    results[name] = { ...app, addedJs: app.js - bare.js, addedCss: app.css - bare.css };
  }
  return results;
}

/** Each pattern's verdict against its ceiling, with the owners that grew since its breakdown was recorded when it is over. */
export function judge(results, { ceilings = CEILINGS, modules = {} } = {}) {
  return Object.entries(results)
    .filter(([name]) => name !== BARE)
    .map(([name, result]) => {
      const ceiling = ceilings[name];
      if (!ceiling) return { name, ok: false, message: `${name} has no ceiling: add one to CEILINGS in scripts/pattern-size.mjs (its measurement plus the margin, with why), and run node scripts/pattern-size.mjs --record.` };
      const over = [];
      if (result.addedJs > ceiling.js) over.push(`JavaScript ${result.addedJs} of ${ceiling.js}`);
      if (result.addedCss > ceiling.css) over.push(`CSS ${result.addedCss} of ${ceiling.css}`);
      const line = `${name} adds JavaScript ${result.addedJs} of ${ceiling.js} and CSS ${result.addedCss} of ${ceiling.css} gzip bytes`;
      if (over.length === 0) return { name, ok: true, message: line };
      const rose = grew(modules[name] ?? {}, result.modules);
      return { name, ok: false, message: `${line}: over in ${over.join(" and ")}. What its JavaScript gained since the ceiling was set, in bytes before minifying: ${rose.join(", ") || "nothing; its CSS is the classes its closure's files use"}.` };
    });
}

/** The breakdown recorded when the ceilings were set. */
export const recordedFile = join(repo, "scripts/pattern-size.json");

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const out = args.includes("--out") ? resolve(args[args.indexOf("--out") + 1]) : join(repo, "node_modules/.cache/pattern-size");
  const registry = JSON.parse(readFileSync(join(repo, "registry.json"), "utf8"));
  const results = await measureAll({ registry, work: out });
  console.log(`${BARE}: JavaScript ${results[BARE].js}, CSS ${results[BARE].css} gzip bytes`);
  const modules = Object.fromEntries(Object.entries(results).filter(([name]) => name !== BARE).map(([name, result]) => [name, result.modules]));
  if (args.includes("--record")) writeFileSync(recordedFile, `${JSON.stringify(modules, null, 2)}\n`);
  const verdicts = judge(results, { modules: JSON.parse(readFileSync(recordedFile, "utf8")) });
  for (const { ok, message } of verdicts) console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (verdicts.some((verdict) => !verdict.ok)) process.exit(1);
}
