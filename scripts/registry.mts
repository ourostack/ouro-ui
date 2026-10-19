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
//   --from <registry.json>              with --deps: rewrite that registry (a release tag's, whose
//                                       dependencies end in #v<x.y.z>) instead of building one;
//                                       scripts/namespace.sh builds the @ouro namespace this way
//
// shadcn's CLI reads registry.json but has no way to make one: this script fills the
// gaps. Each component is two items: <name> ships the runtime source only, and the opt-in
// <name>-tests ships its tests, type tests, stories and end-to-end spec and names the test
// tooling as devDependencies. Each helper in lib/ouro is an item of its own (lib-<stem>, with
// lib-<stem>-tests when it has tests), so a component installs only the helpers it imports;
// ouro-lib and ouro-lib-tests install them all, and ouro-tests every -tests item. It derives
// each item's files and targets from the folder layout, its registryDependencies and npm
// dependencies from the imports, its runtime versions from this repository's package.json
// (the versions the tests ran against), the theme items' cssVars and css from
// registry/ouro/theme/*.css, and each description and docs message from the generated
// docs/<Component>.md.
//
// Two rules keep an add from undoing an app's setup (scripts/registry.test.mjs):
// - Only ouro-base and ouro-theme carry cssVars or css, and no item depends on them. The CLI
//   rewrites the whole stylesheet (adds @custom-variant dark, re-adds missing defaults,
//   collapses blank lines, drops the final newline) whenever any item it resolves has either,
//   and leaves the file alone otherwise, so an app adds ouro-base once and later adds never
//   touch its stylesheet.
// - Test tooling is named without a version. The CLI skips a version-less package the app
//   already has, in any section of package.json, and hands every versioned one to the package
//   manager on every add, which rewrites the app's range. The minimum versions are in each
//   item's meta.requires and in the ouro-testing message.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import ts from "typescript";
import { componentsDir, MANIFEST, readComponents } from "./components.mts";

const REPO = "ourostack/ouro-ui";
const DOCS_URL = "https://ourostack.github.io/ouro-ui/docs";

/** Components, from each folder's component.json (scripts/components.mts): item name, folder, file stem, export name. */
const components = readComponents();

/** Registry files that test this repository itself and never ship. */
const repoOnly = new Set(["registry/ouro/theme/theme.test.tsx", "registry/ouro/e2e/ouro-fixtures.ts"]);

/** Packages every app already has. */
const appPackages = new Set(["react", "react-dom"]);

/** Packages an import needs alongside it (peer dependencies). */
const companions: Record<string, string[]> = { "@storybook/react-vite": ["storybook"] };

/**
 * The files an app adds to run the shipped tests and specs, exactly as the ouro-testing
 * docs message prints them. test/install-fixture-tests holds these files verbatim (the registry
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
  "e2e/ouro-fixtures.ts": [
    'export { expect, test } from "@playwright/test";',
    "",
    "// Ouro UI's specs (e2e/ouro) take test and expect from this file. It is yours: export your",
    "// own fixtures here to run them with your setup. No Ouro UI item ships or overwrites it.",
    "",
  ].join("\n"),
};

/**
 * The oldest test tooling the shipped tests are known to run on: the stack of the first app
 * that ran them on Vitest 4 (Spoonjoy, with the two changes docs/guides/testing.md gives).
 * This repository's CI runs the versions in package.json. A -tests item names each package
 * without a version (see the header), and states these as ranges in meta.requires.
 */
export const toolingMinimum: Record<string, string> = {
  vitest: "4.1.11",
  "@vitest/browser-playwright": "4.1.11",
  playwright: "1.58.1",
  "@playwright/test": "1.58.1",
  storybook: "10.2.10",
  "@storybook/react-vite": "10.2.10",
};

/** What a -tests item does to an app's package.json. */
const toolingNote =
  "It names Vitest, Playwright and Storybook without a version, so the CLI installs one only when your app lacks it and never changes a version you have.";

const TESTING_URL = `${DOCS_URL}/testing.md`;
const INSTALLING_URL = `${DOCS_URL}/installing.md`;

