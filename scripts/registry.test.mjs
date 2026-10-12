import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildRegistry, cssToItem, itemForFile, rewriteDependencies, testingSetup } from "./registry.mts";

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
  const out = join(mkdtempSync(join(tmpdir(), "ouro-registry-")), "registry.json");
  assert.equal(run("--out", out).status, 0);
  assert.equal(run("--check", "--out", out).status, 0);
  const stale = JSON.parse(readFileSync(out, "utf8"));
  stale.items.find((entry) => entry.name === "ouro-base").cssVars.light.success = "#000000";
  writeFileSync(out, JSON.stringify(stale, null, 2) + "\n");
  const result = run("--check", "--out", out);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stale.*pnpm registry/s);
});

test("the registry is named ouro and lists every item", () => {
  assert.equal(registry.name, "ouro");
  assert.equal(registry.homepage, "https://ourostack.github.io/ouro-ui/");
  assert.deepEqual(
    registry.items.map((entry) => entry.name),
    [
      "ouro-base",
      "ouro-theme",
      "ouro-lib",
      "ouro-testing",
      "button",
      "text",
      "heading",
      "sheet",
      "dialog",
      "confirm-dialog",
      "field",
      "fieldset",
      "link",
      "text-field",
      "text-area",
      "toaster",
      "spinner",
      "progress",
      "skeleton",
      "ouro-lib-tests",
      "button-tests",
      "text-tests",
      "heading-tests",
      "sheet-tests",
      "dialog-tests",
      "confirm-dialog-tests",
      "field-tests",
      "fieldset-tests",
      "link-tests",
      "text-field-tests",
      "text-area-tests",
      "toaster-tests",
      "spinner-tests",
      "progress-tests",
      "skeleton-tests",
      "ouro-tests",
    ],
  );
});

const components = ["button", "text", "heading", "sheet", "dialog", "confirm-dialog", "field", "fieldset", "link", "text-field", "text-area", "toaster", "spinner", "progress", "skeleton"];
const runtimeItems = ["ouro-base", "ouro-theme", "ouro-lib", ...components];
const testFile = /\.(test|touch\.test)\.tsx?$|\.test-d\.ts$|\.stories\.tsx$|\.spec\.ts$/;

