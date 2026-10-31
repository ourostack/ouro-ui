import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readComponents } from "./components.mts";
import { axeMinimum } from "../registry/ouro/lib/ouro/testing/axe-version.ts";
import { buildRegistry, censusAxeVersion, cssToItem, itemForFile, rewriteDependencies, testingSetup, toolingMinimum } from "./registry.mts";
import { scratchDir } from "./scratch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts/registry.mts");
// Runs the script as on a branch other than main (CI sets these on main and on pull requests).
const branchEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "GITHUB_REF" && name !== "GITHUB_BASE_REF"));
const run = (...args) => spawnSync("node", [script, ...args], { cwd: root, encoding: "utf8", env: branchEnv });
const registry = buildRegistry(root);
const item = (name) => registry.items.find((entry) => entry.name === name);
const repo = (name) => `ourostack/ouro-ui/${name}`;

test("the committed registry.json is up to date", () => {
  const result = run("--check");
  assert.equal(result.status, 0, result.stderr);
});

test("--check fails when registry.json is stale, and names the fix", () => {
  const out = join(scratchDir("ouro-registry-"), "registry.json");
  assert.equal(run("--out", out).status, 0);
  assert.equal(run("--check", "--out", out).status, 0);
  const stale = JSON.parse(readFileSync(out, "utf8"));
  stale.items.find((entry) => entry.name === "ouro-base").cssVars.light.success = "#000000";
  writeFileSync(out, JSON.stringify(stale, null, 2) + "\n");
  const result = run("--check", "--out", out);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stale.*pnpm registry/s);
});

/** The components, in registry order, from each folder's component.json. */
const components = readComponents(root).map((entry) => entry.name);
/** The helper items, one per file in lib/ouro, and the helpers that have tests. */
const libFiles = readdirSync(join(root, "registry/ouro/lib/ouro")).filter((file) => /\.tsx?$/.test(file));
const libs = libFiles.filter((file) => !/\.test\.tsx?$/.test(file)).map((file) => `lib-${file.replace(/\.d\.ts$|\.tsx?$/, "")}`).sort();
const axRuntime = ["ax-claims", "ax-cli", "ax-command", "ax-effects", "ax-errors", "ax-example", "ax-exit-codes", "ax-lint", "ax-mcp", "ax-outcome", "ax-output", "ax-wait", "ax-work-event", "ax-xray"];
const libTests = [...new Set(libFiles.filter((file) => /\.test\.tsx?$/.test(file)).map((file) => `lib-${file.replace(/(\.touch)?\.test\.tsx?$/, "")}-tests`))].sort();
/** The components this repository had when the manifests replaced the script's list: their order never changes. */
const firstComponents = ["button", "text", "heading", "sheet", "dialog", "confirm-dialog", "field", "fieldset", "link", "text-field", "text-area"];

test("the components come from each folder's component.json, in order, with the first ones in their original order", () => {
  assert.deepEqual(
    readComponents(root)
      .slice(0, 3)
      .map(({ name, folder, stem, title }) => ({ name, folder, stem, title })),
    [
      { name: "button", folder: "button", stem: "button", title: "Button" },
      { name: "text", folder: "text", stem: "text", title: "Text" },
      { name: "heading", folder: "text", stem: "heading", title: "Heading" },
    ],
  );
  // The optional `modes` and `controls` come along (scripts/control-matrix.mts reads them).
  assert.deepEqual(readComponents(root)[0].modes, ["button", "link"]);
  assert.deepEqual(readComponents(root)[1].controls, undefined);
  assert.deepEqual(components.filter((name) => firstComponents.includes(name)), firstComponents);
  assert.equal(readComponents(root).find((entry) => entry.name === "confirm-dialog").title, "ConfirmDialog");
});

test("a component folder without a valid component.json fails with the fix", () => {
  const copy = scratchDir("ouro-components-");
  cpSync(join(root, "registry"), join(copy, "registry"), { recursive: true });
  const manifest = join(copy, "registry/ouro/components/ouro/link/component.json");
  writeFileSync(manifest, JSON.stringify({ order: 60, components: ["link", "missing"] }));
  assert.throws(() => readComponents(copy), /link\/component\.json lists missing, but missing\.tsx is not in the folder/);
  writeFileSync(manifest, JSON.stringify({ components: ["link"] }));
  assert.throws(() => readComponents(copy), /needs a numeric "order"/);
  cpSync(join(copy, "registry/ouro/components/ouro/link"), join(copy, "registry/ouro/components/ouro/badge"), { recursive: true });
  writeFileSync(join(copy, "registry/ouro/components/ouro/badge/component.json"), JSON.stringify({ order: 60, components: ["link"] }));
  writeFileSync(manifest, JSON.stringify({ order: 60, components: ["link"] }));
  // Equal orders sort by folder name.
  assert.deepEqual(readComponents(copy).filter((entry) => entry.name === "link").map((entry) => entry.folder), ["badge", "link"]);
});

test("the registry is named ouro and lists every item", () => {
  assert.equal(registry.name, "ouro");
  assert.equal(registry.homepage, "https://ui.ouro.bot/");
  assert.deepEqual(registry.items.map((entry) => entry.name), [
    "ouro-base",
    "ouro-theme",
    "ouro-lib",
    "ouro-testing",
    ...libs,
    ...components,
    ...libTests,
    ...components.map((name) => `${name}-tests`),
    "ouro-lib-tests",
    "ouro-tests",
    "ouro-census",
    "ouro-source-rules",
    ...axRuntime,
    ...axRuntime.filter((name) => name !== "ax-example").map((name) => `${name}-tests`),
    "ouro-ax",
    "ouro-ax-tests",
  ]);
});

const runtimeItems = ["ouro-base", "ouro-theme", "ouro-lib", ...libs, ...components];
const testFile = /\.(test|touch\.test)\.tsx?$|\.test-d\.ts$|\.stories\.tsx$|\.spec\.ts$/;