function testingDocs(tested: Record<string, string>): string {
  const file = (path: string) => `--- ${path}\n${testingSetup[path]}`;
  const ran = (name: string) => tested[name]!.replace(/^\^/, "");
  return [
    `Needs Vitest ${toolingMinimum["vitest"]} or later in browser mode (@vitest/browser-playwright), Playwright ${toolingMinimum["playwright"]} or later and, for the stories and specs, Storybook ${toolingMinimum["storybook"]} or later. Ouro UI's CI runs Vitest ${ran("vitest")}, Playwright ${ran("playwright")} and Storybook ${ran("storybook")}; on Vitest 4, read "Vitest 4" in ${TESTING_URL} first. No item sets a version: the CLI installs a package only when your app lacks it.`,
    "The -tests items install Ouro UI's tests beside each component. To run the Vitest browser tests, add vitest.config.ts (use your components.json tailwind.css path for css), then run npx playwright install chromium webkit and npx vitest run:",
    file("vitest.config.ts"),
    "The end-to-end specs in e2e/ouro open the Ouro stories in a Storybook. If your app has none, add these two files (use your stylesheet in preview.ts):",
    file(".storybook/main.ts") + file(".storybook/preview.ts"),
    "If your app has no Playwright config, add this one, which starts that Storybook and runs Chromium and WebKit:",
    file("playwright.config.ts"),
    "The specs take test and expect from e2e/ouro-fixtures.ts, a file of yours that no item ships, so no add overwrites it. Add it once; export your own fixtures from it to run the specs with your setup:",
    file("e2e/ouro-fixtures.ts"),
    "Then run npx playwright test e2e/ouro. With a Playwright config of your own, start Storybook with npx storybook dev -p 6006 and run OURO_E2E_URL=http://localhost:6006 npx playwright test e2e/ouro.",
    `Docs: ${TESTING_URL}`,
  ].join("\n");
}

