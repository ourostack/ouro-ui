import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  assert.equal(registry.homepage, "https://github.com/ourostack/ouro-ui");
  assert.deepEqual(
    registry.items.map((entry) => entry.name),
    ["ouro-base", "ouro-theme", "ouro-lib", "ouro-testing", "button", "text", "heading", "sheet", "dialog", "confirm-dialog"],
  );
});

test("theme items come from the repository's CSS, in shadcn's cssVars format", () => {
  const base = item("ouro-base");
  assert.equal(base.type, "registry:item");
  assert.equal(base.cssVars.light.success, "#157d3c");
  assert.equal(base.cssVars.dark.success, "#4ade80");
  assert.equal(base.cssVars.light["destructive-foreground"], "#ffffff");
  assert.equal(base.cssVars.light["ouro-spring-duration"], "750ms");
  assert.match(base.cssVars.light["ouro-ease-spring"], /^linear\(0, /);
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
  const css = `/* c */ :root { --a: 1px; } .dark { --a: 2px; } @theme inline { --color-a: var(--a); }
    @utility tap { scale: 0.9; } @keyframes k { from { opacity: 0; } }`;
  assert.deepEqual(cssToItem(css), {
    cssVars: { light: { a: "1px" }, dark: { a: "2px" }, theme: { "color-a": "var(--a)" } },
    css: { "@utility tap": { scale: "0.9" }, "@keyframes k": { from: { opacity: "0" } } },
  });
  assert.throws(() => cssToItem(":root { color: red; }"), /:root.*only custom properties/);
  assert.throws(() => cssToItem("@import 'x.css';"), /@import/);
});

test("components ship as registry:ui, tests and stories as registry:component, specs as registry:file", () => {
  const files = Object.fromEntries(item("sheet").files.map((file) => [file.path, file]));
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
  assert.ok(item("confirm-dialog").files.some((file) => file.path.endsWith("confirm-dialog.stories.tsx")));
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
  assert.equal(itemForFile("registry/ouro/components/ouro/dialog/confirm-dialog.test.tsx"), "confirm-dialog");
  assert.equal(itemForFile("registry/ouro/lib/ouro/testing/act.ts"), "ouro-testing");
  assert.equal(itemForFile("registry/ouro/theme/theme.test.tsx"), null);
  assert.throws(() => itemForFile("registry/ouro/components/ouro/menu/menu.tsx"), /menu\.tsx.*no item/);
});

test("registryDependencies are the same-repo items each item imports, as full unpinned addresses", () => {
  assert.deepEqual(item("dialog").registryDependencies, [
    repo("button"),
    repo("ouro-base"),
    repo("ouro-lib"),
    repo("ouro-testing"),
    repo("sheet"),
  ]);
  assert.deepEqual(item("heading").registryDependencies, [repo("button"), repo("ouro-base"), repo("ouro-lib"), repo("ouro-testing"), repo("text")]);
  assert.deepEqual(item("ouro-lib").registryDependencies, [repo("ouro-testing")]);
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
  assert.deepEqual(item("button").devDependencies, ["@playwright/test@^1.63.0", "@storybook/react-vite@^10.6.1", "storybook@^10.6.1", "vitest@^5.0.3"]);
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
  assert.equal(sheet.docs, `${sheet.description} Docs: https://ourostack.github.io/ouro-ui/docs/sheet`);
  assert.match(item("confirm-dialog").docs, /https:\/\/ourostack\.github\.io\/ouro-ui\/docs\/confirm-dialog$/);
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
    "/tmp/r/button.json",
    "/tmp/r/ouro-base.json",
    "/tmp/r/ouro-lib.json",
    "/tmp/r/ouro-testing.json",
    "/tmp/r/text.json",
  ]);
  assert.deepEqual(item("heading").registryDependencies[0], repo("button"));
});