test("runtime items ship no tests, stories, specs or test tooling, and never pull in the test kit", () => {
  for (const name of runtimeItems) {
    const entry = item(name);
    for (const file of entry.files ?? []) assert.doesNotMatch(file.path, testFile, `${name} ships ${file.path}`);
    // A Node script it ships (lib-claims' checker) may name what it imports, unversioned, so the app's own copy runs it.
    if ((entry.files ?? []).some((file) => file.path.endsWith(".mjs"))) {
      for (const dependency of entry.devDependencies ?? []) assert.doesNotMatch(dependency, /.@/, `${name} pins ${dependency}`);
    } else assert.equal(entry.devDependencies, undefined, `${name} has devDependencies`);
    for (const dependency of entry.dependencies ?? []) {
      assert.doesNotMatch(dependency, /^(storybook|@storybook\/|vitest|@vitest\/|playwright|@playwright\/)/, `${name} depends on ${dependency}`);
    }
    for (const dependency of entry.registryDependencies ?? []) {
      assert.doesNotMatch(dependency, /ouro-testing|-tests$/, `${name} depends on ${dependency}`);
    }
  }
});

test("the generator fails when a runtime file imports test tooling", () => {
  // The review's mutation: a runtime component that imports vitest.
  const copy = scratchDir("ouro-registry-root-");
  for (const path of ["registry", "docs", "package.json"]) cpSync(join(root, path), join(copy, path), { recursive: true });
  const button = join(copy, "registry/ouro/components/ouro/button/button.tsx");
  writeFileSync(button, readFileSync(button, "utf8") + '\nimport { expect } from "vitest";\n');
  assert.throws(() => buildRegistry(copy), /button is a runtime item but imports test tooling: vitest/);
});

test("each -tests item's description names the kinds of file it ships", () => {
  assert.match(item("lib-cn-tests").description, /^Optional: the Vitest browser tests for lib-cn,/);
  assert.match(item("text-tests").description, /^Optional: the Vitest browser tests, type tests, stories and Playwright spec for text,/);
});

test("each component has an opt-in -tests item with its tests, type tests, stories and spec", () => {
  for (const name of [...components, ...libTests.map((tests) => tests.slice(0, -6))]) {
    const tests = item(`${name}-tests`);
    assert.equal(tests.type, "registry:item");
    assert.match(tests.description, /^Optional: /);
    assert.ok(tests.registryDependencies.includes(repo(name)), `${name}-tests installs ${name}`);
    assert.ok(tests.registryDependencies.includes(repo("ouro-testing")), `${name}-tests installs ouro-testing`);
    assert.ok(tests.files.length > 0);
    for (const file of tests.files) assert.match(file.path, testFile, `${name}-tests ships ${file.path}`);
  }
  const paths = item("sheet-tests").files.map((file) => file.path);
  for (const path of [
    "registry/ouro/components/ouro/sheet/sheet.test.tsx",
    "registry/ouro/components/ouro/sheet/sheet.test-d.ts",
    "registry/ouro/components/ouro/sheet/sheet.stories.tsx",
    "registry/ouro/e2e/ouro/sheet.spec.ts",
  ]) {
    assert.ok(paths.includes(path), `sheet-tests ships ${path}`);
  }
  assert.deepEqual(item("lib-cn-tests").files.map((file) => file.path), ["registry/ouro/lib/ouro/cn.test.ts"]);
  // Playwright comes with ouro-testing: a spec takes test and expect from the app's fixtures file.
  assert.deepEqual(item("button-tests").devDependencies, ["@storybook/react-vite", "storybook", "vitest"]);
  assert.deepEqual(item("button-tests").meta.requires, { "@storybook/react-vite": ">=10.2.10", storybook: ">=10.2.10", vitest: ">=4.1.11" });
});

test("ouro-tests installs every -tests item: the whole suite in one command", () => {
  const all = item("ouro-tests");
  assert.equal(all.type, "registry:item");
  assert.match(all.description, /^Optional: /);
  assert.equal(all.files, undefined);
  assert.deepEqual(all.registryDependencies, [...libTests, ...components.map((name) => `${name}-tests`)].map(repo).sort());
  // ouro-lib-tests is every helper with its tests.
  assert.deepEqual(item("ouro-lib-tests").registryDependencies, ["ouro-lib", ...libTests].map(repo).sort());
  assert.deepEqual(item("ouro-lib").registryDependencies, libs.map(repo).sort());
});