test("runtime items ship no tests, stories, specs or test tooling, and never pull in the test kit", () => {
  for (const name of runtimeItems) {
    const entry = item(name);
    for (const file of entry.files ?? []) assert.doesNotMatch(file.path, testFile, `${name} ships ${file.path}`);
    assert.equal(entry.devDependencies, undefined, `${name} has devDependencies`);
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
  const copy = mkdtempSync(join(tmpdir(), "ouro-registry-root-"));
  for (const path of ["registry", "docs", "package.json"]) cpSync(join(root, path), join(copy, path), { recursive: true });
  const button = join(copy, "registry/ouro/components/ouro/button/button.tsx");
  writeFileSync(button, readFileSync(button, "utf8") + '\nimport { expect } from "vitest";\n');
  assert.throws(() => buildRegistry(copy), /button is a runtime item but imports test tooling: vitest/);
});

test("each -tests item's description names the kinds of file it ships", () => {
  assert.match(item("ouro-lib-tests").description, /^Optional: the Vitest browser tests for ouro-lib,/);
  assert.match(item("text-tests").description, /^Optional: the Vitest browser tests, type tests, stories and Playwright spec for text,/);
});

test("each component has an opt-in -tests item with its tests, type tests, stories and spec", () => {
  for (const name of [...components, "ouro-lib"]) {
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
  assert.ok(item("ouro-lib-tests").files.some((file) => file.path === "registry/ouro/lib/ouro/cn.test.ts"));
  assert.deepEqual(item("button-tests").devDependencies, ["@playwright/test@^1.63.0", "@storybook/react-vite@^10.6.1", "storybook@^10.6.1", "vitest@^5.0.3"]);
});

test("ouro-tests installs every -tests item: the whole suite in one command", () => {
  const all = item("ouro-tests");
  assert.equal(all.type, "registry:item");
  assert.match(all.description, /^Optional: /);
  assert.equal(all.files, undefined);
  assert.deepEqual(all.registryDependencies, ["ouro-lib", ...components].map((name) => repo(`${name}-tests`)).sort());
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
  assert.match(base.css["@utility press"].transition, /scale var\(--ouro-spring-duration\) var\(--ouro-ease-spring\)/);
  assert.deepEqual(base.css["@keyframes ouro-spin"], { to: { rotate: "1turn" } });
  assert.deepEqual(base.css["@keyframes ouro-pulse"], { "50%": { opacity: "0.4" } });

  const theme = item("ouro-theme");
  assert.equal(theme.type, "registry:theme");
  assert.equal(theme.cssVars.light.primary, "#2261eb");
  assert.equal(theme.cssVars.light.radius, "0.5rem");
  assert.equal(theme.cssVars.dark.primary, "#60a5fa");
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
  for (const file of item("ouro-lib").files) {
    assert.equal(file.type, "registry:lib");
    assert.match(file.target, /^@lib\/ouro\/[\w.-]+$/);
  }
  assert.ok(item("ouro-lib").files.some((file) => file.target === "@lib/ouro/env.d.ts"));
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
  assert.equal(itemForFile("registry/ouro/lib/ouro/cn.test.ts"), "ouro-lib-tests");
  assert.equal(itemForFile("registry/ouro/e2e/ouro/story.ts"), "ouro-testing");
  assert.equal(itemForFile("registry/ouro/lib/ouro/testing/act.ts"), "ouro-testing");
  assert.equal(itemForFile("registry/ouro/theme/theme.test.tsx"), null);
  assert.throws(() => itemForFile("registry/ouro/components/ouro/menu/menu.tsx"), /menu\.tsx.*no item/);
});

test("registryDependencies are the same-repo items each item imports, as full unpinned addresses", () => {
  assert.deepEqual(item("dialog").registryDependencies, [repo("ouro-base"), repo("ouro-lib"), repo("sheet")]);
  assert.deepEqual(item("heading").registryDependencies, [repo("ouro-base"), repo("ouro-lib"), repo("text")]);
  assert.deepEqual(item("confirm-dialog").registryDependencies, [repo("button"), repo("dialog"), repo("ouro-base"), repo("ouro-lib")]);
  assert.equal(item("ouro-lib").registryDependencies, undefined);
  assert.deepEqual(item("heading-tests").registryDependencies, [repo("button"), repo("heading"), repo("ouro-testing"), repo("text")]);
  assert.deepEqual(item("dialog-tests").registryDependencies, [repo("button"), repo("dialog"), repo("ouro-testing"), repo("sheet")]);
  assert.deepEqual(item("ouro-lib-tests").registryDependencies, [repo("ouro-lib"), repo("ouro-testing")]);
  assert.equal(item("ouro-testing").registryDependencies, undefined);
  assert.equal(item("ouro-theme").registryDependencies, undefined);
  for (const entry of registry.items) {
    for (const dependency of entry.registryDependencies ?? []) assert.doesNotMatch(dependency, /#/);
  }
});

test("npm dependencies are pinned to the ranges this repository tests", () => {
  assert.deepEqual(item("button").dependencies, ["@base-ui/react@^1.8.0"]);
  assert.deepEqual(item("ouro-lib").dependencies, ["clsx@^2.1.1", "tailwind-merge@^3.7.0"]);
  assert.ok(!JSON.stringify(registry).includes('"motion@'), "no item depends on motion");
  assert.equal(item("button").devDependencies, undefined);
  assert.deepEqual(item("ouro-testing").devDependencies, ["@playwright/test@^1.63.0", "@vitest/browser-playwright@^5.0.3", "playwright@^1.63.0", "vitest@^5.0.3"]);
  for (const entry of registry.items) {
    for (const dependency of [...(entry.dependencies ?? []), ...(entry.devDependencies ?? [])]) {
      assert.doesNotMatch(dependency, /^react(-dom)?@/);
      assert.match(dependency, /@\^\d+\.\d+\.\d+$/);
    }
  }
});

test("each item has a one-line description and a docs message with its docs URL", () => {
  const sheet = item("sheet");
  assert.equal(sheet.title, "Sheet");
  assert.equal(sheet.description, "A panel that slides in from an edge and is dragged back to dismiss: the mobile form of a dialog.");
  assert.equal(
    sheet.docs,
    `${sheet.description} Import: import { Sheet } from "@/components/ouro/sheet/sheet", with @/components replaced by your components alias (aliases.components in components.json, such as ~/components). Also installed: ouro-base, ouro-lib. Docs: https://ourostack.github.io/ouro-ui/docs/sheet.md`,
  );
  assert.equal(
    item("confirm-dialog").docs,
    `${item("confirm-dialog").description} Import: import { ConfirmDialog } from "@/components/ouro/dialog/confirm-dialog", with @/components replaced by your components alias (aliases.components in components.json, such as ~/components). Also installed: button, dialog, ouro-base, ouro-lib, sheet. Docs: https://ourostack.github.io/ouro-ui/docs/confirm-dialog.md`,
  );
  assert.match(item("heading").docs, /import \{ Heading \} from "@\/components\/ouro\/text\/heading"/);
  for (const name of ["ouro-base", "ouro-lib"]) {
    assert.match(item(name).description, /^Installed with every component; you don't need to add it\. /, name);
  }
  assert.match(item("ouro-testing").description, /^Installed with every -tests item; you don't need to add it\. /);
  assert.match(item("sheet-tests").docs, /https:\/\/ourostack\.github\.io\/ouro-ui\/docs\/sheet\.md$/);
  for (const name of ["button", "text", "heading", "sheet", "dialog", "confirm-dialog", "field", "fieldset", "link", "text-field", "text-area", "toaster", "spinner", "progress", "skeleton"]) {
    assert.ok(item(name).docs.endsWith(`Docs: https://ourostack.github.io/ouro-ui/docs/${name}.md`), name);
  }
  assert.match(item("ouro-testing").docs, /ouroTestProjects/);
  assert.match(item("ouro-testing").docs, /OURO_E2E_URL/);
  for (const entry of registry.items) {
    assert.ok(entry.description.length > 0 && !entry.description.includes("\n"), entry.name);
    assert.ok(entry.docs, entry.name);
  }
});

test("rewriteDependencies points same-repo dependencies anywhere, leaving the registry unchanged", () => {
  const local = rewriteDependencies(registry, (name) => `/tmp/r/${name}.json`);
  assert.deepEqual(local.items.find((entry) => entry.name === "heading").registryDependencies, [
    "/tmp/r/ouro-base.json",
    "/tmp/r/ouro-lib.json",
    "/tmp/r/text.json",
  ]);
  assert.deepEqual(item("heading").registryDependencies[0], repo("ouro-base"));
});

test("--deps writes a copy whose same-repo dependencies follow a template: the @ouro namespace (Pages) or local files (install test)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ouro-registry-"));
  assert.equal(run("--out", join(dir, "ns.json"), "--deps", "@ouro/{name}").status, 0);
  const namespaced = JSON.parse(readFileSync(join(dir, "ns.json"), "utf8"));
  assert.deepEqual(namespaced.items.find((entry) => entry.name === "dialog").registryDependencies, [
    "@ouro/ouro-base",
    "@ouro/ouro-lib",
    "@ouro/sheet",
  ]);
  assert.ok(namespaced.items.find((entry) => entry.name === "ouro-tests").registryDependencies.includes("@ouro/dialog-tests"));
  assert.equal(namespaced.version, undefined);
  assert.equal(run("--out", join(dir, "local.json"), "--deps", "/srv/r/{name}.json").status, 0);
  const local = JSON.parse(readFileSync(join(dir, "local.json"), "utf8"));
  assert.deepEqual(local.items.find((entry) => entry.name === "ouro-lib-tests").registryDependencies, ["/srv/r/ouro-lib.json", "/srv/r/ouro-testing.json"]);
  assert.equal(run("--out", join(dir, "bad.json"), "--deps", "@ouro/").status, 1, "a template without {name} fails");
});

test("--release pins every same-repo dependency to the release tag and records the version", () => {
  const out = join(mkdtempSync(join(tmpdir(), "ouro-registry-")), "registry.json");
  assert.equal(run("--out", out, "--release", "0.1.0").status, 0);
  const released = JSON.parse(readFileSync(out, "utf8"));
  assert.deepEqual(Object.keys(released), ["$schema", "name", "homepage", "version", "items"]);
  assert.equal(released.version, "0.1.0");
  assert.deepEqual(released.items.find((entry) => entry.name === "dialog").registryDependencies, [
    "ourostack/ouro-ui/ouro-base#v0.1.0",
    "ourostack/ouro-ui/ouro-lib#v0.1.0",
    "ourostack/ouro-ui/sheet#v0.1.0",
  ]);
  assert.ok(released.items.find((entry) => entry.name === "ouro-tests").registryDependencies.includes("ourostack/ouro-ui/sheet-tests#v0.1.0"));
  assert.ok(released.items.find((entry) => entry.name === "sheet-tests").registryDependencies.includes("ourostack/ouro-ui/sheet#v0.1.0"));
  for (const entry of released.items) {
    for (const dependency of entry.registryDependencies ?? []) assert.match(dependency, /^ourostack\/ouro-ui\/[\w-]+#v0\.1\.0$/);
    // Every add prints the version it installed; the CLI shows no other trace of it.
    assert.ok(entry.docs.endsWith(" Ouro UI v0.1.0."), `${entry.name}: ${entry.docs.slice(-60)}`);
    assert.equal(entry.docs, `${item(entry.name).docs} Ouro UI v0.1.0.`);
  }
  for (const entry of registry.items) assert.doesNotMatch(entry.docs, /Ouro UI v\d/, `${entry.name} names a version on main`);

  // CI on the release branch: --check reads the version from the file and still catches drift.
  assert.equal(run("--check", "--out", out).status, 0);
  released.items.find((entry) => entry.name === "dialog").registryDependencies[0] = "ourostack/ouro-ui/ouro-base";
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
  assert.match(docs, /npx storybook dev -p 6006/);
  assert.match(docs, /Then run npx playwright test e2e\/ouro\./);
  assert.match(docs, /OURO_E2E_URL=http:\/\/localhost:6006 npx playwright test e2e\/ouro/);
});

test("site/public/llms.txt gives the init, search and add commands and lists every item", () => {
  const llms = readFileSync(join(root, "site/public/llms.txt"), "utf8");
  assert.ok(llms.includes("npx shadcn@latest init --base base --preset nova --yes --no-monorepo"));
  assert.ok(llms.includes("npx shadcn@latest search 'ourostack/ouro-ui#v"));
  assert.ok(llms.includes("npx shadcn@latest add ourostack/ouro-ui/dialog#v"));
  const components = ["button", "text", "heading", "sheet", "dialog", "confirm-dialog", "field", "fieldset", "link", "text-field", "text-area", "toaster", "spinner", "progress", "skeleton"];
  for (const entry of registry.items) {
    // A component's line ends with its page's full Markdown URL, so an agent never composes one.
    const line = components.includes(entry.name)
      ? `- \`${entry.name}\`: ${entry.description} Docs: https://ourostack.github.io/ouro-ui/docs/${entry.name}.md\n`
      : `- \`${entry.name}\`: ${entry.description}\n`;
    assert.ok(llms.includes(line), `llms.txt lists ${entry.name} with its registry description; update site/public/llms.txt`);
  }
  assert.ok(llms.includes("https://ourostack.github.io/ouro-ui/docs/parts.md"), "llms.txt links parts.md");
});

test("--from rewrites a released registry.json for the @ouro namespace, keeping its version and docs (Pages serves the newest tag)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ouro-registry-"));
  const released = join(dir, "released.json");
  assert.equal(run("--out", released, "--release", "0.3.0").status, 0);
  assert.equal(run("--from", released, "--out", join(dir, "ns.json"), "--deps", "@ouro/{name}").status, 0);
  const namespaced = JSON.parse(readFileSync(join(dir, "ns.json"), "utf8"));
  assert.equal(namespaced.version, "0.3.0");
  assert.deepEqual(namespaced.items.find((entry) => entry.name === "dialog").registryDependencies, ["@ouro/ouro-base", "@ouro/ouro-lib", "@ouro/sheet"]);
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
