// The voyage page's own Tailwind build scans only what the page can render. site/src/styles.css
// scans every registry component and every site file, for the docs, which show them all; the
// voyage's stylesheet (site/src/voyage/voyage-tailwind.css) imports it and leaves out, with
// `@source not`, each registry component, each source file of a component it does render, and each
// part of the site that the voyage's import graph never reaches, islands included. This script follows that graph from site/src/pages/voyage.tsx
// and writes the list:
//
//   node site/scripts/page-css.mts           writes site/src/voyage/voyage-sources.generated.css
//   node site/scripts/page-css.mts --check   fails when that file is stale (site:build runs it)
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const site = join(repo, "site/src");
const components = join(repo, "registry/ouro/components/ouro");
const registry = join(repo, "registry/ouro");
const output = join(site, "voyage/voyage-sources.generated.css");

/** Every module specifier a source file names: static imports, re-exports, side-effect imports and dynamic imports. */
export function specifiers(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/\b(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g)) found.add(match[1]!);
  for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) found.add(match[1]!);
  return [...found];
}

const EXTENSIONS = ["", ".tsx", ".ts", ".mts", "/index.tsx", "/index.ts"];

/** The file a specifier names from `from`, or undefined for a package, a virtual module or a missing file. */
function resolveSpecifier(specifier: string, from: string): string | undefined {
  const path = specifier.replace(/\?.*$/, "");
  let base: string;
  if (path.startsWith("@/")) base = join(repo, path.slice(2));
  else if (path.startsWith(".")) base = resolve(dirname(from), path);
  else return undefined;
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

const inside = (file: string, dir: string) => file === dir || file.startsWith(`${dir}/`);
const children = (dir: string) => readdirSync(dir).sort().map((name) => join(dir, name));

/**
 * Every file the voyage's module graph reaches, dynamic imports included: from the client entry
 * (which renders the page) and the page module, but not into the other pages' modules, which the
 * entry imports only to render those pages.
 */
export function reachable(entries: string[], page: string): Set<string> {
  const seen = new Set<string>();
  const pages = join(site, "pages");
  const visit = (file: string) => {
    if (seen.has(file)) return;
    if (inside(file, pages) && file !== page) return;
    seen.add(file);
    if (!/\.(tsx?|mts)$/.test(file)) return;
    for (const specifier of specifiers(readFileSync(file, "utf8"))) {
      const target = resolveSpecifier(specifier, file);
      if (target) visit(target);
    }
  };
  for (const entry of entries) visit(entry);
  return seen;
}


/** What the voyage never renders: the registry components, registry folders and site parts its graph does not reach. */
export function unreached(files: Set<string>): string[] {
  const reachedAny = (dir: string) => [...files].some((file) => inside(file, dir));
  const left: string[] = [];
  // A component the voyage renders is followed into, so a part of it the voyage never imports (a
  // sibling component in the same folder, a part only other layouts use) adds none of its classes.
  const sourceOnly = (path: string) => /\.tsx?$/.test(path) && !/\.(test|stories|test-d)\.tsx?$/.test(path);
  const within = (dir: string) => {
    for (const path of children(dir)) {
      if (statSync(path).isDirectory()) {
        if (!reachedAny(path)) left.push(path);
        else within(path);
      } else if (sourceOnly(path) && !files.has(path)) left.push(path);
    }
  };
  for (const dir of children(components)) {
    if (!statSync(dir).isDirectory()) continue;
    if (!reachedAny(dir)) left.push(dir);
    else within(dir);
  }
  for (const dir of children(registry)) {
    if (dir === components || !statSync(dir).isDirectory()) continue;
    if (!reachedAny(dir)) left.push(dir);
  }
  // The site, folder by folder: a folder the graph partly reaches is followed into.
  const walk = (dir: string) => {
    for (const path of children(dir)) {
      if (/\.(test|stories)\.tsx?$/.test(path) || /\.css$/.test(path)) continue;
      if (!reachedAny(path)) left.push(path);
      else if (statSync(path).isDirectory()) walk(path);
    }
  };
  walk(site);
  return left;
}

/** The generated stylesheet: one `@source not` per path, relative to the file. */
export function render(paths: string[]): string {
  const lines = paths.map((path) => `@source not "${relative(dirname(output), path).replaceAll("\\", "/")}";`);
  return [
    "/* Generated by site/scripts/page-css.mts from the voyage's import graph. Do not edit. */",
    "/* What the voyage page never renders, so its Tailwind build (voyage-tailwind.css) scans none of it. */",
    ...lines,
    "",
  ].join("\n");
}

export function generate(): string {
  const page = join(site, "pages/voyage.tsx");
  return render(unreached(reachable([join(site, "entry-client.tsx"), page], page)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const css = generate();
  if (process.argv.includes("--check")) {
    if (readFileSync(output, "utf8") !== css) {
      console.error("site/src/voyage/voyage-sources.generated.css is stale: run node site/scripts/page-css.mts and commit it.");
      process.exit(1);
    }
    console.log("the voyage's CSS sources are current");
  } else {
    writeFileSync(output, css);
    console.log(`wrote ${relative(repo, output)}`);
  }
}