test("theme items come from the repository's CSS, in shadcn's cssVars format", () => {
  const base = item("ouro-base");
  assert.equal(base.type, "registry:item");
  assert.equal(base.cssVars.light.success, "#157d3c");
  assert.equal(base.cssVars.dark.success, "#4ade80");
  assert.equal(base.cssVars.light["destructive-foreground"], "#ffffff");
  // --ouro-* tokens are plain variables, not colors: they go to css, so the CLI writes no
  // `@theme inline` mapping for them (which would be `--ouro-x: var(--ouro-x)`).
  for (const mode of ["light", "dark", "theme"]) {
    for (const name of Object.keys(base.cssVars[mode])) assert.doesNotMatch(name, /^(color-)?ouro-/, `${mode}: ${name}`);
  }
  assert.equal(base.css[":root"]["--ouro-spring-duration"], "750ms");
  assert.match(base.css[":root"]["--ouro-ease-spring"], /^linear\(0, /);
  assert.equal(base.css[":root"]["--ouro-backdrop-color"], "#18181b");
  assert.deepEqual(base.css[".dark"], { "--ouro-backdrop-color": "#000000" });
  assert.equal(base.cssVars.theme["color-warning-foreground"], "var(--warning-foreground)");
  assert.match(base.css["@utility press"].transition, /scale var\(--ouro-duration-press\) var\(--ouro-ease-out\)/);
  assert.deepEqual(base.css["@keyframes ouro-spin"], { to: { rotate: "1turn" } });
  assert.deepEqual(base.css["@keyframes ouro-pulse"], { "50%": { opacity: "0.4" } });

  const theme = item("ouro-theme");
  assert.equal(theme.type, "registry:theme");
  assert.equal(theme.cssVars.light.primary, "#0066cc");
  assert.equal(theme.cssVars.light.radius, "0.75rem");
  assert.equal(theme.cssVars.dark.primary, "#2997ff");
  assert.equal(theme.files, undefined);
});

test("cssToItem converts rules and rejects what shadcn's format can't carry", () => {
  const css = `/* c */ :root { --a: 1px; --ouro-x: 2ms; } .dark { --a: 2px; --ouro-x: 3ms; } @theme inline { --color-a: var(--a); }
    @utility tap { scale: 0.9; } @keyframes k { from { opacity: 0; } }`;
  assert.deepEqual(cssToItem(css), {
    cssVars: { light: { a: "1px" }, dark: { a: "2px" }, theme: { "color-a": "var(--a)" } },
    css: { ":root": { "--ouro-x": "2ms" }, ".dark": { "--ouro-x": "3ms" }, "@utility tap": { scale: "0.9" }, "@keyframes k": { from: { opacity: "0" } } },
  });
  assert.throws(() => cssToItem(":root { color: red; }"), /:root.*only custom properties/);
  assert.throws(() => cssToItem("@import 'x.css';"), /@import/);
});

test("components ship as registry:ui, tests and stories as registry:component, specs as registry:file", () => {
  const files = Object.fromEntries([...item("sheet").files, ...item("sheet-tests").files].map((file) => [file.path, file]));
  assert.deepEqual(files["registry/ouro/components/ouro/sheet/sheet.tsx"], {
    path: "registry/ouro/components/ouro/sheet/sheet.tsx",
    type: "registry:ui",
    target: "@components/ouro/sheet/sheet.tsx",
  });
  assert.equal(files["registry/ouro/components/ouro/sheet/sheet-parts.tsx"].type, "registry:ui");
  assert.equal(files["registry/ouro/components/ouro/sheet/sheet.test.tsx"].type, "registry:component");
  assert.equal(files["registry/ouro/components/ouro/sheet/sheet.stories.tsx"].target, "@components/ouro/sheet/sheet.stories.tsx");
  assert.deepEqual(files["registry/ouro/e2e/ouro/sheet.spec.ts"], {
    path: "registry/ouro/e2e/ouro/sheet.spec.ts",
    type: "registry:file",
    target: "~/e2e/ouro/sheet.spec.ts",
  });
  assert.ok(!item("dialog").files.some((file) => file.path.includes("confirm-dialog")));
  assert.ok(!item("dialog-tests").files.some((file) => file.path.includes("confirm-dialog")));
  assert.ok(item("confirm-dialog-tests").files.some((file) => file.path.endsWith("confirm-dialog.stories.tsx")));
  assert.ok(item("heading").files.some((file) => file.path.endsWith("text/heading.tsx")));
  assert.ok(!item("text").files.some((file) => file.path.includes("heading")));
});

test("helpers land in lib/ouro and the test kit in lib/ouro/testing and e2e/ouro", () => {
  for (const name of libs) {
    assert.equal(item(name).type, "registry:lib");
    // One module each; lib-claims also ships the Node script that checks its claims.
    assert.equal(item(name).files.filter((file) => !file.path.endsWith(".mjs")).length, 1, `${name} is one module`);
    for (const file of item(name).files) {
      assert.equal(file.type, "registry:lib");
      assert.match(file.target, /^@lib\/ouro\/[\w.-]+$/);
    }
  }
  assert.equal(item("ouro-lib").files, undefined);
  assert.deepEqual(item("lib-env").files.map((file) => file.target), ["@lib/ouro/env.d.ts"]);
  // env.d.ts declares process.env.NODE_ENV: every item that reads it installs it, though nothing imports it.
  assert.ok(item("lib-dev").registryDependencies.includes(repo("lib-env")));
  assert.ok(item("button").registryDependencies.includes(repo("lib-env")));
  const testing = item("ouro-testing").files.map((file) => file.target);
  assert.ok(testing.includes("@lib/ouro/testing/vitest.ts"));
  assert.ok(testing.includes("@lib/ouro/testing/setup.ts"));
  assert.ok(testing.includes("~/e2e/ouro/story.ts"));
});

test("every registry file ships in exactly one item, except the repository's own theme test", () => {
  assert.equal(itemForFile("registry/ouro/components/ouro/dialog/dialog-parts.tsx"), "dialog");
  assert.equal(itemForFile("registry/ouro/components/ouro/dialog/confirm-dialog.test.tsx"), "confirm-dialog-tests");
  assert.equal(itemForFile("registry/ouro/components/ouro/dialog/dialog.stories.tsx"), "dialog-tests");
  assert.equal(itemForFile("registry/ouro/e2e/ouro/sheet.spec.ts"), "sheet-tests");
  assert.equal(itemForFile("registry/ouro/lib/ouro/cn.test.ts"), "lib-cn-tests");
  assert.equal(itemForFile("registry/ouro/lib/ouro/cn.ts"), "lib-cn");
  assert.equal(itemForFile("registry/ouro/lib/ouro/env.d.ts"), "lib-env");
  assert.equal(itemForFile("registry/ouro/lib/ouro/ouro-provider.test.tsx"), "lib-ouro-provider-tests");
  // The repository's stand-in for the fixtures file an app writes once and no item ships.
  assert.equal(itemForFile("registry/ouro/e2e/ouro-fixtures.ts"), null);
  // The screen-reader lane's specs need VoiceOver or NVDA; they stay in this repository.
  assert.equal(itemForFile("registry/ouro/e2e/screen-reader/checkbox.sr.spec.ts"), null);
  assert.equal(itemForFile("registry/ouro/e2e/screen-reader/screen-reader.ts"), null);
  assert.equal(itemForFile("registry/ouro/e2e/ouro/story.ts"), "ouro-testing");
  assert.equal(itemForFile("registry/ouro/lib/ouro/testing/act.ts"), "ouro-testing");
  assert.equal(itemForFile("registry/ouro/theme/theme.test.tsx"), null);
  assert.throws(() => itemForFile("registry/ouro/components/ouro/unregistered/unregistered.tsx"), /unregistered\.tsx.*no item/);
});

test("registryDependencies are the same-repo items each item imports, as full unpinned addresses", () => {
  const notHelpers = (name) => item(name).registryDependencies.filter((dependency) => !dependency.startsWith(repo("lib-")));
  assert.deepEqual(notHelpers("dialog"), [repo("sheet")]);
  assert.deepEqual(notHelpers("heading"), [repo("text")]);
  assert.deepEqual(notHelpers("confirm-dialog"), [repo("button"), repo("dialog")]);
  assert.deepEqual(item("lib-cn").registryDependencies, undefined);
  assert.deepEqual(item("lib-class-name-check").registryDependencies, [repo("lib-dev"), repo("lib-env")]);
  // A -tests item also names the tests of everything it installs.
  assert.deepEqual(notHelpers("heading-tests"), ["button", "button-tests", "heading", "ouro-testing", "text", "text-tests"].map(repo));
  assert.deepEqual(notHelpers("dialog-tests"), ["button", "button-tests", "dialog", "ouro-testing", "sheet", "sheet-tests"].map(repo));
  assert.deepEqual(item("lib-cn-tests").registryDependencies, [repo("lib-cn"), repo("ouro-testing")]);
  assert.equal(item("ouro-testing").registryDependencies, undefined);
  assert.equal(item("ouro-theme").registryDependencies, undefined);
  for (const entry of registry.items) {
    for (const dependency of entry.registryDependencies ?? []) assert.doesNotMatch(dependency, /#/);
  }
});

test("Ouro AX items depend on the ax items they import", () => {
  assert.equal(itemForFile("registry/ouro/ax/command.ts"), "ax-command");
  assert.equal(itemForFile("registry/ouro/ax/help.ts"), "ax-cli");
  assert.equal(itemForFile("registry/ouro/ax/help.test.mts"), "ax-cli-tests");
  assert.equal(itemForFile("registry/ouro/ax/example-cli.ts"), "ax-example");
  assert.equal(itemForFile("registry/ouro/ax/fixtures/notes.mts"), "ax-xray-tests");
  assert.deepEqual(item("ax-errors").registryDependencies, undefined);
  assert.deepEqual(item("ax-outcome").registryDependencies, ["ax-effects", "ax-errors", "ax-exit-codes"].map(repo));
  assert.deepEqual(item("ax-xray").registryDependencies, ["ax-claims", "ax-outcome", "ax-wait", "ax-work-event"].map(repo));
  assert.deepEqual(item("ax-cli").files.map((file) => [file.path, file.type, file.target]), [
    ["registry/ouro/ax/cli.ts", "registry:lib", "@lib/ouro/ax/cli.ts"],
    ["registry/ouro/ax/help.ts", "registry:lib", "@lib/ouro/ax/help.ts"],
  ]);
  assert.ok(item("ax-cli-tests").registryDependencies.includes(repo("ax-cli")));
  assert.deepEqual(item("ouro-ax").registryDependencies, axRuntime.filter((name) => name !== "ax-example").map(repo));
  for (const name of axRuntime) {
    assert.equal(item(name).dependencies, undefined, `${name} has npm dependencies`);
    assert.equal(item(name).devDependencies, undefined, `${name} has devDependencies`);
    assert.ok(!(item(name).registryDependencies ?? []).some((dependency) => /lib-|-tests$/.test(dependency)), name);
  }
});

test("npm dependencies are pinned to the ranges this repository tests", () => {
  assert.deepEqual(item("button").dependencies, ["@base-ui/react@^1.8.0"]);
  // OuroProvider groups tooltips with Base UI's Tooltip.Provider.
  assert.deepEqual(item("lib-ouro-provider").dependencies, ["@base-ui/react@^1.8.0"]);
  assert.deepEqual(item("lib-cn").dependencies, ["clsx@^2.1.1", "tailwind-merge@^3.7.0"]);
  assert.equal(item("ouro-lib").dependencies, undefined);
  assert.ok(!JSON.stringify(registry).includes('"motion@'), "no item depends on motion");
  assert.equal(item("button").devDependencies, undefined);
  assert.deepEqual(item("ouro-testing").devDependencies, ["@playwright/test", "@vitest/browser-playwright", "axe-core", "playwright", "vitest"]);
  for (const entry of registry.items) {
    for (const dependency of entry.dependencies ?? []) {
      assert.doesNotMatch(dependency, /^react(-dom)?@/);
      assert.match(dependency, /@\^\d+\.\d+\.\d+$/);
    }
    for (const dependency of entry.devDependencies ?? []) assert.doesNotMatch(dependency, /^react(-dom)?$/);
  }
});

test("a helper's Node script names what it imports as devDependencies without a version, so lib-claims leaves the app's TypeScript alone", () => {
  assert.equal(item("lib-claims").dependencies, undefined);
  assert.deepEqual(item("lib-claims").devDependencies, ["typescript"]);
  assert.deepEqual(item("ouro-source-rules").devDependencies, ["postcss", "typescript"]);
  assert.ok(!registry.items.some((entry) => (entry.dependencies ?? []).some((spec) => spec.startsWith("typescript"))), "no item depends on typescript");
});

test("each item has a one-line description and a docs message with its docs URL", () => {
  const sheet = item("sheet");
  assert.equal(sheet.title, "Sheet");
  assert.equal(sheet.description, "A panel that slides in from an edge and is dragged back to dismiss: the mobile form of a dialog.");
  assert.equal(
    sheet.docs,
    `${sheet.description} Import: import { Sheet } from "@/components/ouro/sheet/sheet", with @/components replaced by your components alias (aliases.components in components.json, such as ~/components). Also installed: the helpers it imports in lib/ouro. Needs ouro-base in your stylesheet: add that item once per app, from the same place as this one, if you have not. Docs: https://ui.ouro.bot/docs/sheet.md`,
  );
  assert.equal(
    item("confirm-dialog").docs,
    `${item("confirm-dialog").description} Import: import { ConfirmDialog } from "@/components/ouro/dialog/confirm-dialog", with @/components replaced by your components alias (aliases.components in components.json, such as ~/components). Also installed: button, dialog, sheet, the helpers they import in lib/ouro. Needs ouro-base in your stylesheet: add that item once per app, from the same place as this one, if you have not. Docs: https://ui.ouro.bot/docs/confirm-dialog.md`,
  );
  assert.match(item("heading").docs, /import \{ Heading \} from "@\/components\/ouro\/text\/heading"/);
  // ouro-base is the one item an app adds by hand, once; the helpers come with what imports them.
  assert.match(item("ouro-base").description, /^Add it once per app, before your first component; no component installs it, /);
  for (const name of libs.filter((each) => !["lib-ouro-provider", "lib-claims"].includes(each))) assert.match(item(name).description, /^Installed with the components that import it; you don't need to add it\. /, name);
  // OuroProvider is imported only by the app, so its description says when to add it by name.
  assert.doesNotMatch(item("lib-ouro-provider").description, /you don't need to add it/);
  assert.match(item("lib-ouro-provider").description, /add it by name/);
  // claim() is for an app's own copy, and no component imports it.
  assert.match(item("lib-claims").description, /^claim\(\), .* No component imports it; add it by name\. /);
  assert.match(item("ouro-testing").description, /^Installed with every -tests item; you don't need to add it\. /);
  assert.match(item("sheet-tests").docs, /https:\/\/ui\.ouro\.bot\/docs\/testing\.md$/);
  for (const name of components) {
    assert.ok(item(name).docs.endsWith(`Docs: https://ui.ouro.bot/docs/${name}.md`), name);
  }
  assert.match(item("ouro-testing").docs, /ouroTestProjects/);
  assert.match(item("ouro-testing").docs, /OURO_E2E_URL/);
  for (const entry of registry.items) {
    assert.ok(entry.description.length > 0 && !entry.description.includes("\n"), entry.name);
    assert.equal(Boolean(entry.docs), !entry.name.startsWith("lib-"), entry.name);
  }
});

test("rewriteDependencies points same-repo dependencies anywhere, leaving the registry unchanged", () => {
  const local = rewriteDependencies(registry, (name) => `/tmp/r/${name}.json`);
  assert.deepEqual(local.items.find((entry) => entry.name === "lib-class-name-check").registryDependencies, ["/tmp/r/lib-dev.json", "/tmp/r/lib-env.json"]);
  assert.ok(local.items.find((entry) => entry.name === "heading").registryDependencies.includes("/tmp/r/text.json"));
  assert.deepEqual(item("lib-class-name-check").registryDependencies[0], repo("lib-dev"));
});

test("--deps writes a copy whose same-repo dependencies follow a template: the @ouro namespace (Pages) or local files (install test)", () => {
  const dir = scratchDir("ouro-registry-");
  assert.equal(run("--out", join(dir, "ns.json"), "--deps", "@ouro/{name}").status, 0);
  const namespaced = JSON.parse(readFileSync(join(dir, "ns.json"), "utf8"));
  assert.deepEqual(namespaced.items.find((entry) => entry.name === "lib-class-name-check").registryDependencies, ["@ouro/lib-dev", "@ouro/lib-env"]);
  assert.ok(namespaced.items.find((entry) => entry.name === "dialog").registryDependencies.includes("@ouro/sheet"));
  assert.ok(namespaced.items.find((entry) => entry.name === "ouro-tests").registryDependencies.includes("@ouro/dialog-tests"));
  assert.equal(namespaced.version, undefined);
  assert.equal(run("--out", join(dir, "local.json"), "--deps", "/srv/r/{name}.json").status, 0);
  const local = JSON.parse(readFileSync(join(dir, "local.json"), "utf8"));
  assert.deepEqual(local.items.find((entry) => entry.name === "lib-cn-tests").registryDependencies, ["/srv/r/lib-cn.json", "/srv/r/ouro-testing.json"]);
  assert.equal(run("--out", join(dir, "bad.json"), "--deps", "@ouro/").status, 1, "a template without {name} fails");
});

test("--release pins every same-repo dependency to the release tag and records the version", () => {
  const out = join(scratchDir("ouro-registry-"), "registry.json");
  assert.equal(run("--out", out, "--release", "0.1.0").status, 0);
  const released = JSON.parse(readFileSync(out, "utf8"));
  assert.deepEqual(Object.keys(released), ["$schema", "name", "homepage", "version", "items"]);
  assert.equal(released.version, "0.1.0");
  assert.deepEqual(released.items.find((entry) => entry.name === "lib-class-name-check").registryDependencies, [
    "ourostack/ouro-ui/lib-dev#v0.1.0",
    "ourostack/ouro-ui/lib-env#v0.1.0",
  ]);
  assert.ok(released.items.find((entry) => entry.name === "ouro-tests").registryDependencies.includes("ourostack/ouro-ui/sheet-tests#v0.1.0"));
  assert.ok(released.items.find((entry) => entry.name === "sheet-tests").registryDependencies.includes("ourostack/ouro-ui/sheet#v0.1.0"));
  for (const entry of released.items) {
    for (const dependency of entry.registryDependencies ?? []) assert.match(dependency, /^ourostack\/ouro-ui\/[\w-]+#v0\.1\.0$/);
    // Every add prints the version it installed; the CLI shows no other trace of it. A helper prints nothing.
    if (entry.name.startsWith("lib-")) {
      assert.equal(entry.docs, undefined);
      continue;
    }
    assert.ok(entry.docs.endsWith(" Ouro UI v0.1.0."), `${entry.name}: ${entry.docs.slice(-60)}`);
    assert.equal(entry.docs, `${item(entry.name).docs} Ouro UI v0.1.0.`);
  }
  for (const entry of registry.items) assert.doesNotMatch(entry.docs ?? "", /Ouro UI v\d/, `${entry.name} names a version on main`);

  // CI on the release branch: --check reads the version from the file and still catches drift.
  assert.equal(run("--check", "--out", out).status, 0);
  released.items.find((entry) => entry.name === "dialog").registryDependencies[0] = "ourostack/ouro-ui/lib-cn";
  writeFileSync(out, JSON.stringify(released, null, 2) + "\n");
  assert.equal(run("--check", "--out", out).status, 1);

  // On main, and on pull requests into main, a released file never passes: main stays unpinned.
  assert.equal(run("--out", out, "--release", "0.1.0").status, 0);
  for (const env of [{ GITHUB_REF: "refs/heads/main" }, { GITHUB_BASE_REF: "main" }]) {
    const onMain = spawnSync("node", [script, "--check", "--out", out], { cwd: root, encoding: "utf8", env: { ...branchEnv, ...env } });
    assert.equal(onMain.status, 1, JSON.stringify(env));
    assert.match(onMain.stderr, /pinned to a release.*main stays unpinned/s);
  }
  // An unpinned file passes on main. (Not the committed registry.json: on the release branch, where this test also runs, that one is pinned.)
  const unpinned = join(dirname(out), "unpinned.json");
  assert.equal(run("--out", unpinned).status, 0);
  const mainOk = spawnSync("node", [script, "--check", "--out", unpinned], { cwd: root, encoding: "utf8", env: { ...branchEnv, GITHUB_REF: "refs/heads/main" } });
  assert.equal(mainOk.status, 0, mainOk.stderr);

  const bad = run("--out", out, "--release", "v0.1.0");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--release takes x\.y\.z/);
});

test("the install fixture's test setup uses exactly the files the ouro-testing docs print, and the bare fixture has none", () => {
  const docs = item("ouro-testing").docs;
  for (const [path, content] of Object.entries(testingSetup)) {
    assert.equal(readFileSync(join(root, "test/install-fixture-tests", path), "utf8"), content, `test/install-fixture-tests/${path} differs from the docs`);
    assert.ok(!existsSync(join(root, "test/install-fixture", path)), `the bare fixture has ${path}`);
    assert.ok(docs.includes(`--- ${path}\n${content}`), `the docs print ${path}`);
  }
  assert.ok("playwright.config.ts" in testingSetup, "the fixture's Playwright config is one of the documented files");
  // The specs take test and expect from a file the app owns, which no item ships, so no add overwrites it.
  assert.ok("e2e/ouro-fixtures.ts" in testingSetup);
  assert.equal(readFileSync(join(root, "registry/ouro/e2e/ouro-fixtures.ts"), "utf8"), testingSetup["e2e/ouro-fixtures.ts"]);
  for (const entry of registry.items) {
    for (const file of entry.files ?? []) {
      assert.notEqual(file.path, "registry/ouro/e2e/ouro-fixtures.ts", `${entry.name} ships the fixtures file`);
      if (!file.path.endsWith(".spec.ts")) continue;
      const source = readFileSync(join(root, file.path), "utf8");
      assert.match(source, /^import \{ expect, test \} from "\.\.\/ouro-fixtures";$/m, `${file.path} takes test and expect from ../ouro-fixtures`);
      assert.doesNotMatch(source, /^import \{[^}]*\b(test|expect)\b[^}]*\} from "@playwright\/test";$/m, `${file.path} imports test or expect from @playwright/test`);
    }
  }
  assert.match(docs, /npx storybook dev -p 6006/);
  assert.match(docs, /Then run npx playwright test e2e\/ouro\./);
  assert.match(docs, /OURO_E2E_URL=http:\/\/localhost:6006 npx playwright test e2e\/ouro/);
});

test("site/public/llms.txt gives the init, search and add commands and lists every item", () => {
  const llms = readFileSync(join(root, "site/public/llms.txt"), "utf8");
  assert.ok(llms.includes("npx shadcn@latest init --base base --preset nova --yes --no-monorepo"));
  assert.ok(llms.includes("npx shadcn@latest search 'ourostack/ouro-ui#v"));
  assert.ok(llms.includes("npx shadcn@latest add ourostack/ouro-ui/dialog#v"));
  for (const entry of registry.items.filter((each) => !each.name.startsWith("lib-"))) {
    // A component's line ends with its page's full Markdown URL, so an agent never composes one.
    // An Ouro AX item's line ends with its page in docs/ax.
    const line = components.includes(entry.name)
      ? `- \`${entry.name}\`: ${entry.description} Docs: https://ui.ouro.bot/docs/${entry.name}.md\n`
      : axRuntime.includes(entry.name)
        ? `- \`${entry.name}\`: ${entry.description} Docs: https://github.com/ourostack/ouro-ui/blob/main/docs/ax/${entry.name}.md\n`
        : `- \`${entry.name}\`: ${entry.description}\n`;
    assert.ok(llms.includes(line), `llms.txt lists ${entry.name} with its registry description; run pnpm registry`);
  }
  // The helpers are one line: no app adds one by name.
  const helpers = llms.split("\n").find((line) => line.startsWith("- Helpers, one item per file in lib/ouro"));
  for (const name of libs) assert.ok(helpers.includes(`\`${name}\``), `llms.txt names ${name}`);
  assert.ok(llms.includes("https://ui.ouro.bot/docs/parts.md"), "llms.txt links parts.md");
});

test("--from rewrites a released registry.json for the @ouro namespace, keeping its version and docs (Pages serves the newest tag)", () => {
  const dir = scratchDir("ouro-registry-");
  const released = join(dir, "released.json");
  assert.equal(run("--out", released, "--release", "0.3.0").status, 0);
  assert.equal(run("--from", released, "--out", join(dir, "ns.json"), "--deps", "@ouro/{name}").status, 0);
  const namespaced = JSON.parse(readFileSync(join(dir, "ns.json"), "utf8"));
  assert.equal(namespaced.version, "0.3.0");
  assert.ok(namespaced.items.find((entry) => entry.name === "dialog").registryDependencies.includes("@ouro/sheet"));
  for (const entry of namespaced.items) for (const dependency of entry.registryDependencies ?? []) assert.match(dependency, /^@ouro\/[\w-]+$/);
  assert.ok(namespaced.items.every((entry) => entry.docs === undefined || entry.docs.endsWith(" Ouro UI v0.3.0.")));
  assert.equal(run("--from", released, "--out", join(dir, "bad.json")).status, 1, "--from without --deps fails");
});

test("no item lists a package as a devDependency that a runtime item, or anything it installs, needs", () => {
  // The CLI installs devDependencies with --save-dev, which moves a package the app already has
  // in dependencies; a production install would then lack it (scripts/install-check.mjs checks
  // an installed app the same way).
  const byName = new Map(registry.items.map((entry) => [entry.name, entry]));
  const packageOf = (spec) => spec.slice(0, spec.indexOf("@", 1));
  const closure = (name, seen = new Set()) => {
    for (const dependency of byName.get(name)?.registryDependencies ?? []) {
      const dep = dependency.replace(/^ourostack\/ouro-ui\//, "").replace(/#.*$/, "");
      if (!seen.has(dep)) {
        seen.add(dep);
        closure(dep, seen);
      }
    }
    return seen;
  };
  const runtime = registry.items.filter((entry) => !entry.name.endsWith("-tests") && entry.name !== "ouro-testing");
  const runtimePackages = new Set(runtime.flatMap((entry) => (entry.dependencies ?? []).map(packageOf)));
  assert.ok(runtimePackages.has("@base-ui/react"));
  for (const entry of registry.items) {
    const dev = (entry.devDependencies ?? []).map(packageOf);
    const installed = new Set([entry.name, ...closure(entry.name)].flatMap((name) => (byName.get(name)?.dependencies ?? []).map(packageOf)));
    assert.deepEqual(dev.filter((name) => installed.has(name)), [], `${entry.name}: a devDependency its own install already lists as a dependency`);
    assert.deepEqual(dev.filter((name) => runtimePackages.has(name)), [], `${entry.name}: a devDependency that a runtime item needs`);
  }
});

// What Spoonjoy's adoption found (H5, H6, D9): every add must leave the app's setup alone,
// and a subset installed with its tests must be able to cover every file it installed.
const closure = (name, seen = new Set()) => {
  for (const dependency of item(name)?.registryDependencies ?? []) {
    const dep = dependency.slice("ourostack/ouro-ui/".length);
    if (!seen.has(dep)) {
      seen.add(dep);
      closure(dep, seen);
    }
  }
  return seen;
};

test("a -tests item installs the tests of every item it installs: link-tests brings text-tests", () => {
  assert.ok(item("link-tests").registryDependencies.includes(repo("text-tests")), "link-tests installs text, so it installs text-tests");
  const names = new Set(registry.items.map((entry) => entry.name));
  for (const entry of registry.items.filter((each) => each.name.endsWith("-tests") && each.name !== "ouro-tests" && each.name !== "ouro-lib-tests")) {
    const installed = new Set([entry.name, ...closure(entry.name)]);
    for (const dep of installed) {
      if (dep.endsWith("-tests") || !names.has(`${dep}-tests`)) continue;
      assert.ok(installed.has(`${dep}-tests`), `${entry.name} installs ${dep} without ${dep}-tests`);
    }
  }
});

test("only ouro-base and ouro-theme touch the app's stylesheet, and no other item installs them", () => {
  for (const entry of registry.items) {
    const themed = entry.name === "ouro-base" || entry.name === "ouro-theme";
    assert.equal(Boolean(entry.cssVars || entry.css), themed, `${entry.name} cssVars/css`);
    for (const dep of closure(entry.name)) {
      assert.ok(dep !== "ouro-base" && dep !== "ouro-theme", `${entry.name} installs ${dep}, so adding it would rewrite the app's stylesheet`);
    }
  }
});

test("devDependencies are named without a version, so the CLI installs it only when the app lacks it and never changes a version the app has", () => {
  const tooling = /^(storybook|@storybook\/.*|vitest|@vitest\/.*|playwright|@playwright\/.*)$/;
  let seen = 0;
  for (const entry of registry.items) {
    for (const spec of entry.dependencies ?? []) assert.ok(!tooling.test(spec.replace(/(?!^)@.*$/, "")), `${entry.name} lists ${spec} as a dependency`);
    for (const spec of entry.devDependencies ?? []) {
      seen++;
      assert.doesNotMatch(spec, /.@/, `${entry.name}: ${spec} carries a version`);
    }
    if (entry.devDependencies) {
      // The minimum versions are stated, as ranges, where an app and its agent can read them.
      for (const name of entry.devDependencies) assert.match(entry.meta?.requires?.[name] ?? "", /^>=\d+\.\d+\.\d+$/, `${entry.name} meta.requires.${name}`);
    }
  }
  assert.ok(seen > 0);
  assert.match(item("ouro-testing").docs, /Needs Vitest \d[\d.]* or later in browser mode .*Playwright \d[\d.]* or later/);
});

test("the ouro-testing message names axe-core's minimum, the one audit checks when it runs", () => {
  assert.match(axeMinimum, /^\d+\.\d+\.\d+$/);
  assert.ok(item("ouro-testing").docs.startsWith("Needs ") && item("ouro-testing").docs.split(". ")[0].includes(`axe-core ${axeMinimum} or later`), item("ouro-testing").docs.split(". ")[0]);
  for (const name of ["ouro-testing", "ouro-census"]) assert.equal(item(name).meta.requires["axe-core"], `>=${axeMinimum}`, `${name} meta.requires`);
});

test("audit and the census check axe-core with one minimum and one comparison: the census's copy is generated from the test kit's", () => {
  const read = (path) => readFileSync(join(root, path), "utf8");
  // The census installs in e2e/ouro-census/ and the test kit in the app's lib folder, so neither can import the other.
  assert.equal(read("registry/ouro/census/census-axe-version.mjs"), censusAxeVersion(root), "run node scripts/registry.mts");
  assert.match(read("registry/ouro/lib/ouro/testing/axe.ts"), /^import \{ requireAxe \} from "\.\/axe-version";$/m);
  assert.match(read("registry/ouro/census/census-page.mjs"), /^import \{ requireAxe \} from "\.\/census-axe-version\.mjs";$/m);
  assert.equal(toolingMinimum["axe-core"], axeMinimum);
  assert.match(read("scripts/registry.mts"), /^\s+"axe-core": axeMinimum,$/m);
  for (const path of ["registry/ouro/lib/ouro/testing/axe.ts", "registry/ouro/census/census-page.mjs"]) {
    assert.doesNotMatch(read(path), /4\.13\.0|^\s*(export )?const axeMinimum =/m, `${path} states its own minimum`);
  }
  assert.equal(itemForFile("registry/ouro/lib/ouro/testing/axe-version.ts"), "ouro-testing");
  assert.equal(itemForFile("registry/ouro/census/census-axe-version.mjs"), "ouro-census");
});

test("each lib helper is its own item, so an item installs only the helpers it imports", () => {
  const button = closure("button");
  for (const helper of ["lib-cn", "lib-dev", "lib-announce"]) assert.ok(button.has(helper), `button installs ${helper}`);
  for (const helper of ["lib-toast", "lib-stretched-link", "lib-floating", "lib-spring", "lib-use-drag"]) {
    assert.ok(!button.has(helper), `button does not import ${helper}`);
  }
  // Every helper file an installed file imports is installed, and nothing else from lib/ouro.
  for (const entry of registry.items.filter((each) => each.type === "registry:ui")) {
    const installed = new Set([entry.name, ...closure(entry.name)]);
    const files = [...installed].flatMap((name) => (item(name).files ?? []).map((file) => file.path));
    const imported = new Set();
    for (const path of files) {
      for (const match of readFileSync(join(root, path), "utf8").matchAll(/from "@\/(registry\/ouro\/lib\/ouro\/[\w-]+)"/g)) imported.add(match[1]);
    }
    // OuroProvider is the one helper the app imports: it comes with the components that render links.
    const helpers = files
      .filter((path) => path.startsWith("registry/ouro/lib/ouro/") && !path.endsWith("env.d.ts") && !path.endsWith("/ouro-provider.tsx"))
      .map((path) => path.replace(/\.tsx?$/, ""));
    assert.equal(files.includes("registry/ouro/lib/ouro/ouro-provider.tsx"), files.includes("registry/ouro/lib/ouro/router-link.ts") || entry.name === "tooltip", `${entry.name} has OuroProvider exactly when it renders links or is the tooltip, which the provider groups`);
    assert.deepEqual(helpers.filter((path) => !imported.has(path)), [], `${entry.name} installs helpers nothing it installs imports`);
  }
  // ouro-lib stays, as every helper in one item.
  const all = closure("ouro-lib");
  for (const entry of registry.items.filter((each) => each.name.startsWith("lib-") && !each.name.endsWith("-tests"))) assert.ok(all.has(entry.name), `ouro-lib installs ${entry.name}`);
});

test("every item's docs message names a docs page the site publishes", () => {
  const catalog = JSON.parse(readFileSync(join(root, "site/src/docs/catalog.json"), "utf8")).map((entry) => entry.name);
  const pages = JSON.parse(readFileSync(join(root, "site/src/docs/pages.json"), "utf8")).map((entry) => entry.name);
  const published = new Set([...catalog, ...pages].map((name) => `https://ui.ouro.bot/docs/${name}.md`));
  for (const entry of registry.items) {
    // A helper prints nothing, so an add prints one message per component, not one per helper.
    if (entry.name.startsWith("lib-")) {
      assert.equal(entry.docs, undefined, `${entry.name} prints a message`);
      continue;
    }
    const url = /Docs: (\S+)$/.exec(entry.docs)?.[1];
    assert.ok(url && published.has(url), `${entry.name}: ${url} is not a published docs page`);
  }
  for (const name of components) assert.ok(catalog.includes(name), `${name} has no docs page`);
});

test("a component that renders links brings OuroProvider, which only the app imports", () => {
  assert.ok(item("lib-router-link").registryDependencies.includes(repo("lib-ouro-provider")));
  const installs = (name, seen = new Set()) => {
    if (seen.has(name)) return seen;
    seen.add(name);
    for (const dep of item(name).registryDependencies ?? []) installs(dep.split("/").at(-1), seen);
    return seen;
  };
  for (const name of ["button", "link", "card", "item", "table"]) assert.ok(installs(name).has("lib-ouro-provider"), `${name} installs OuroProvider`);
  assert.ok(installs("button-tests").has("lib-ouro-provider-tests"), "and its tests come with the component's tests");
});
