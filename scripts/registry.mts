// Generates registry.json, the shadcn registry at the repository root, from registry/.
//
//   node scripts/registry.mts           write registry.json
//   node scripts/registry.mts --check   fail when registry.json is stale (CI); a released
//                                       registry.json (one with a version) is checked as released,
//                                       except on main or a pull request into it, where it fails
//   --out <file>                        write or check another file
//   --release <x.y.z>                   pin same-repo registryDependencies to the tag v<x.y.z> and
//                                       record the version (release.yml, on the release branch)
//   --deps <template>                   point same-repo registryDependencies at <template> with
//                                       {name} replaced: @ouro/{name} for the Pages build
//                                       (pages.yml), <dir>/{name}.json for the install test
//
// shadcn's CLI reads registry.json but has no way to make one: this script fills the
// gaps. It derives each item's files and targets from the folder layout, its
// registryDependencies and npm dependencies from the imports, its versions from this
// repository's package.json (the versions the tests ran against), the theme items'
// cssVars and css from registry/ouro/theme/*.css, and each description and docs
// message from the generated docs/<Component>.md.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const REPO = "ourostack/ouro-ui";
const DOCS_URL = "https://ourostack.github.io/ouro-ui/docs";

/** Components: item name, folder under registry/ouro/components/ouro/, file stem, docs page. */
const components = [
  { name: "button", folder: "button", stem: "button", title: "Button" },
  { name: "text", folder: "text", stem: "text", title: "Text" },
  { name: "heading", folder: "text", stem: "heading", title: "Heading" },
  { name: "sheet", folder: "sheet", stem: "sheet", title: "Sheet" },
  { name: "dialog", folder: "dialog", stem: "dialog", title: "Dialog" },
  { name: "confirm-dialog", folder: "dialog", stem: "confirm-dialog", title: "ConfirmDialog" },
];

/** Registry files that test this repository itself and never ship. */
const repoOnly = new Set(["registry/ouro/theme/theme.test.tsx"]);

/** Packages every app already has. */
const appPackages = new Set(["react", "react-dom"]);

/** Packages an import needs alongside it (peer dependencies). */
const companions: Record<string, string[]> = { "@storybook/react-vite": ["storybook"] };

/**
 * The files an app adds to run the shipped tests and specs, exactly as the ouro-testing
 * docs message prints them. test/install-fixture uses these files verbatim (the registry
 * test checks), so the install test proves the docs work.
 */
export const testingSetup: Record<string, string> = {
  "vitest.config.ts": [
    'import { defineConfig, mergeConfig } from "vitest/config";',
    'import viteConfig from "./vite.config.ts";',
    'import { ouroTestProjects } from "./src/lib/ouro/testing/vitest.ts";',
    "",
    'export default mergeConfig(viteConfig, defineConfig({ test: { projects: ouroTestProjects({ css: "./src/index.css" }) } }));',
    "",
  ].join("\n"),
  ".storybook/main.ts": 'export default { stories: ["../src/**/*.stories.@(ts|tsx)"], framework: "@storybook/react-vite" };\n',
  ".storybook/preview.ts": 'import "../src/index.css";\n',
  "playwright.config.ts": [
    'import { defineConfig, devices } from "@playwright/test";',
    "",
    "// Starts the app's Storybook, where Ouro UI's specs (e2e/ouro) open their stories.",
    "export default defineConfig({",
    '  testDir: "e2e",',
    "  projects: [",
    '    { name: "chromium", use: { ...devices["Desktop Chrome"] } },',
    '    { name: "webkit", use: { ...devices["Desktop Safari"] } },',
    "  ],",
    "  webServer: {",
    '    command: "npx storybook dev -p 6006 --ci --no-open",',
    '    url: "http://localhost:6006/iframe.html",',
    '    reuseExistingServer: !process.env["CI"],',
    "    timeout: 180_000,",
    "  },",
    "});",
    "",
  ].join("\n"),
};

function testingDocs(): string {
  const file = (path: string) => `--- ${path}\n${testingSetup[path]}`;
  return [
    "Ouro UI's tests are installed beside each component. To run the Vitest browser tests, add vitest.config.ts (use your components.json tailwind.css path for css), then run npx playwright install chromium webkit and npx vitest run:",
    file("vitest.config.ts"),
    "The end-to-end specs in e2e/ouro open the Ouro stories in a Storybook. If your app has none, add these two files (use your stylesheet in preview.ts):",
    file(".storybook/main.ts") + file(".storybook/preview.ts"),
    "If your app has no Playwright config, add this one, which starts that Storybook and runs Chromium and WebKit:",
    file("playwright.config.ts"),
    "Then run npx playwright test e2e/ouro. With a Playwright config of your own, start Storybook with npx storybook dev -p 6006 and run OURO_E2E_URL=http://localhost:6006 npx playwright test e2e/ouro.",
    `Docs: ${DOCS_URL}`,
  ].join("\n");
}