test("--deps writes a copy whose same-repo dependencies follow a template: the @ouro namespace (Pages) or local files (install test)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ouro-registry-"));
  assert.equal(run("--out", join(dir, "ns.json"), "--deps", "@ouro/{name}").status, 0);
  const namespaced = JSON.parse(readFileSync(join(dir, "ns.json"), "utf8"));
  assert.deepEqual(namespaced.items.find((entry) => entry.name === "dialog").registryDependencies, [
    "@ouro/button",
    "@ouro/ouro-base",
    "@ouro/ouro-lib",
    "@ouro/ouro-testing",
    "@ouro/sheet",
  ]);
  assert.equal(namespaced.version, undefined);
  assert.equal(run("--out", join(dir, "local.json"), "--deps", "/srv/r/{name}.json").status, 0);
  const local = JSON.parse(readFileSync(join(dir, "local.json"), "utf8"));
  assert.deepEqual(local.items.find((entry) => entry.name === "ouro-lib").registryDependencies, ["/srv/r/ouro-testing.json"]);
  assert.equal(run("--out", join(dir, "bad.json"), "--deps", "@ouro/").status, 1, "a template without {name} fails");
});

test("--release pins every same-repo dependency to the release tag and records the version", () => {
  const out = join(mkdtempSync(join(tmpdir(), "ouro-registry-")), "registry.json");
  assert.equal(run("--out", out, "--release", "0.1.0").status, 0);
  const released = JSON.parse(readFileSync(out, "utf8"));
  assert.deepEqual(Object.keys(released), ["$schema", "name", "homepage", "version", "items"]);
  assert.equal(released.version, "0.1.0");
  assert.deepEqual(released.items.find((entry) => entry.name === "dialog").registryDependencies, [
    "ourostack/ouro-ui/button#v0.1.0",
    "ourostack/ouro-ui/ouro-base#v0.1.0",
    "ourostack/ouro-ui/ouro-lib#v0.1.0",
    "ourostack/ouro-ui/ouro-testing#v0.1.0",
    "ourostack/ouro-ui/sheet#v0.1.0",
  ]);
  for (const entry of released.items) {
    for (const dependency of entry.registryDependencies ?? []) assert.match(dependency, /^ourostack\/ouro-ui\/[\w-]+#v0\.1\.0$/);
  }

  // CI on the release branch: --check reads the version from the file and still catches drift.
  assert.equal(run("--check", "--out", out).status, 0);
  released.items.find((entry) => entry.name === "dialog").registryDependencies[0] = "ourostack/ouro-ui/button";
  writeFileSync(out, JSON.stringify(released, null, 2) + "\n");
  assert.equal(run("--check", "--out", out).status, 1);

  // On main, and on pull requests into main, a released file never passes: main stays unpinned.
  assert.equal(run("--out", out, "--release", "0.1.0").status, 0);
  for (const env of [{ GITHUB_REF: "refs/heads/main" }, { GITHUB_BASE_REF: "main" }]) {
    const onMain = spawnSync("node", [script, "--check", "--out", out], { cwd: root, encoding: "utf8", env: { ...branchEnv, ...env } });
    assert.equal(onMain.status, 1, JSON.stringify(env));
    assert.match(onMain.stderr, /pinned to a release.*main stays unpinned/s);
  }
  const mainOk = spawnSync("node", [script, "--check"], { cwd: root, encoding: "utf8", env: { ...branchEnv, GITHUB_REF: "refs/heads/main" } });
  assert.equal(mainOk.status, 0, mainOk.stderr);

  const bad = run("--out", out, "--release", "v0.1.0");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--release takes x\.y\.z/);
});

test("the install fixture uses exactly the setup files the ouro-testing docs print", () => {
  const docs = item("ouro-testing").docs;
  for (const [path, content] of Object.entries(testingSetup)) {
    assert.equal(readFileSync(join(root, "test/install-fixture", path), "utf8"), content, `test/install-fixture/${path} differs from the docs`);
    assert.ok(docs.includes(`--- ${path}\n${content}`), `the docs print ${path}`);
  }
  assert.ok("playwright.config.ts" in testingSetup, "the fixture's Playwright config is one of the documented files");
  assert.match(docs, /npx storybook dev -p 6006/);
  assert.match(docs, /Then run npx playwright test e2e\/ouro\./);
  assert.match(docs, /OURO_E2E_URL=http:\/\/localhost:6006 npx playwright test e2e\/ouro/);
});
