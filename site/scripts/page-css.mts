// A page's own Tailwind build scans only what the page can render. site/src/styles.css scans every
// registry component and every site file, because the docs show them all. Two stylesheets leave
// out, with `@source not`, what their pages never render, from the same import graph:
//
// - The voyage (site/src/voyage/voyage-tailwind.css) leaves out each registry component, each source
//   file of a component it does render, and each part of the site the voyage's graph never reaches.
// - The docs' shell (site/src/docs/shell.css), which every docs page links once, leaves out what
//   the docs' entry and page modules never reach. A component's own page adds its demo's classes
//   inline (site/scripts/docs-css.mts); the components index and the live demo page link styles.css.
//
//   node site/scripts/page-css.mts           writes both generated lists
//   node site/scripts/page-css.mts --check   fails when either is stale (site:build runs it)
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const site = join(repo, "site/src");
const components = join(repo, "registry/ouro/components/ouro");
const registry = join(repo, "registry/ouro");
const output = join(site, "voyage/voyage-sources.generated.css");
const docsShellOutput = join(site, "docs/shell-sources.generated.css");
const docsEntries = ["entry-client.tsx", "pages/docs.tsx"].map((file) => join(site, file));

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

/** The generated stylesheet at `file`: one `@source not` per path, relative to that file. */
export function render(paths: string[], file: string, header: string[]): string {
  const lines = paths.map((path) => `@source not "${relative(dirname(file), path).replaceAll("\\", "/")}";`);
  return [...header.map((line) => `/* ${line} */`), ...lines, ""].join("\n");
}

export function generate(): string {
  const page = join(site, "pages/voyage.tsx");
  return render(
    unreached(reachable([join(site, "entry-client.tsx"), page], page)),
    output,
    ["Generated by site/scripts/page-css.mts from the voyage's import graph. Do not edit.", "What the voyage page never renders, so its Tailwind build (voyage-tailwind.css) scans none of it."],
  );
}

/** The docs' shell: what no docs page's shared stylesheet renders (the docs' entry and page modules, not their demos). */
export function generateDocsShell(): string {
  return render(
    unreached(reachable(docsEntries, docsEntries[1]!)),
    docsShellOutput,
    [
      "Generated by site/scripts/page-css.mts from the docs' import graph (entry-client.tsx and pages/docs.tsx). Do not edit.",
      "What no docs page's shell renders, so its Tailwind build (shell.css) scans none of it. A component's demo adds its own classes inline.",
    ],
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputs = [
    ["site/src/voyage/voyage-sources.generated.css", output, generate()],
    ["site/src/docs/shell-sources.generated.css", docsShellOutput, generateDocsShell()],
  ] as const;
  if (process.argv.includes("--check")) {
    for (const [name, file, css] of outputs) {
      if (!existsSync(file) || readFileSync(file, "utf8") !== css) {
        console.error(`${name} is stale: run node site/scripts/page-css.mts and commit it.`);
        process.exit(1);
      }
    }
    console.log("the voyage's and the docs' CSS sources are current");
  } else {
    for (const [, file, css] of outputs) writeFileSync(file, css);
    console.log(`wrote ${outputs.map(([, file]) => relative(repo, file)).join(" and ")}`);
  }
}