const foundation = [
  {
    name: "ouro-base",
    title: "Ouro base",
    css: "registry/ouro/theme/ouro-base.css",
    description:
      "What every Ouro UI component needs in the app's CSS: success and warning colors, a destructive foreground, the motion tokens, the press utility and the spinner keyframes.",
    docs: "Ouro UI's base tokens are in your CSS. Your theme's values win: edit them like any shadcn variable.",
  },
  {
    name: "ouro-theme",
    title: "Ouro theme",
    css: "registry/ouro/theme/ouro-theme.css",
    description: "Ouro UI's own look, as a shadcn theme for :root and .dark. Skip it to keep your app's theme.",
    docs: `The Ouro theme replaced your theme's colors in :root and .dark. Docs: ${DOCS_URL}`,
  },
  {
    name: "ouro-lib",
    title: "Ouro lib",
    description:
      "Shared helpers every Ouro UI component uses, in lib/ouro: cn, dev messages, the className check, announce, OuroProvider and hooks.",
    docs: `Ouro UI's helpers are in lib/ouro. OuroProvider is optional; it routes internal hrefs through your router's link. Docs: ${DOCS_URL}`,
  },
  {
    name: "ouro-testing",
    title: "Ouro testing",
    description:
      "The test kit Ouro UI's tests use: Vitest browser projects with the drag, flick, tap and emulateMedia commands, the act helper, and the end-to-end story helper.",
    docs: testingDocs(),
  },
];

type FileType = "registry:ui" | "registry:component" | "registry:lib" | "registry:file";
interface RegistryFile {
  path: string;
  type: FileType;
  target: string;
}
interface CssVars {
  light?: Record<string, string>;
  dark?: Record<string, string>;
  theme?: Record<string, string>;
}
type CssTree = { [key: string]: string | CssTree };
export interface RegistryItem {
  name: string;
  type: string;
  title: string;
  description: string;
  docs: string;
  dependencies?: string[];
  devDependencies?: string[];
  registryDependencies?: string[];
  files?: RegistryFile[];
  cssVars?: CssVars;
  css?: CssTree;
}
export interface Registry {
  $schema: string;
  name: string;
  homepage: string;
  version?: string;
  items: RegistryItem[];
}

const componentsDir = "registry/ouro/components/ouro/";
const libDir = "registry/ouro/lib/ouro/";
const testingDir = "registry/ouro/lib/ouro/testing/";
const e2eDir = "registry/ouro/e2e/ouro/";
const themeDir = "registry/ouro/theme/";

const devFile = /\.(test|touch\.test)\.tsx?$|\.test-d\.ts$|\.stories\.tsx$|\.spec\.ts$/;

/** The item that ships a registry file, or null for a repository-only file. Throws for a file no item claims. */
export function itemForFile(path: string): string | null {
  if (repoOnly.has(path)) return null;
  const file = path.split("/").at(-1)!;
  if (path.startsWith(themeDir)) {
    const css = foundation.find((entry) => entry.css === path);
    if (css) return css.name;
  } else if (path.startsWith(testingDir) || path === `${e2eDir}story.ts`) {
    return "ouro-testing";
  } else if (path.startsWith(libDir) && !path.slice(libDir.length).includes("/")) {
    return "ouro-lib";
  } else if (path.startsWith(e2eDir)) {
    const stem = file.replace(/\.spec\.ts$/, "");
    const component = components.find((entry) => entry.stem === stem);
    if (component && file.endsWith(".spec.ts")) return component.name;
  } else if (path.startsWith(componentsDir)) {
    const folder = path.slice(componentsDir.length).split("/")[0];
    const component = components.find(
      (entry) =>
        entry.folder === folder &&
        new RegExp(`^${entry.stem}(-parts)?\\.(tsx|test\\.tsx|touch\\.test\\.tsx|test-d\\.ts|stories\\.tsx)$`).test(file),
    );
    if (component) return component.name;
  }
  throw new Error(`${path}: no item ships this file. Add it to an item (or to repoOnly) in scripts/registry.mts.`);
}

function fileEntry(path: string): RegistryFile {
  const file = path.split("/").at(-1)!;
  if (path.startsWith(e2eDir)) return { path, type: "registry:file", target: `~/e2e/ouro/${file}` };
  if (path.startsWith(libDir)) return { path, type: "registry:lib", target: `@lib/ouro/${path.slice(libDir.length)}` };
  const target = `@components/ouro/${path.slice(componentsDir.length)}`;
  return { path, type: devFile.test(file) ? "registry:component" : "registry:ui", target };
}