const foundation = [
  {
    name: "ouro-base",
    title: "Ouro base",
    css: "registry/ouro/theme/ouro-base.css",
    description:
      "Add it once per app, before your first component; no component installs it, so later adds never touch your stylesheet. What every Ouro UI component needs in the app's CSS: success and warning colors, a destructive foreground, the field border color (--input) and --radius when your theme has none, the motion tokens, the press utility, the keyframes for spinners, progress bars and skeletons, and --ouro-layer, the z-index of sheets and dialogs (50; raise it in a :root rule of your own if your app has fixed bars above z-50).",
    docs: `Ouro UI's base tokens are in your CSS. Your theme's values win: a variable you already had keeps its value, and you edit the new ones like any shadcn variable. This add rewrote your stylesheet's spacing once (shadcn does that for any item with CSS); no component add touches it again. Docs: ${INSTALLING_URL}`,
  },
  {
    name: "ouro-theme",
    title: "Ouro theme",
    css: "registry/ouro/theme/ouro-theme.css",
    description: "Ouro UI's own look, as a shadcn theme for :root and .dark. Skip it to keep your app's theme.",
    docs: `The Ouro theme replaced your theme's colors in :root and .dark. Docs: ${INSTALLING_URL}`,
  },
  {
    name: "ouro-lib",
    title: "Ouro lib",
    description:
      "Every helper in lib/ouro in one item. You don't need to add it: each component installs only the helpers it imports (the lib-<name> items).",
    docs: `Every Ouro UI helper is in lib/ouro. OuroProvider is optional; it routes internal hrefs through your router's link. Docs: ${INSTALLING_URL}`,
  },
  {
    name: "ouro-testing",
    title: "Ouro testing",
    description:
      "Installed with every -tests item; you don't need to add it. The test kit Ouro UI's tests use: Vitest browser projects with the drag, flick, tap, touchDrag, touchStep, pointerPress, emulateMedia, pageZoom, resetPageZoom, setPageZoom and restoreTouch commands, the rotate helper (which turns the phone viewport and resets Chromium's zoom; the ouro-touch project fails a test that leaves the page zoomed), the act helper, the holdFrames helper (which holds animation frames and the clock still so a test steps a spring itself), the motion helpers (expectMotion, expectNoMotion, expectGestureSettle, expectTransition and parseDuration, which prove exactly which CSS properties a state change runs on each part), watchAnnouncements (which records what live regions announce, so a test proves a message is heard once per change), axeExclude, and the end-to-end story helper.",
    // Completed in buildRegistry, which knows the versions CI runs.
    docs: "",
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
  /** What the CLI prints after an add. The helper items (lib-*) have none, so an add prints one line per component, not one per helper. */
  docs?: string;
  dependencies?: string[];
  devDependencies?: string[];
  registryDependencies?: string[];
  /** requires: the oldest version of each devDependency the item's files run on, as ranges. */
  meta?: { requires: Record<string, string> };
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

const libDir = "registry/ouro/lib/ouro/";
const testingDir = "registry/ouro/lib/ouro/testing/";
const e2eDir = "registry/ouro/e2e/ouro/";
const themeDir = "registry/ouro/theme/";

/** Test-runner packages, which only the -tests items and ouro-testing may import. */
const testTooling = /^(storybook|@storybook\/.*|vitest|@vitest\/.*|playwright|@playwright\/.*)$/;

/** "Vitest browser tests, type tests, stories and Playwright spec", for the kinds of file present. */
function fileKinds(paths: string[]): string {
  const kinds = [
    paths.some((path) => /\.test\.tsx?$/.test(path)) && "Vitest browser tests",
    paths.some((path) => path.endsWith(".test-d.ts")) && "type tests",
    paths.some((path) => path.endsWith(".stories.tsx")) && "stories",
    paths.some((path) => path.endsWith(".spec.ts")) && "Playwright spec",
  ].filter((kind): kind is string => Boolean(kind));
  return kinds.length === 1 ? kinds[0]! : `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)}`;
}

const devFile = /\.(test|touch\.test)\.tsx?$|\.test-d\.ts$|\.stories\.tsx$|\.spec\.ts$/;

/** The item that ships a lib/ouro file: lib-<stem>, or lib-<stem>-tests for the helper's tests. */
function libItem(file: string): string {
  const stem = file.replace(/(\.touch)?\.test\.tsx?$|\.d\.ts$|\.tsx?$/, "");
  return devFile.test(file) ? `lib-${stem}-tests` : `lib-${stem}`;
}

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
    return libItem(file);
  } else if (path.startsWith(e2eDir)) {
    const stem = file.replace(/\.spec\.ts$/, "");
    const component = components.find((entry) => entry.stem === stem);
    if (component && file.endsWith(".spec.ts")) return `${component.name}-tests`;
  } else if (path.startsWith(componentsDir)) {
    const folder = path.slice(componentsDir.length).split("/")[0];
    const component = components.find(
      (entry) =>
        entry.folder === folder &&
        (new RegExp(`^${entry.stem}(-parts|-styles)?\\.(tsx|ts|test\\.tsx|touch\\.test\\.tsx|test-d\\.ts|stories\\.tsx)$`).test(file) ||
          // A test file of its own, for a case that needs fresh module state: dialog.first-mount.touch.test.tsx.
          new RegExp(`^${entry.stem}\\.[a-z][a-z-]*\\.(test|touch\\.test)\\.tsx$`).test(file)),
    );
    if (component) return devFile.test(file) ? `${component.name}-tests` : component.name;
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

/**
 * Converts a theme CSS file to shadcn's item format: :root and .dark colors and @theme inline
 * to cssVars; --ouro-* tokens, @utility and @keyframes to css.
 */
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
      // Colors go to cssVars, which the CLI also maps in `@theme inline` (--color-*). The
      // --ouro-* tokens are not colors: as cssVars they would get a self-referential
      // `--ouro-x: var(--ouro-x)` mapping, so they go to css under the same selector.
      for (const [name, value] of Object.entries(declarations(node, node.selector, true))) {
        if (name.startsWith("ouro-")) {
          const rule = (css[node.selector] ??= {}) as CssTree;
          rule[`--${name}`] = value;
        } else {
          cssVars[node.selector === ":root" ? "light" : "dark"][name] = value;
        }
      }
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
/** The modules a file imports, statically or dynamically; an import written in a comment does not count. */
function importsOf(source: string): string[] {
  return ts.preProcessFile(source, true, true).importedFiles.map((file) => file.fileName);
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
    .filter((entry) => entry.isFile() && entry.name !== ".DS_Store" && entry.name !== MANIFEST)
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
  // One item per helper in lib/ouro, and one for its tests when it has any.
  const libNames = [...new Set(all.map((file) => owner.get(file)).filter((name): name is string => Boolean(name?.startsWith("lib-"))))].sort();
  const libs = libNames.filter((name) => !name.endsWith("-tests"));
  const libFile = (name: string) => shipped(name)[0]!.slice(libDir.length);
  const testsItems = [
    ...libNames.filter((name) => name.endsWith("-tests")).map((name) => ({ name, title: `${name.slice(0, -6)} tests`, of: name.slice(0, -6) })),
    ...components.map((entry) => ({ name: `${entry.name}-tests`, title: `${entry.title} tests`, of: entry.name })),
  ];
  const libTests = testsItems.filter((entry) => entry.name.startsWith("lib-")).map((entry) => entry.name);
  const entries = [
    ...foundation.map((entry) => ({ ...entry, kind: "foundation" as const, ...(entry.name === "ouro-testing" ? { docs: testingDocs(tested) } : {}) })),
    ...libs.map((name) => ({
      name,
      title: name,
      kind: "lib" as const,
      description:
        name === "lib-ouro-provider"
          ? "OuroProvider, which routes every href through your router's link and groups tooltips. It comes with every component that renders links and with tooltip; add it by name when your app has neither and you want the provider. The helper lib/ouro/ouro-provider.tsx."
          : `Installed with the components that import it; you don't need to add it. The helper lib/ouro/${libFile(name)}.`,
      docs: undefined as string | undefined,
    })),
    ...components.map((entry) => ({
      ...entry,
      kind: "component" as const,
      description: firstSentence(root, entry.title),
      // Completed below, once every item's registryDependencies are known.
      docs: "",
    })),
    ...testsItems.map((entry) => ({
      ...entry,
      kind: "tests" as const,
      // Says what the item ships, by the kinds of file it has (ouro-lib-tests has only tests).
      description: `Optional: the ${fileKinds(shipped(entry.name))} for ${entry.of}, and the tests of everything ${entry.of} installs, so the installed files reach 100% coverage. Add it beside ${entry.of}: add ${entry.of} ${entry.name}. ${toolingNote}`,
      docs: entry.name.startsWith("lib-")
        ? undefined
        : `${entry.of}'s tests, stories and specs are installed beside it, with the tests of everything it installs. The ouro-testing message says how to run them. Docs: ${TESTING_URL}`,
    })),
    {
      name: "ouro-lib-tests",
      title: "Ouro lib tests",
      kind: "aggregate" as const,
      description: `Optional: the tests of every helper in lib/ouro, with ouro-lib. You don't need to add it: each -tests item installs the tests of the helpers its component imports. ${toolingNote}`,
      docs: `Every Ouro UI helper and its tests are installed. The ouro-testing message says how to run them. Docs: ${TESTING_URL}`,
    },
    {
      name: "ouro-tests",
      title: "Ouro tests",
      kind: "aggregate" as const,
      description:
        `Optional: every Ouro UI component with its tests, type tests, stories and Playwright spec, and the test kit. The whole suite in one command. ${toolingNote}`,
      docs: `Every Ouro UI component and its tests are installed. The ouro-testing message says how to run them. Docs: ${TESTING_URL}`,
    },
  ];
  const aggregates: Record<string, string[]> = {
    "ouro-lib": libs,
    "ouro-lib-tests": ["ouro-lib", ...libTests],
    "ouro-tests": testsItems.map((tests) => tests.name),
  };
  for (const entry of entries) {
    const item: RegistryItem = {
      name: entry.name,
      // ouro-theme replaces the app's colors, so it is a theme (the CLI warns before it
      // overwrites variables). ouro-base only adds variables, so it is a plain item, and so
      // are the -tests items, which add files of several kinds.
      type:
        entry.name === "ouro-theme"
          ? "registry:theme"
          : "css" in entry || entry.kind === "tests" || entry.kind === "aggregate"
            ? "registry:item"
            : entry.kind === "component"
              ? "registry:ui"
              : "registry:lib",
      title: entry.title,
      description: entry.description,
      ...(entry.docs === undefined ? {} : { docs: entry.docs }),
    };
    const paths = shipped(entry.name);
    const runtime = new Set<string>();
    const dev = new Set<string>();
    // No item depends on ouro-base or ouro-theme (see the header): an app adds ouro-base once.
    const registryDeps = new Set<string>(entry.kind === "tests" ? [entry.of, "ouro-testing"] : (aggregates[entry.name] ?? []));
    for (const path of paths) {
      const source = readFileSync(join(root, path), "utf8");
      const isDev = entry.name === "ouro-testing" || entry.kind === "tests";
      // env.d.ts declares process.env.NODE_ENV for apps without @types/node; nothing imports it.
      if (!isDev && entry.name !== "lib-env" && /\bprocess\.env\b/.test(source)) registryDeps.add("lib-env");
      // OuroProvider is the one helper only the app imports. It comes with what it serves: a
      // component that renders links reads the app's router link from it, and it groups
      // tooltips. Any other app adds it by name (the README's Next.js steps do).
      if (entry.name === "lib-router-link" || entry.name === "tooltip") registryDeps.add("lib-ouro-provider");
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
    // devDependencies go without a version (see the header); meta.requires states the minimum.
    const devDependencies = [...dev].filter((name) => !runtime.has(name)).sort();
    devDependencies.forEach(pin);
    if (dependencies.length > 0) item.dependencies = dependencies;
    if (devDependencies.length > 0) item.devDependencies = devDependencies;
    if (registryDeps.size > 0) item.registryDependencies = [...registryDeps].sort().map((name) => `${REPO}/${name}`);
    if (paths.length > 0) item.files = paths.map(fileEntry);
    if ("css" in entry && entry.css) Object.assign(item, cssToItem(readFileSync(join(root, entry.css), "utf8")));
    else if (item.cssVars || item.css) throw new Error(`${entry.name} carries CSS; only the theme items may.`);
    if (entry.kind !== "tests" && entry.kind !== "aggregate" && entry.name !== "ouro-testing") {
      const tooling = [...runtime, ...dev].filter((name) => testTooling.test(name)).sort();
      if (tooling.length > 0) {
        throw new Error(`${entry.name} is a runtime item but imports test tooling: ${tooling.join(", ")}. Runtime files import no test tooling; move the import to a test or story.`);
      }
    }
    items.push(item);
  }

  // A component's docs message: what to import and what else the CLI installed with it.
  const byName = new Map(items.map((item) => [item.name, item]));
  const prefix = `${REPO}/`;
  const installedWith = (name: string, seen = new Set<string>()): Set<string> => {
    for (const dependency of byName.get(name)?.registryDependencies ?? []) {
      const dep = dependency.slice(prefix.length);
      if (!seen.has(dep)) {
        seen.add(dep);
        installedWith(dep, seen);
      }
    }
    return seen;
  };
  // The CLI installs devDependencies with `npm install --save-dev` (or the app's package
  // manager's equivalent), which moves a package the app already has in `dependencies` into
  // `devDependencies`, so a production install (`npm ci --omit=dev`) would lose it. A test
  // item therefore never lists a package as a devDependency that a runtime item needs: one
  // its registry dependencies already install is dropped, and any other is a dependency.
  const packageOf = (spec: string) => (spec.indexOf("@", 1) === -1 ? spec : spec.slice(0, spec.indexOf("@", 1)));
  const runtimePackages = new Set(
    items.filter((item) => !item.name.endsWith("-tests") && item.name !== "ouro-testing").flatMap((item) => (item.dependencies ?? []).map(packageOf)),
  );
  for (const item of items) {
    if (!item.devDependencies) continue;
    const installed = new Set(
      [item.name, ...installedWith(item.name)].flatMap((name) => (byName.get(name)?.dependencies ?? []).map(packageOf)),
    );
    const promoted = item.devDependencies.filter((spec) => !installed.has(packageOf(spec)) && runtimePackages.has(packageOf(spec)));
    const devDependencies = item.devDependencies.filter((spec) => !installed.has(packageOf(spec)) && !runtimePackages.has(packageOf(spec)));
    if (promoted.length > 0) item.dependencies = [...(item.dependencies ?? []), ...promoted].sort();
    if (devDependencies.length > 0) item.devDependencies = devDependencies;
    else delete item.devDependencies;
  }
  // The oldest tooling each item's files run on, as ranges; the packages themselves carry no version.
  for (const item of items) {
    if (!item.devDependencies) continue;
    const requires: Record<string, string> = {};
    for (const name of item.devDependencies.map(packageOf)) {
      // Test tooling has a known oldest stack; any other package (axe-core) is as tested here.
      requires[name] = `>=${toolingMinimum[name] ?? pin(name).slice(name.length + 2)}`;
    }
    item.meta = { requires };
  }
  // A -tests item installs the tests of every item it installs, so a subset installed with its
  // tests covers every file it brought: link-tests brings text (its stories import it), so it
  // brings text-tests too. A helper without tests of its own breaks no chain: the closure is
  // taken over everything the item installs.
  const hasTests = new Set(testsItems.map((tests) => tests.name));
  for (const tests of testsItems) {
    const item = byName.get(tests.name)!;
    const more = [...installedWith(tests.name)].filter((name) => hasTests.has(`${name}-tests`) && `${name}-tests` !== tests.name).map((name) => `${prefix}${name}-tests`);
    item.registryDependencies = [...new Set([...(item.registryDependencies ?? []), ...more])].sort();
  }
  for (const entry of components) {
    const item = byName.get(entry.name)!;
    // The components it brought by name; the helpers as one phrase, not a line of lib-* names.
    const others = [...installedWith(entry.name)].filter((name) => !name.startsWith("lib-")).sort();
    const also = [...others, `the helpers ${others.length > 0 ? "they import" : "it imports"} in lib/ouro`].join(", ");
    item.docs =
      `${item.description} Import: import { ${entry.title} } from "@/components/ouro/${entry.folder}/${entry.stem}", ` +
      "with @/components replaced by your components alias (aliases.components in components.json, such as ~/components). " +
      `Also installed: ${also}. Needs ouro-base in your stylesheet: add that item once per app, from the same place as this one, if you have not. Docs: ${DOCS_URL}/${entry.name}.md`;
  }
  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "ouro",
    homepage: "https://ourostack.github.io/ouro-ui/",
    items,
  };
}

/**
 * A copy of the registry whose same-repo registryDependencies point wherever `to` says (an item
 * JSON path or URL). A release's `#v<x.y.z>` ref is dropped: `to` gets the item name.
 */
export function rewriteDependencies(registry: Registry, to: (name: string) => string): Registry {
  const prefix = `${REPO}/`;
  return {
    ...registry,
    items: registry.items.map((item) =>
      item.registryDependencies
        ? { ...item, registryDependencies: item.registryDependencies.map((dep) => (dep.startsWith(prefix) ? to(dep.slice(prefix.length).replace(/#.*$/, "")) : dep)) }
        : item,
    ),
  };
}

/** The registry as released at v<version>: every same-repo dependency pinned to that tag. */
export function release(registry: Registry, version: string): Registry {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`--release takes x.y.z, without the v (got ${version}).`);
  const { items, ...head } = rewriteDependencies(registry, (name) => `${REPO}/${name}#v${version}`);
  // The CLI prints each item's docs message on add, and nothing else names the version.
  return { ...head, version, items: items.map((item) => (item.docs === undefined ? item : { ...item, docs: `${item.docs} Ouro UI v${version}.` })) };
}

/** site/public/llms.txt with its "## Items" list made from the registry: every item, and each component's docs page. */
export function withLlmsItems(llms: string, registry: Registry): string {
  const names = new Set(components.map((entry) => entry.name));
  // The helper items are one line: no app adds them by name.
  const helper = (name: string) => /^lib-/.test(name);
  const helpers = registry.items.filter((item) => helper(item.name) && !item.name.endsWith("-tests")).map((item) => `\`${item.name}\``);
  const lines = registry.items
    .filter((item) => !helper(item.name))
    .map((item) => `- \`${item.name}\`: ${item.description}${names.has(item.name) ? ` Docs: ${DOCS_URL}/${item.name}.md` : ""}`);
  lines.push(`- Helpers, one item per file in lib/ouro, each installed with the components that import it (and \`<name>-tests\` for a helper with tests): ${helpers.join(", ")}.`);
  if (!/\n## Items\n\n[\s\S]*?\n\n## /.test(llms)) throw new Error("site/public/llms.txt needs an ## Items section followed by another ## section.");
  return llms.replace(/(\n## Items\n\n)[\s\S]*?(\n\n## )/, (_, head: string, tail: string) => `${head}${lines.join("\n")}${tail}`);
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
  const from = flag("--from");
  if (from !== undefined && deps === undefined) {
    process.stderr.write("--from rewrites a registry's dependencies, so it needs --deps.\n");
    return 1;
  }
  const version = from === undefined ? (flag("--release") ?? (check ? releasedAs() : undefined)) : undefined;
  let registry = from === undefined ? buildRegistry(root) : (JSON.parse(readFileSync(from, "utf8")) as Registry);
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
  // The repository's own registry.json also lists its items in site/public/llms.txt.
  const llmsPath = join(root, "site/public/llms.txt");
  const llms = flag("--out") === undefined && from === undefined && deps === undefined ? readFileSync(llmsPath, "utf8") : undefined;
  const llmsText = llms === undefined ? undefined : withLlmsItems(llms, buildRegistry(root));
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
    if (llmsText !== undefined && llmsText !== llms) {
      process.stderr.write("site/public/llms.txt lists stale items. Run pnpm registry and commit the result.\n");
      return 1;
    }
    process.stdout.write("registry.json is up to date.\n");
    return 0;
  }
  writeFileSync(out, text);
  if (llmsText !== undefined) writeFileSync(llmsPath, llmsText);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