/** Converts a theme CSS file to shadcn's item format: :root, .dark and @theme inline to cssVars, the rest to css. */
export function cssToItem(source: string): { cssVars: CssVars; css?: CssTree } {
  const cssVars: Required<CssVars> = { light: {}, dark: {}, theme: {} };
  const css: CssTree = {};
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  const declarations = (node: postcss.Container, where: string, customOnly: boolean) => {
    const out: Record<string, string> = {};
    node.each((child) => {
      if (child.type === "comment") return;
      if (child.type !== "decl") throw new Error(`${where}: only declarations are supported, found ${child.toString().split("\n")[0]}`);
      if (customOnly && !child.prop.startsWith("--")) throw new Error(`${where}: only custom properties are supported, found ${child.prop}`);
      out[customOnly ? child.prop.slice(2) : child.prop] = clean(child.value);
    });
    return out;
  };
  postcss.parse(source).each((node) => {
    if (node.type === "comment") return;
    if (node.type === "rule" && (node.selector === ":root" || node.selector === ".dark")) {
      Object.assign(cssVars[node.selector === ":root" ? "light" : "dark"], declarations(node, node.selector, true));
    } else if (node.type === "atrule" && node.name === "theme" && node.params === "inline") {
      Object.assign(cssVars.theme, declarations(node, "@theme inline", true));
    } else if (node.type === "atrule" && node.name === "utility") {
      css[`@utility ${node.params}`] = declarations(node, `@utility ${node.params}`, false);
    } else if (node.type === "atrule" && node.name === "keyframes") {
      const frames: CssTree = {};
      node.each((frame) => {
        if (frame.type === "rule") frames[frame.selector] = declarations(frame, `@keyframes ${node.params}`, false);
      });
      css[`@keyframes ${node.params}`] = frames;
    } else {
      const name = node.type === "atrule" ? `@${node.name}` : node.type === "rule" ? node.selector : node.type;
      throw new Error(`Unsupported CSS in a theme file: ${name}. shadcn items carry :root, .dark, @theme inline, @utility and @keyframes.`);
    }
  });
  const vars = Object.fromEntries(Object.entries(cssVars).filter(([, values]) => Object.keys(values).length > 0)) as CssVars;
  return Object.keys(css).length > 0 ? { cssVars: vars, css } : { cssVars: vars };
}

/** Bare and alias import specifiers in a source file. */
function importsOf(source: string): string[] {
  return [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]!);
}

function packageName(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("@/") || specifier.startsWith("node:")) return null;
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]!;
  return appPackages.has(name) ? null : name;
}

/** The registry file an `@/registry/...` import resolves to. */
function resolveRegistryImport(specifier: string, files: string[]): string {
  const base = specifier.slice(2);
  const match = files.find((file) => file === base || file.replace(/\.(tsx?|d\.ts)$/, "") === base);
  if (!match) throw new Error(`Import ${specifier} resolves to no registry file.`);
  return match;
}

function listFiles(root: string): string[] {
  return (readdirSync(join(root, "registry"), { recursive: true, withFileTypes: true }) as import("node:fs").Dirent[])
    .filter((entry) => entry.isFile() && entry.name !== ".DS_Store")
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split("\\").join("/"))
    .sort();
}

/** A doc page's first sentence (its catalog line). */
function firstSentence(root: string, title: string): string {
  const doc = readFileSync(join(root, "docs", `${title}.md`), "utf8");
  const paragraph = doc.split(`# ${title}\n\n`)[1]?.split("\n\n")[0];
  const sentence = paragraph?.match(/^(.+?[.!?])(\s|$)/)?.[1];
  if (!sentence) throw new Error(`docs/${title}.md has no purpose sentence; run pnpm run docs.`);
  return sentence;
}

export function buildRegistry(root: string): Registry {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const tested: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
  const pin = (name: string) => {
    const range = tested[name];
    if (!range) throw new Error(`${name} is imported by a registry file but is not in package.json, so it is untested.`);
    const exact = /^\d+\.\d+\.\d+$/.test(range) ? `^${range}` : range;
    if (!/^\^\d+\.\d+\.\d+$/.test(exact)) throw new Error(`${name}@${range}: pin a caret range (^x.y.z) in package.json.`);
    return `${name}@${exact}`;
  };

  const all = listFiles(root);
  const owner = new Map(all.map((file) => [file, itemForFile(file)]));
  const shipped = (name: string) => all.filter((file) => owner.get(file) === name && !file.endsWith(".css"));

  const items: RegistryItem[] = [];
  const entries = [
    ...foundation.map((entry) => ({ ...entry, kind: "foundation" as const })),
    ...components.map((entry) => ({
      ...entry,
      kind: "component" as const,
      description: firstSentence(root, entry.title),
      docs: `${firstSentence(root, entry.title)} Docs: ${DOCS_URL}/${entry.name}`,
    })),
  ];
  for (const entry of entries) {
    const item: RegistryItem = {
      name: entry.name,
      // ouro-theme replaces the app's colors, so it is a theme (the CLI warns before it
      // overwrites variables). ouro-base only adds variables, so it is a plain item.
      type: entry.name === "ouro-theme" ? "registry:theme" : "css" in entry ? "registry:item" : entry.kind === "component" ? "registry:ui" : "registry:lib",
      title: entry.title,
      description: entry.description,
      docs: entry.docs,
    };
    const paths = shipped(entry.name);
    const runtime = new Set<string>();
    const dev = new Set<string>();
    const registryDeps = new Set<string>(entry.kind === "component" ? ["ouro-base"] : []);
    for (const path of paths) {
      const source = readFileSync(join(root, path), "utf8");
      const isDev = entry.name === "ouro-testing" || devFile.test(path);
      for (const specifier of importsOf(source)) {
        if (specifier.startsWith("@/")) {
          if (path.startsWith(e2eDir)) throw new Error(`${path}: e2e files ship as registry:file, which the CLI does not rewrite; use relative imports.`);
          const dependency = owner.get(resolveRegistryImport(specifier, all));
          if (!dependency) throw new Error(`${path} imports ${specifier}, which no item ships.`);
          if (dependency !== entry.name) registryDeps.add(dependency);
          continue;
        }
        const name = packageName(specifier);
        if (!name) continue;
        for (const each of [name, ...(companions[name] ?? [])]) (isDev ? dev : runtime).add(each);
      }
    }
    const dependencies = [...runtime].sort().map(pin);
    const devDependencies = [...dev].filter((name) => !runtime.has(name)).sort().map(pin);
    if (dependencies.length > 0) item.dependencies = dependencies;
    if (devDependencies.length > 0) item.devDependencies = devDependencies;
    if (registryDeps.size > 0) item.registryDependencies = [...registryDeps].sort().map((name) => `${REPO}/${name}`);
    if (paths.length > 0) item.files = paths.map(fileEntry);
    if ("css" in entry && entry.css) Object.assign(item, cssToItem(readFileSync(join(root, entry.css), "utf8")));
    items.push(item);
  }
  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "ouro",
    homepage: "https://github.com/ourostack/ouro-ui",
    items,
  };
}

/** A copy of the registry whose same-repo registryDependencies point wherever `to` says (an item JSON path or URL). */
export function rewriteDependencies(registry: Registry, to: (name: string) => string): Registry {
  const prefix = `${REPO}/`;
  return {
    ...registry,
    items: registry.items.map((item) =>
      item.registryDependencies
        ? { ...item, registryDependencies: item.registryDependencies.map((dep) => (dep.startsWith(prefix) ? to(dep.slice(prefix.length)) : dep)) }
        : item,
    ),
  };
}

/** The registry as released at v<version>: every same-repo dependency pinned to that tag. */
export function release(registry: Registry, version: string): Registry {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`--release takes x.y.z, without the v (got ${version}).`);
  const { items, ...head } = rewriteDependencies(registry, (name) => `${REPO}/${name}#v${version}`);
  return { ...head, version, items };
}

function main(argv: string[]): number {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const flag = (name: string) => {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
  };
  const out = flag("--out") ?? join(root, "registry.json");
  const check = argv.includes("--check");
  let current = "";
  try {
    current = readFileSync(out, "utf8");
  } catch {
    // Missing counts as stale.
  }
  const deps = flag("--deps");
  const releasedAs = () => {
    try {
      return (JSON.parse(current) as Registry).version;
    } catch {
      return undefined; // Unreadable counts as stale.
    }
  };
  const version = flag("--release") ?? (check ? releasedAs() : undefined);
  let registry = buildRegistry(root);
  try {
    if (version) registry = release(registry, version);
    if (deps !== undefined) {
      if (!deps.includes("{name}")) throw new Error(`--deps takes a template with {name}, such as @ouro/{name} (got ${deps}).`);
      registry = rewriteDependencies(registry, (name) => deps.replaceAll("{name}", name));
    }
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
  const text = `${JSON.stringify(registry, null, 2)}\n`;
  if (check) {
    const onMain = process.env["GITHUB_REF"] === "refs/heads/main" || process.env["GITHUB_BASE_REF"] === "main";
    if (onMain && (version || /"ourostack\/ouro-ui\/[\w-]+#v/.test(current))) {
      process.stderr.write(`${relative(process.cwd(), out)} is pinned to a release (a version field or #v refs), but main stays unpinned: only release tags are pinned. Run pnpm registry and commit the result.\n`);
      return 1;
    }
    if (current !== text) {
      process.stderr.write(`${relative(process.cwd(), out)} is stale. Run pnpm registry and commit the result.\n`);
      return 1;
    }
    process.stdout.write("registry.json is up to date.\n");
    return 0;
  }
  writeFileSync(out, text);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
