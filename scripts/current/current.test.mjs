import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, createVerify, generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { lintMarkdown, lintPlain } from "../../registry/ouro/lib/ouro/claims-check.mjs";
import { AGENTS_PATH, BAR, SKILL, SKILL_PATH, withBar } from "./agents.mjs";
import { BRANCH, body, createSources, keepCurrent, keepRepo, main, publicView, title } from "./current.mjs";
import { checkRulesSection } from "./known.mjs";
import { appJwt, createGitHub, retryable } from "./github.mjs";
import { UPDATERS, appleRequirement, findPins, isBehind, isCandidate, takes } from "./pins.mjs";
import { applyItem, importBase } from "./stylesheet.mjs";
import { readTarball } from "./tar.mjs";
import { fakeRepo, tarball } from "./fake-github.mjs";
import { scratchDir } from "../scratch.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const RELEASES = {
  web: { repo: "ourostack/ouro-ui", name: "Ouro UI", tag: "v1.3.187", sha: "c".repeat(40), url: "https://example.test/web" },
  core: { repo: "ourostack/ouro-ui-core", name: "Ouro UI core", tag: "v0.15.0", sha: "d".repeat(40), url: "https://example.test/core" },
  apple: { repo: "ourostack/ouro-ui-apple", name: "Ouro UI for Apple", tag: "v0.9.0", sha: "e".repeat(40), url: "https://example.test/apple" },
  windows: { repo: "ourostack/ouro-ui-windows", name: "Ouro UI for Windows", tag: "v0.12.0", sha: "a".repeat(40), url: "https://example.test/windows" },
  android: { repo: "ourostack/ouro-ui-android", name: "Ouro UI for Android", tag: "v0.12.0", sha: "b".repeat(40), url: "https://example.test/android" },
};


test("the tarball reader drops the top folder and reads long names", () => {
  const long = `registry/ouro/components/ouro/${"x".repeat(80)}/file.tsx`;
  const files = readTarball(tarball({ "a.txt": "one", [long]: "two" }));
  assert.equal(files.get("a.txt").toString(), "one");
  assert.equal(files.get(long).toString(), "two");
});

test("pins are found by file name in every format Ouro UI is taken in", () => {
  const found = (path, text) => findPins(path, text).map((pin) => [pin.kind, pin.follows, pin.current]);
  assert.deepEqual(found(".github/ouro-hx-installed.json", JSON.stringify({ tag: "v1.3.117", files: {} })), [["hx-installed", "web", "v1.3.117"]]);
  assert.deepEqual(found("vendor/ouro-ui-core/pin.json", JSON.stringify({ tag: "v0.13.1", asset: "ouro-ui-core-v0.13.1-dist.zip", path: "web/themes/cookbook.css" })), [["core-pin", "core", "v0.13.1"]]);
  assert.deepEqual(found("Package.swift", '.package(url: "https://github.com/ourostack/ouro-ui-apple.git", exact: "0.6.0")'), [["swiftpm", "apple", "0.6.0"]]);
  assert.deepEqual(found("Package.swift", '.package(url: "https://github.com/ourostack/ouro-ui-apple.git", .upToNextMinor(from: "0.6.0"))'), [["swiftpm", "apple", "0.6.0"]]);
  assert.deepEqual(found("Package.resolved", '{"pins":[{"identity":"ouro-ui-apple","kind":"remoteSourceControl","state":{"revision":"abc","version":"0.6.0"}}]}'), [["swiftpm-resolved", "apple", "0.6.0"]]);
  assert.deepEqual(found("project.yml", "packages:\n  OuroUIApple:\n    url: https://github.com/ourostack/ouro-ui-apple\n    minorVersion: 0.8.0\n"), [["xcodegen", "apple", "0.8.0"]]);
  assert.deepEqual(found("App.xcodeproj/project.pbxproj", 'repositoryURL = "https://github.com/ourostack/ouro-ui-apple";\n\t\t\trequirement = {\n\t\t\t\tkind = upToNextMinorVersion;\n\t\t\t\tminimumVersion = 0.5.1;\n\t\t\t};'), [["xcodeproj", "apple", "0.5.1"]]);
  assert.deepEqual(found(".github/workflows/site-checks.yml", "env:\n  OURO_UI_TAG: v1.3.99\n"), [["workflow-tag", "web", "v1.3.99"]]);
  assert.deepEqual(found("App/App.csproj", '<PackageReference Include="Ouro.UI.Windows" Version="0.11.0" />'), [["nuget", "windows", "0.11.0"]]);
  assert.deepEqual(found("Directory.Packages.props", '<PackageVersion Include="Ouro.Actions" Version="0.11.0" />'), [["nuget", "windows", "0.11.0"]]);
  assert.deepEqual(found("App/App.csproj", '<PackageReference Include="Ouro.UI.Windows" Version="0.*" /><PackageReference Include="Other" Version="1.0.0" />'), []);
  assert.deepEqual(found("app/build.gradle.kts", 'implementation("bot.ouro.ui:ouro-hx:0.11.0")'), [["gradle", "android", "0.11.0"]]);
  assert.deepEqual(found("gradle/libs.versions.toml", '[versions]\nouro = "0.11.0"\n\n[libraries]\nouro-hx = { module = "bot.ouro.ui:ouro-hx", version.ref = "ouro" }\n'), [["gradle", "android", "0.11.0"]]);
  assert.deepEqual(found("app/build.gradle", "implementation 'androidx.core:core-ktx:1.13.0'"), []);
  assert.equal(isCandidate("App/obj/App.csproj"), false);
  assert.equal(isCandidate("app/build/generated/x.gradle"), false);
  assert.deepEqual(found("upstream-sources.lock.json", JSON.stringify({ sources: [{ id: "ax", repository: "ourostack/ouro-ui", commit: "4e44b67613dc", files: [] }, { id: "other", repository: "someone/else", commit: "f", files: [] }] })), [["vendor-lock", "web", "commit 4e44b67"]]);
  assert.deepEqual(found("tools/ouro-actions/dist-manifest.json", JSON.stringify({ coreTag: "v0.16.0", files: { "dist/actions/ouro-actions.mts": "x" } })), [["core-manifest", "core", "v0.16.0"]]);
  assert.deepEqual(found("site/dist-manifest.json", JSON.stringify({ version: 1, files: {} })), []);
  assert.equal(isCandidate("tools/ouro-actions/dist-manifest.json"), true);
  assert.deepEqual(found("Package.swift", '.package(url: "https://github.com/apple/swift-argument-parser", from: "1.0.0")'), []);
  assert.equal(isCandidate("node_modules/x/Package.swift"), false);
  assert.equal(isCandidate("Sources/App/Package.swift"), true);
  assert.equal(isCandidate("README.md"), false);
});

test("a pin is behind unless it is on the release it follows, with or without the v", () => {
  assert.equal(isBehind({ kind: "swiftpm", current: "0.9.0" }, RELEASES.apple), false);
  assert.equal(isBehind({ kind: "swiftpm", current: "0.8.0" }, RELEASES.apple), true);
  assert.equal(isBehind({ kind: "vendor-lock", commit: RELEASES.web.sha }, RELEASES.web), false);
});

test("version pins move to the release, written the way the file writes them", async () => {
  const run = async (kind, file, text, follows) => (await UPDATERS[kind]({ kind, file, follows }, text, RELEASES[follows], {})).files[file];
  assert.equal(await run("swiftpm", "Package.swift", '.package(url: "https://github.com/ourostack/ouro-ui-apple.git", exact: "0.6.0")', "apple"), '.package(url: "https://github.com/ourostack/ouro-ui-apple.git", exact: "0.9.0")');
  assert.equal(await run("xcodegen", "project.yml", "  OuroUIApple:\n    url: https://github.com/ourostack/ouro-ui-apple\n    minorVersion: 0.8.0\n", "apple"), "  OuroUIApple:\n    url: https://github.com/ourostack/ouro-ui-apple\n    minorVersion: 0.9.0\n");
  assert.equal(await run("workflow-tag", ".github/workflows/a.yml", "  OURO_UI_TAG: v1.3.99\n", "web"), "  OURO_UI_TAG: v1.3.187\n");
  assert.match(await run("xcodeproj", "p.pbxproj", 'repositoryURL = "https://github.com/ourostack/ouro-ui-apple";\n requirement = {\n kind = exactVersion;\n version = 0.5.1;\n };', "apple"), /version = 0\.9\.0;/);
  const resolved = await run("swiftpm-resolved", "Package.resolved", '{"pins":[{"identity":"other","state":{"revision":"111","version":"1.0.0"}},{"identity":"ouro-ui-apple","state":{"revision":"abc123","version":"0.6.0"}}]}', "apple");
  assert.equal(resolved, `{"pins":[{"identity":"other","state":{"revision":"111","version":"1.0.0"}},{"identity":"ouro-ui-apple","state":{"revision":"${"e".repeat(40)}","version":"0.9.0"}}]}`);
});

test("Ouro HX takes the new tag's source as the CLI would write it, adds files its items gained, and leaves an edited file alone", async () => {
  const registry = { items: [
    { name: "button", files: [{ path: "registry/ouro/components/ouro/button/button.tsx", target: "@components/ouro/button/button.tsx" }, { path: "registry/ouro/lib/ouro/press.ts", target: "@lib/ouro/press.ts" }] },
    { name: "alert", files: [{ path: "registry/ouro/components/ouro/alert/alert.tsx", target: "@components/ouro/alert/alert.tsx" }] },
    { name: "census", files: [{ path: "registry/ouro/census/census.mjs", target: "~/e2e/ouro-census/census.mjs" }] },
  ] };
  const oldRegistry = { items: registry.items.map((item) => ({ ...item, files: item.files.filter((file) => !file.path.endsWith("press.ts")) })) };
  const button = (v) => `import { cn } from "@/registry/ouro/lib/ouro/cn";\nexport const Button = "${v}";\n`;
  const previous = new Map(Object.entries({ "registry.json": JSON.stringify(oldRegistry), "registry/ouro/components/ouro/button/button.tsx": button("v1"), "registry/ouro/components/ouro/alert/alert.tsx": "alert v1", "registry/ouro/census/census.mjs": "census v1" }).map(([k, v]) => [k, Buffer.from(v)]));
  const next = new Map(Object.entries({ "registry.json": JSON.stringify(registry), "registry/ouro/components/ouro/button/button.tsx": button("v2"), "registry/ouro/lib/ouro/press.ts": 'import { cn } from "@/registry/ouro/lib/ouro/cn";\n', "registry/ouro/components/ouro/alert/alert.tsx": "alert v2", "registry/ouro/census/census.mjs": "census v2" }).map(([k, v]) => [k, Buffer.from(v)]));
  const record = { tag: "v1.3.117", tagCommit: "old", files: { "app/components/ouro/button/button.tsx": sha256(button("v1")), "app/components/ouro/alert/alert.tsx": sha256("alert v1"), "e2e/ouro-census/census.mjs": sha256("census v1") } };
  const consumer = new Map([
    ["components.json", Buffer.from(JSON.stringify({ aliases: { components: "~/components", lib: "~/lib" } }))],
    ["app/components/ouro/button/button.tsx", Buffer.from(button("v1").replace("@/registry/ouro/lib/", "~/lib/"))],
    ["app/components/ouro/alert/alert.tsx", Buffer.from("alert edited here")],
    ["e2e/ouro-census/census.mjs", Buffer.from("census v1")],
  ]);
  const ctx = { tarball: async (follows, tag) => (tag === "v1.3.117" ? previous : next), consumerFiles: async () => consumer };
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  assert.equal(update.files["app/components/ouro/button/button.tsx"].toString(), button("v2").replace("@/registry/ouro/lib/", "~/lib/"), "imports are rewritten to the app's aliases, as the CLI does");
  assert.equal(update.files["app/lib/ouro/press.ts"].toString(), 'import { cn } from "~/lib/ouro/cn";\n', "the button item's new file comes with it");
  assert.equal(update.files["e2e/ouro-census/census.mjs"].toString(), "census v2");
  assert.equal(update.files["app/components/ouro/alert/alert.tsx"], undefined, "an edited file is never overwritten");
  const written = JSON.parse(update.files[pin.file]);
  assert.equal(written.tag, "v1.3.187");
  assert.equal(written.tagCommit, RELEASES.web.sha);
  assert.equal(written.files["app/components/ouro/button/button.tsx"], sha256(button("v2")), "the record keeps the registry source's hash");
  assert.equal(written.files["app/components/ouro/alert/alert.tsx"], sha256("alert v1"));
  assert.ok(update.notes.some((note) => note.includes("alert.tsx") && /edited here/.test(note)));
});

test("Ouro HX reads a file that imports the shared Ouro AX files as the CLI wrote it, under the lib alias without an extension, and updates it", async () => {
  const registry = { items: [
    { name: "live-captions", files: [{ path: "registry/ouro/components/ouro/live-captions/live-captions-styles.ts", target: "@components/ouro/live-captions/live-captions-styles.ts" }], registryDependencies: ["ax-component"] },
    { name: "ax-component", files: [{ path: "registry/ouro/ax/component.ts", target: "@lib/ouro/ax/component.ts" }, { path: "registry/ouro/ax/index.ts", target: "@lib/ouro/ax/index.ts" }] },
  ] };
  const styles = (v) => `import { defineComponentAx } from "@/registry/ouro/ax/component";\nimport { kit } from '@/registry/ouro/ax/index.ts';\nexport * from "@/registry/ouro/ax/component.ts";\nexport const ax = defineComponentAx({ rounded: "${v}" }); // @/registry/ouro/ax/ in prose stays\n`;
  const at = (v) => new Map(Object.entries({ "registry.json": JSON.stringify(registry), "registry/ouro/components/ouro/live-captions/live-captions-styles.ts": styles(v), "registry/ouro/ax/component.ts": `export const component = "${v}";\n`, "registry/ouro/ax/index.ts": `export const kit = "${v}";\n` }).map(([k, value]) => [k, Buffer.from(value)]));
  const written = (v) => `import { defineComponentAx } from "~/lib/ouro/ax/component";\nimport { kit } from '~/lib/ouro/ax';\nexport * from "~/lib/ouro/ax/component";\nexport const ax = defineComponentAx({ rounded: "${v}" }); // @/registry/ouro/ax/ in prose stays\n`;
  const path = "app/components/ouro/live-captions/live-captions-styles.ts";
  const record = { tag: "v1.3.244", tagCommit: "old", files: { [path]: sha256(styles("rounded-xl")), "app/lib/ouro/ax/component.ts": sha256('export const component = "rounded-xl";\n'), "app/lib/ouro/ax/index.ts": sha256('export const kit = "rounded-xl";\n') } };
  const consumer = new Map([
    ["components.json", Buffer.from(JSON.stringify({ aliases: { components: "~/components", lib: "~/lib" } }))],
    [path, Buffer.from(written("rounded-xl"))],
    ["app/lib/ouro/ax/component.ts", Buffer.from('export const component = "rounded-xl";\n')],
    ["app/lib/ouro/ax/index.ts", Buffer.from('export const kit = "rounded-xl";\n')],
  ]);
  const ctx = { tarball: async (follows, tag) => at(tag === "v1.3.244" ? "rounded-xl" : "rounded-ouro-xl"), consumerFiles: async () => consumer };
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  assert.deepEqual(update.notes.filter((note) => /edited here/.test(note)), [], "the CLI's own rewrite is not an edit");
  assert.equal(update.files[path]?.toString(), written("rounded-ouro-xl"));
  assert.equal(JSON.parse(update.files[pin.file]).files[path], sha256(styles("rounded-ouro-xl")));
});

test("Ouro HX puts an added item where the app's own aliases resolve, and rewrites its imports, at the root or in a package", async () => {
  const kbd = (v, imports) => `${imports}export const Kbd = "${v}";\n`;
  const lib = (name, deps = []) => ({ name: `lib-${name}`, registryDependencies: deps, files: [{ path: `registry/ouro/lib/ouro/${name}.ts`, target: `@lib/ouro/${name}.ts` }] });
  const checks = Array.from({ length: 4 }, (_, i) => `c${i}`);
  const items = (kbdDeps) => [
    { name: "kbd", registryDependencies: kbdDeps, files: [{ path: "registry/ouro/components/ouro/kbd/kbd.tsx", target: "@components/ouro/kbd/kbd.tsx" }] },
    lib("cn"),
    lib("use-platform", ["ourostack/ouro-ui/lib-platform#v1.3.235"]),
    lib("platform"),
    { name: "check", files: checks.map((c) => ({ path: `registry/ouro/lib/ouro/check/${c}.ts`, target: `@lib/ouro/check/${c}.ts` })) },
  ];
  const files = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
  const checkSources = Object.fromEntries(checks.map((c) => [`registry/ouro/lib/ouro/check/${c}.ts`, c]));
  const previous = files({ "registry.json": JSON.stringify({ items: items([]) }), "registry/ouro/components/ouro/kbd/kbd.tsx": kbd("v1", ""), "registry/ouro/lib/ouro/cn.ts": "cn", ...checkSources });
  const next = files({
    "registry.json": JSON.stringify({ items: items(["ourostack/ouro-ui/lib-use-platform#v1.3.235"]) }),
    "registry/ouro/components/ouro/kbd/kbd.tsx": kbd("v2", 'import { usePlatform } from "@/registry/ouro/lib/ouro/use-platform";\n'),
    "registry/ouro/lib/ouro/use-platform.ts": 'import type { Platform } from "@/registry/ouro/lib/ouro/platform";\n',
    "registry/ouro/lib/ouro/platform.ts": "export type Platform = string;\n",
    "registry/ouro/lib/ouro/cn.ts": "cn",
    ...checkSources,
  });
  const components = JSON.stringify({ aliases: { components: "@/components", lib: "@/lib" } });
  // The tsconfig a Vite or Astro app writes: comments, and a trailing comma.
  const tsconfig = '{\n  // paths\n  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] }, },\n}\n';
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const run = async (dir, checkDir) => {
    const installed = {
      [`${dir}src/components/ouro/kbd/kbd.tsx`]: kbd("v1", ""),
      [`${dir}src/lib/ouro/cn.ts`]: "cn",
      ...Object.fromEntries(checks.map((c) => [`${checkDir}lib/ouro/check/${c}.ts`, c])),
    };
    const record = { tag: "v1.3.232", tagCommit: "old", files: Object.fromEntries(Object.entries(installed).map(([path, text]) => [path, sha256(text)])) };
    const consumer = files({ [`${dir}components.json`]: components, [`${dir}tsconfig.json`]: tsconfig, ...installed });
    const ctx = { tarball: async (follows, tag) => (tag === "v1.3.232" ? previous : next), consumerFiles: async () => consumer };
    return UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  };

  // As ouroboros.bot keeps it: `@/lib` is `src/lib/`, though more installed files sit in a `lib/` kept apart.
  const root = await run("", "");
  assert.equal(root.files["src/lib/ouro/use-platform.ts"]?.toString(), 'import type { Platform } from "@/lib/ouro/platform";\n');
  assert.equal(root.files["src/lib/ouro/platform.ts"]?.toString(), "export type Platform = string;\n");
  assert.equal(root.files["lib/ouro/platform.ts"], undefined, "not beside the files kept apart, where `@/lib` does not resolve");
  assert.match(root.files["src/components/ouro/kbd/kbd.tsx"].toString(), /from "@\/lib\/ouro\/use-platform"/);

  // As a monorepo keeps it: components.json and the tsconfig are in the package, not at the root.
  const pkg = await run("packages/mail/", "packages/mail/src/");
  assert.equal(pkg.files["packages/mail/src/lib/ouro/use-platform.ts"]?.toString(), 'import type { Platform } from "@/lib/ouro/platform";\n', "imports rewritten with the package's aliases");
  assert.equal(pkg.files["packages/mail/src/lib/ouro/platform.ts"]?.toString(), "export type Platform = string;\n");
  assert.match(pkg.files["packages/mail/src/components/ouro/kbd/kbd.tsx"].toString(), /from "@\/lib\/ouro\/use-platform"/);
});

test("Ouro HX adds the items an updated item now depends on, as the CLI follows registryDependencies, and leaves the app's own files alone", async () => {
  const kbd = (v, imports) => `${imports}import { cn } from "@/registry/ouro/lib/ouro/cn";\nexport const Kbd = "${v}";\n`;
  const lib = (name) => ({ name: `lib-${name}`, files: [{ path: `registry/ouro/lib/ouro/${name}.ts`, target: `@lib/ouro/${name}.ts` }] });
  const oldRegistry = { items: [
    { name: "kbd", registryDependencies: ["ourostack/ouro-ui/lib-cn#v1.3.117"], files: [{ path: "registry/ouro/components/ouro/kbd/kbd.tsx", target: "@components/ouro/kbd/kbd.tsx" }] },
    lib("cn"),
  ] };
  const registry = { items: [
    // As v1.3.232 lists kbd: addresses pinned to the tag, and a dependency that has its own (use-platform needs platform).
    { name: "kbd", registryDependencies: ["ourostack/ouro-ui/lib-cn#v1.3.187", "ourostack/ouro-ui/lib-use-platform#v1.3.187"], files: [{ path: "registry/ouro/components/ouro/kbd/kbd.tsx", target: "@components/ouro/kbd/kbd.tsx" }] },
    { ...lib("use-platform"), registryDependencies: ["ourostack/ouro-ui/lib-platform#v1.3.187"] },
    lib("platform"),
    lib("cn"),
    lib("unrelated"),
    { name: "lib-own", files: [{ path: "registry/ouro/lib/ouro/own.ts", target: "@lib/ouro/own.ts" }] },
  ] };
  registry.items[1].registryDependencies.push("ourostack/ouro-ui/lib-own#v1.3.187");
  const newImports = 'import { usePlatform } from "@/registry/ouro/lib/ouro/use-platform";\n';
  const files = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
  const previous = files({ "registry.json": JSON.stringify(oldRegistry), "registry/ouro/components/ouro/kbd/kbd.tsx": kbd("v1", ""), "registry/ouro/lib/ouro/cn.ts": "cn" });
  const next = files({
    "registry.json": JSON.stringify(registry),
    "registry/ouro/components/ouro/kbd/kbd.tsx": kbd("v2", newImports),
    "registry/ouro/lib/ouro/use-platform.ts": 'import type { Platform } from "@/registry/ouro/lib/ouro/platform";\n',
    "registry/ouro/lib/ouro/platform.ts": "export type Platform = string;\n",
    "registry/ouro/lib/ouro/cn.ts": "cn",
    "registry/ouro/lib/ouro/unrelated.ts": "unrelated",
    "registry/ouro/lib/ouro/own.ts": "registry's own",
  });
  const record = { tag: "v1.3.117", tagCommit: "old", files: { "app/components/ouro/kbd/kbd.tsx": sha256(kbd("v1", "")), "app/lib/ouro/cn.ts": sha256("cn") } };
  const consumer = new Map([
    ["components.json", Buffer.from(JSON.stringify({ aliases: { components: "~/components", lib: "~/lib" } }))],
    ["app/components/ouro/kbd/kbd.tsx", Buffer.from(kbd("v1", "").replace("@/registry/ouro/lib/", "~/lib/"))],
    ["app/lib/ouro/cn.ts", Buffer.from("cn")],
    ["app/lib/ouro/own.ts", Buffer.from("the app's own file")],
  ]);
  const ctx = { tarball: async (follows, tag) => (tag === "v1.3.117" ? previous : next), consumerFiles: async () => consumer };
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  assert.equal(update.files["app/lib/ouro/use-platform.ts"].toString(), 'import type { Platform } from "~/lib/ouro/platform";\n', "the item kbd now imports comes with it");
  assert.equal(update.files["app/lib/ouro/platform.ts"].toString(), "export type Platform = string;\n", "and the item that one depends on");
  assert.equal(update.files["app/lib/ouro/unrelated.ts"], undefined, "an item nothing installed depends on stays out");
  assert.equal(update.files["app/lib/ouro/own.ts"], undefined, "a file the app already has outside the record is its own");
  const written = JSON.parse(update.files[pin.file]);
  assert.equal(written.files["app/lib/ouro/platform.ts"], sha256("export type Platform = string;\n"));
  assert.equal(written.files["app/lib/ouro/own.ts"], undefined);
  assert.ok(update.notes.some((note) => note.includes("app/lib/ouro/use-platform.ts")));
});

test("Ouro HX keeps each file where the install record has it, as a site keeps Ouro check apart from its components", async () => {
  const registry = (gained) => ({ items: [
    { name: "button", files: [{ path: "registry/ouro/components/ouro/button/button.tsx", target: "@components/ouro/button/button.tsx" }, { path: "registry/ouro/lib/ouro/cn.ts", target: "@lib/ouro/cn.ts" }] },
    { name: "ouro-check", files: [{ path: "registry/ouro/check/check.ts", target: "@lib/ouro/check/check.ts" }, ...(gained ? [{ path: "registry/ouro/check/fades.ts", target: "@lib/ouro/check/fades.ts" }] : [])] },
  ] });
  const files = (v, gained) => new Map(Object.entries({ "registry.json": JSON.stringify(registry(gained)), "registry/ouro/components/ouro/button/button.tsx": `button ${v}`, "registry/ouro/lib/ouro/cn.ts": `cn ${v}`, "registry/ouro/check/check.ts": `check ${v}`, ...(gained ? { "registry/ouro/check/fades.ts": `fades ${v}` } : {}) }).map(([k, v]) => [k, Buffer.from(v)]));
  const record = { tag: "v1.3.117", tagCommit: "old", files: { "src/components/ouro/button/button.tsx": sha256("button v1"), "src/lib/ouro/cn.ts": sha256("cn v1"), "lib/ouro/check/check.ts": sha256("check v1") } };
  const consumer = new Map([
    ["components.json", Buffer.from(JSON.stringify({ aliases: { components: "@/components", lib: "@/lib" } }))],
    ["src/components/ouro/button/button.tsx", Buffer.from("button v1")],
    ["src/lib/ouro/cn.ts", Buffer.from("cn v1")],
    ["lib/ouro/check/check.ts", Buffer.from("check v1")],
  ]);
  const ctx = { tarball: async (follows, tag) => (tag === "v1.3.117" ? files("v1", false) : files("v2", true)), consumerFiles: async () => consumer };
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  assert.equal(update.files["lib/ouro/check/check.ts"]?.toString(), "check v2", "updated where it is, not reported as edited");
  assert.equal(update.files["lib/ouro/check/fades.ts"]?.toString(), "fades v2", "a file the item gained goes beside its other files");
  assert.equal(update.files["src/lib/ouro/check/check.ts"], undefined);
  assert.equal(update.files["src/components/ouro/button/button.tsx"].toString(), "button v2");
  assert.deepEqual(update.notes.filter((note) => /edited here/.test(note)), []);
});

/**
 * An app that took ouro-base and button at v1.3.244, before #1843 rounded components with `rounded-ouro-*`: its
 * stylesheet is what `shadcn init --preset nova` and `shadcn add ouro-base#v1.3.244` wrote (fixtures/), with values of
 * its own: a raised `--ouro-layer`, its own `--radius-ouro-md`, and no `press` utility. The next tag's ouro-base is v1.3.248's.
 */
function themeFixture({ tag = "v1.3.244" } = {}) {
  const fixture = (name) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
  const base = { "v1.3.244": JSON.parse(fixture("ouro-base-v1.3.244.json")), "v1.3.248": JSON.parse(fixture("ouro-base-v1.3.248.json")) };
  const button = (v) => `export const Button = "${v}";\n`;
  const at = (version) => new Map(Object.entries({
    "registry.json": JSON.stringify({ items: [base[version], { name: "button", files: [{ path: "registry/ouro/components/ouro/button/button.tsx", target: "@components/ouro/button/button.tsx" }] }] }),
    "registry/ouro/components/ouro/button/button.tsx": button(version),
  }).map(([k, v]) => [k, Buffer.from(v)]));
  const css = fixture("shadcn-ouro-base-v1.3.244.css").replace("--ouro-layer: 50;", "--ouro-layer: 60;").replace("    --radius-sm: calc(var(--radius) * 0.6);", "    --radius-ouro-md: 0.5rem;\n    --radius-sm: calc(var(--radius) * 0.6);").replace(/\n@utility press \{[^}]*\}\n?/, "\n");
  const files = {
    "components.json": JSON.stringify({ tailwind: { css: "src/index.css" }, aliases: { components: "@/components", lib: "@/lib" } }),
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    "src/index.css": css,
    "src/components/ouro/button/button.tsx": button(tag),
    ".github/ouro-hx-installed.json": JSON.stringify({ tag, tagCommit: "old", files: { "src/components/ouro/button/button.tsx": sha256(button(tag)) } }),
  };
  return { files, css, at, tarball: async (follows, version) => at(version) };
}

/** The border radius `rounded-ouro-<size>` draws with, once Tailwind v4 compiles the stylesheet and the browser resolves its vars. */
async function roundedOuro(css, size) {
  const { compile } = await import("tailwindcss");
  const tailwind = join(import.meta.dirname, "../../node_modules/tailwindcss/index.css");
  // The other packages the stylesheet imports (tw-animate-css, the font) are not installed here, and draw no radius.
  const own = css.replace(/^@import (?!"tailwindcss").*$/gm, "");
  const compiler = await compile(own, { base: import.meta.dirname, loadStylesheet: async () => ({ path: tailwind, base: dirname(tailwind), content: readFileSync(tailwind, "utf8") }) });
  const out = compiler.build([`rounded-ouro-${size}`]);
  const rule = new RegExp(String.raw`\.rounded-ouro-${size}\s*\{\s*border-radius:\s*([^;]+);`).exec(out);
  if (!rule) return null;
  const root = Object.fromEntries([...(/(?:^|\n):root\s*\{([^}]*)\}/.exec(out)?.[1] ?? "").matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
  let value = rule[1];
  for (let pass = 0; pass < 8 && value.includes("var("); pass += 1) value = value.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (all, name, fallback) => root[name] ?? fallback ?? all);
  const calc = /^calc\((.*)\)$/.exec(value)?.[1] ?? value;
  return calc.split("*").reduce((product, factor) => product * Number.parseFloat(factor), 1);
}

test("Ouro HX adds what an updated ouro-base puts in the app's stylesheet, as shadcn add does, and keeps the app's own values (#1843)", async () => {
  const app = themeFixture();
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const release = { ...RELEASES.web, tag: "v1.3.248" };
  const consumer = new Map(Object.entries(app.files).map(([k, v]) => [k, Buffer.from(v)]));
  const update = await UPDATERS["hx-installed"](pin, app.files[pin.file], release, { tarball: app.tarball, consumerFiles: async () => consumer });
  assert.equal(await roundedOuro(app.css, "lg"), null, "before: the app's stylesheet gives rounded-ouro-lg no radius");
  const css = update.files["src/index.css"]?.toString();
  assert.ok(css, "the stylesheet is written in the update");
  for (const size of ["sm", "lg", "xl", "2xl", "3xl", "4xl"]) assert.match(css, new RegExp(String.raw`\n    --radius-ouro-${size}: calc\(var\(--radius\) \* var\(--ouro-radius-scale, 1\) \* var\(--ouro-corner-fallback, 1\)[^;\n]*\);\n`), `--radius-ouro-${size} lands in @theme inline, at its indent`);
  assert.equal(css.match(/--radius-ouro-md:/g).length, 1, "a variable the app has is not added again");
  assert.match(css, /--radius-ouro-md: 0\.5rem;/, "and keeps the app's value");
  assert.match(css, /--ouro-layer: 60;/);
  assert.equal(css.match(/@utility press \{/g)?.length, 1, "a utility the app lacks comes back whole, once");
  const lines = css.split("\n");
  let at = 0;
  for (const line of app.css.split("\n")) {
    at = lines.indexOf(line, at);
    assert.notEqual(at, -1, `the app's line ${JSON.stringify(line)} stays, in its place`);
    at += 1;
  }
  assert.ok(update.notes.some((note) => note.includes("`--radius-ouro-lg`") && note.includes("`src/index.css`") && note.includes("`ouro-base`")), "the pull request says what the stylesheet gained");
  assert.ok((await roundedOuro(css, "lg")) > 0, "after: rounded-ouro-lg draws a radius");
  assert.equal(await roundedOuro(css, "md"), 0.5, "rounded-ouro-md draws the app's own radius");

  consumer.set("src/index.css", Buffer.from(css));
  consumer.set(pin.file, Buffer.from(update.files[pin.file]));
  consumer.set("src/components/ouro/button/button.tsx", update.files["src/components/ouro/button/button.tsx"]);
  const again = await UPDATERS["hx-installed"](pin, update.files[pin.file], release, { tarball: app.tarball, consumerFiles: async () => consumer });
  assert.equal(again.files["src/index.css"], undefined, "a second run changes nothing");
});

test("a theme item's entry Ouro Current cannot write is named and left out, never written as a guess", () => {
  const css = ":root {\n  --ouro-layer: 50;\n}\n";
  const result = applyItem(css, { name: "ouro-base", css: { "@font-face": { "font-family": "Ouro" }, ":root": { "--ouro-new": "1" } } });
  assert.equal(result.text, ":root {\n  --ouro-layer: 50;\n  --ouro-new: 1;\n}\n");
  assert.deepEqual(result.skipped, ["`@font-face`, which Ouro Current does not know how to write"]);
});

test("an install record already on the release whose stylesheet lacks what that release's ouro-base adds gets a pull request for the stylesheet", async () => {
  const app = themeFixture({ tag: "v1.3.248" });
  const releases = { ...RELEASES, web: { ...RELEASES.web, tag: "v1.3.248" } };
  const repo = fakeRepo({ ...app.files, ".github/ouro-current.json": "{}" });
  const kept = await keepRepo(repo.gh, "o/r", releases, { tarball: app.tarball });
  assert.equal(kept.state, "pr");
  assert.equal(kept.pr.title, "Update the stylesheet to Ouro UI v1.3.248");
  assert.match(repo.fileAt(BRANCH, "src/index.css"), /--radius-ouro-lg: /);
  assert.equal(repo.fileAt("main", "src/index.css"), app.css, "the default branch is never written");
  repo.setMain({ "src/index.css": repo.fileAt(BRANCH, "src/index.css") });
  const after = await keepRepo(repo.gh, "o/r", releases, { tarball: app.tarball });
  assert.equal(after.state, "current", "once the stylesheet has it, the repository is current");
});

test("an app on the newest release whose stylesheet lacks a keyframes ouro-base has gets the stylesheet update adding that block alone, and a second run is current", async () => {
  const app = themeFixture({ tag: "v1.3.248" });
  // The app already has every theme variable and utility of the release, and none of its keyframes changed: only the
  // new `@keyframes ouro-moment-arrive` is missing, as for an app whose pins named the release before it gained it.
  const tarball = async (follows, version) => {
    const files = await app.tarball(follows, version);
    const registry = JSON.parse(files.get("registry.json").toString());
    const base = registry.items.find((item) => item.name === "ouro-base");
    base.css["@keyframes ouro-moment-arrive"] = { from: { opacity: "0" } };
    files.set("registry.json", Buffer.from(JSON.stringify(registry)));
    return files;
  };
  const releases = { ...RELEASES, web: { ...RELEASES.web, tag: "v1.3.248" } };
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const consumer = new Map(Object.entries(app.files).map(([k, v]) => [k, Buffer.from(v)]));
  const caughtUp = (await UPDATERS["hx-installed"](pin, app.files[pin.file], releases.web, { tarball: app.tarball, consumerFiles: async () => consumer })).files["src/index.css"].toString();
  const repo = fakeRepo({ ...app.files, "src/index.css": caughtUp, ".github/ouro-current.json": "{}" });
  const kept = await keepRepo(repo.gh, "o/r", releases, { tarball });
  assert.equal(kept.state, "pr");
  assert.equal(kept.pr.title, "Update the stylesheet to Ouro UI v1.3.248");
  assert.equal(repo.fileAt(BRANCH, "src/index.css"), `${caughtUp.trimEnd()}\n\n@keyframes ouro-moment-arrive {\n    from {\n        opacity: 0;\n    }\n}\n`);
  repo.setMain({ "src/index.css": repo.fileAt(BRANCH, "src/index.css") });
  assert.equal((await keepRepo(repo.gh, "o/r", releases, { tarball })).state, "current", "a second run finds nothing to add");
});

test("a keyframes the app has under that name is kept as the app wrote it, and a plain rule or utility line the previous tag had stays out", () => {
  const item = {
    name: "ouro-base",
    css: {
      "@layer base": { "[data-ouro-surface]": { display: "none" } },
      "@utility press": { transition: "scale 160ms" },
      "@keyframes ouro-spin": { to: { rotate: "1turn" } },
      "@keyframes ouro-new": { to: { opacity: "1" } },
    },
  };
  const previous = { name: "ouro-base", css: { "@layer base": { "[data-ouro-surface]": { display: "none" } }, "@utility press": { transition: "scale 160ms" } } };
  const css = ":root {\n  --ouro-layer: 50;\n}\n\n@utility press {\n  scale: 0.97;\n}\n\n@keyframes ouro-spin {\n  from {\n    rotate: 0;\n  }\n}\n";
  const result = applyItem(css, item, previous);
  assert.equal(result.text, `${css}\n@keyframes ouro-new {\n  to {\n    opacity: 1;\n  }\n}\n`, "only the keyframes the app has no block of that name for is added");
  assert.deepEqual(result.added, [{ where: "`@keyframes ouro-new`", names: [] }]);
  assert.equal(applyItem(result.text, item, previous).text, result.text, "a second run changes nothing");
});

test("a rule under an at-rule the stylesheet has no block of comes whole, even when the previous tag had it, and a second run changes nothing", () => {
  const item = {
    name: "ouro-base",
    css: {
      "@supports not (corner-shape: squircle)": { "[data-ouro-surface]": { display: "block" } },
      "@container style(--corner-shape: round)": { "[data-ouro-squircle] > [data-ouro-surface]": { "clip-path": "inset(0 round var(--ouro-sq-r))" } },
    },
  };
  // The app's install record is on the tag, so the previous tag is the tag itself, and its stylesheet is older.
  const css = ":root {\n  --ouro-layer: 50;\n}\n\n@supports not (corner-shape: squircle) {\n  [data-ouro-surface] {\n    display: grid;\n  }\n}\n";
  const result = applyItem(css, item, item);
  assert.equal(result.text, `${css}\n@container style(--corner-shape: round) {\n  [data-ouro-squircle] > [data-ouro-surface] {\n    clip-path: inset(0 round var(--ouro-sq-r));\n  }\n}\n`, "the @supports block the app has keeps its own value; the @container block it lacks comes whole");
  assert.deepEqual(result.added, [{ where: "`[data-ouro-squircle] > [data-ouro-surface]` in `@container style(--corner-shape: round)`", names: ["clip-path"] }]);
  assert.equal(applyItem(result.text, item, item).text, result.text, "a second run changes nothing");
});

test("a utility the app has from the previous tag gains a line the new tag adds to it, once, and keeps its own lines", () => {
  const previous = { name: "ouro-base", css: { "@utility press": { transition: "scale 160ms" } } };
  const item = { name: "ouro-base", css: { "@utility press": { transition: "scale 160ms", "will-change": "scale" } } };
  const css = ":root {\n  --ouro-layer: 50;\n}\n\n@utility press {\n  transition: scale 120ms;\n  scale: 0.97;\n}\n";
  const result = applyItem(css, item, previous);
  assert.equal(result.text, ":root {\n  --ouro-layer: 50;\n}\n\n@utility press {\n  transition: scale 120ms;\n  scale: 0.97;\n  will-change: scale;\n}\n");
  assert.deepEqual(result.added, [{ where: "`@utility press`", names: ["will-change"] }]);
  assert.equal(applyItem(result.text, item, previous).text, result.text, "a second run changes nothing");
});

test("rules added to the same block keep the item's order: a wider @media step after a narrower one, so the wider wins", () => {
  const item = {
    name: "ouro-base",
    css: {
      "@layer base": {
        "[data-ouro-surface]": { display: "none" },
        "@media (width >= 150rem)": { html: { "font-size": "112.5%" } },
        "@media (width >= 200rem)": { html: { "font-size": "125%" } },
      },
    },
  };
  const css = ":root {\n  --ouro-layer: 50;\n}\n\n@layer base {\n  [data-ouro-surface] {\n    display: none;\n  }\n}\n";
  const result = applyItem(css, item, { name: "ouro-base", css: { "@layer base": { "[data-ouro-surface]": { display: "none" } } } });
  const at = (width) => result.text.indexOf(`@media (width >= ${width}rem)`);
  assert.ok(at(150) > 0 && at(200) > at(150), `150rem comes before 200rem:\n${result.text}`);
  // A last declaration with no semicolon still gets one before what is added after it.
  const bare = applyItem(":root {\n  --ouro-layer: 50\n}\n", { name: "ouro-base", css: { ":root": { "--ouro-new": "1", "--ouro-next": "2" } } });
  assert.equal(bare.text, ":root {\n  --ouro-layer: 50;\n  --ouro-new: 1;\n  --ouro-next: 2;\n}\n");
});

/**
 * An app whose stylesheet holds ouro-base's rules, as `shadcn add` merged them at v1.3.244, with a raised `--ouro-layer`
 * and its own theme. The registry has ouro-base's file at both tags, and v1.3.248's file gains a variable.
 */
function importFixture() {
  const BASE = (extra = "") => `/* ouro-base */\n@theme inline {\n  --radius-ouro-md: calc(var(--radius) * 0.8);\n}\n\n:root {\n  --input: oklch(0.922 0 0);\n  --radius: 0.9375rem;\n  --ouro-layer: 50;\n  --ouro-press-scale: 0.97;${extra}\n}\n\n@layer base {\n  @media (width >= 150rem) {\n    html {\n      font-size: 112.5%;\n    }\n  }\n}\n\n@supports not (corner-shape: squircle) {\n  :root {\n    --ouro-corner-fallback: 0.7;\n  }\n}\n\n@utility press {\n  transition: scale 160ms;\n}\n\n@keyframes ouro-spin {\n  to {\n    rotate: 1turn;\n  }\n}\n`;
  const BUTTON = "export const Button = 1;\n";
  const sources = { "v1.3.244": BASE(), "v1.3.248": BASE("\n  --ouro-new: 1px;") };
  const at = (version) => new Map(Object.entries({
    "registry.json": JSON.stringify({ items: [{ name: "ouro-base", cssVars: {}, css: { ":root": { "--ouro-layer": "50" } } }, { name: "button", files: [{ path: "registry/ouro/components/ouro/button/button.tsx", target: "@components/ouro/button/button.tsx" }] }] }),
    "registry/ouro/theme/ouro-base.css": sources[version],
    "registry/ouro/components/ouro/button/button.tsx": BUTTON,
  }).map(([k, v]) => [k, Buffer.from(v)]));
  const css = `@import "tailwindcss";\n@import "tw-animate-css";\n\n@custom-variant dark (&:is(.dark *));\n\n:root {\n  --background: #fff;\n  --input: oklch(0.922 0 0);\n  --radius: 0.625rem;\n  --ouro-layer: 60; /* above the app's header */\n  --ouro-press-scale: 0.97;\n}\n\n@theme inline {\n  --color-background: var(--background);\n  --radius-ouro-md: calc(var(--radius) * 0.8);\n}\n\n@layer base {\n  body {\n    margin: 0;\n  }\n  @media (width >= 150rem) {\n    html {\n      font-size: 112.5%;\n    }\n  }\n}\n\n@utility press {\n  transition: scale 160ms;\n}\n\n@keyframes ouro-spin {\n  to {\n    rotate: 1turn;\n  }\n}\n`;
  const files = {
    "components.json": JSON.stringify({ tailwind: { css: "src/index.css" }, aliases: { components: "@/components", lib: "@/lib" } }),
    "src/index.css": css,
    "src/components/ouro/button/button.tsx": BUTTON,
    ".github/ouro-hx-installed.json": JSON.stringify({ tag: "v1.3.244", tagCommit: "old", files: { "src/components/ouro/button/button.tsx": sha256(BUTTON) } }),
  };
  return { files, css, sources, tarball: async (follows, version) => at(version) };
}

test("Ouro HX moves a stylesheet that holds ouro-base's rules to an import of ouro-base's own file, keeps the app's own values after it, and tracks the file by hash", async () => {
  const app = importFixture();
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const release = { ...RELEASES.web, tag: "v1.3.248" };
  const consumer = new Map(Object.entries(app.files).map(([k, v]) => [k, Buffer.from(v)]));
  const update = await UPDATERS["hx-installed"](pin, app.files[pin.file], release, { tarball: app.tarball, consumerFiles: async () => consumer });
  const css = update.files["src/index.css"].toString();
  assert.equal(
    css,
    `@import "tailwindcss";\n@import "./ouro/ouro-base.css";\n@import "tw-animate-css";\n\n@custom-variant dark (&:is(.dark *));\n\n:root {\n  --background: #fff;\n  --input: oklch(0.922 0 0);\n  --radius: 0.625rem;\n  --ouro-layer: 60; /* above the app's header */\n}\n\n@theme inline {\n  --color-background: var(--background);\n}\n\n@layer base {\n  body {\n    margin: 0;\n  }\n}\n`,
    "ouro-base's copies go, the app's own theme and its raised --ouro-layer stay, after the import",
  );
  assert.equal(update.files["src/ouro/ouro-base.css"].toString(), app.sources["v1.3.248"], "the new tag's file, as it is");
  const record = JSON.parse(update.files[pin.file]);
  assert.equal(record.files["src/ouro/ouro-base.css"], sha256(app.sources["v1.3.248"]), "the install record tracks the file by its hash");
  assert.ok(update.notes.some((note) => note.includes("`src/ouro/ouro-base.css`") && note.includes("imports")));
  assert.ok(update.notes.some((note) => note.includes("`--ouro-layer` in `:root`")), "the pull request names the values the app keeps");
  assert.ok(update.notes.some((note) => note.includes("`--ouro-corner-fallback` in `:root` in `@supports not (corner-shape: squircle)`")), "and what the file brings back");
  // The notes pass the claims check a repository may run on its pull requests, as spoonjoy-v2's (#831): the move is
  // cited to the import line it writes, which a fileLine check finds in the update's stylesheet.
  const prBody = body([{ file: pin.file, follows: "web", current: "v1.3.247" }], { web: release }, update.notes);
  assert.deepEqual(lintMarkdown(prBody, { file: "pull request body" }), []);
  const moveNote = update.notes.find((note) => note.startsWith("Moves ouro-base"));
  const check = /verify:fileLine\(src\/index\.css, \/(.+)\/\)/.exec(moveNote);
  assert.ok(check, `the move names its import line: ${moveNote}`);
  assert.match(css, new RegExp(check[1], "m"), "and the update's stylesheet has that line");

  // The import resolves in Tailwind, ouro-base's rules apply, and the app's value wins.
  const { compile } = await import("tailwindcss");
  const tailwind = join(import.meta.dirname, "../../node_modules/tailwindcss/index.css");
  const sheets = { tailwindcss: { path: tailwind, base: dirname(tailwind), content: readFileSync(tailwind, "utf8") }, "./ouro/ouro-base.css": { path: "/app/src/ouro/ouro-base.css", base: "/app/src/ouro", content: app.sources["v1.3.248"] } };
  const compiler = await compile(css.replace(/^@import "tw-animate-css";\n/m, ""), { base: "/app/src", loadStylesheet: async (id) => sheets[id] });
  const out = compiler.build(["press", "rounded-ouro-md"]);
  assert.match(out, /--ouro-new: 1px/);
  assert.match(out, /--ouro-corner-fallback: 0\.7/);
  assert.ok(out.lastIndexOf("--ouro-layer: 60") > out.lastIndexOf("--ouro-layer: 50"), "the app's --ouro-layer comes after ouro-base's");
  assert.match(out, /\.press \{\s*transition: scale 160ms;\s*\}/);

  // On: the stylesheet imports the file, so it is left alone, and the file follows each release by its hash.
  for (const [path, bytes] of Object.entries(update.files)) consumer.set(path, Buffer.from(bytes));
  const same = await UPDATERS["hx-installed"](pin, update.files[pin.file], release, { tarball: app.tarball, consumerFiles: async () => consumer });
  assert.equal(same.files["src/index.css"], undefined, "a second run leaves the stylesheet");
  assert.equal(same.files["src/ouro/ouro-base.css"], undefined, "and the file, already the tag's");
  const later = { ...RELEASES.web, tag: "v1.3.250" };
  const newer = async (follows, version) => (version === "v1.3.250" ? new Map([...(await app.tarball(follows, "v1.3.248")), ["registry/ouro/theme/ouro-base.css", Buffer.from(`${app.sources["v1.3.248"]}/* v1.3.250 */\n`)]]) : app.tarball(follows, version));
  const next = await UPDATERS["hx-installed"](pin, update.files[pin.file], later, { tarball: newer, consumerFiles: async () => consumer });
  assert.equal(next.files["src/ouro/ouro-base.css"].toString(), `${app.sources["v1.3.248"]}/* v1.3.250 */\n`, "the next release replaces the file whole");
  assert.equal(next.files["src/index.css"], undefined);
  consumer.set("src/ouro/ouro-base.css", Buffer.from(`${app.sources["v1.3.248"]}.mine { color: red; }\n`));
  const edited = await UPDATERS["hx-installed"](pin, update.files[pin.file], later, { tarball: newer, consumerFiles: async () => consumer });
  assert.equal(edited.files["src/ouro/ouro-base.css"], undefined, "a file the app edited is left as it is");
  assert.ok(edited.notes.some((note) => note.includes("`src/ouro/ouro-base.css`") && note.includes("edited here")));
});

test("a plain-CSS copy of ouro-base older than the install record's tag gets a pull request that replaces it with the release's", async () => {
  const STATIC = (v) => `/* Ouro HX base tokens as plain CSS, ${v} */\n:root {\n  --ouro-layer: 50;\n}\n`;
  const BUTTON = "export const Button = 1;\n";
  const tarball = async () => new Map(Object.entries({
    "registry.json": JSON.stringify({ items: [{ name: "button", files: [{ path: "registry/ouro/components/ouro/button/button.tsx", target: "@components/ouro/button/button.tsx" }] }] }),
    "registry/ouro/components/ouro/button/button.tsx": BUTTON,
    "site/public/css/ouro-base.css": STATIC("v1.3.248"),
  }).map(([k, v]) => [k, Buffer.from(v)]));
  // The record names the release, but the copy is an older one's, recorded by its own hash.
  const files = {
    "components.json": JSON.stringify({ aliases: { components: "@/components", lib: "@/lib" } }),
    "src/components/ouro/button/button.tsx": BUTTON,
    "site/src/ouro/ouro-base.css": STATIC("v1.3.200"),
    ".github/ouro-hx-installed.json": JSON.stringify({ tag: "v1.3.248", tagCommit: "old", files: { "site/src/ouro/ouro-base.css": sha256(STATIC("v1.3.200")), "src/components/ouro/button/button.tsx": sha256(BUTTON) } }),
    ".github/ouro-current.json": "{}",
  };
  const releases = { ...RELEASES, web: { ...RELEASES.web, tag: "v1.3.248" } };
  const repo = fakeRepo(files);
  const kept = await keepRepo(repo.gh, "o/r", releases, { tarball });
  assert.equal(kept.state, "pr");
  assert.equal(repo.fileAt(BRANCH, "site/src/ouro/ouro-base.css"), STATIC("v1.3.248"));
  assert.equal(JSON.parse(repo.fileAt(BRANCH, ".github/ouro-hx-installed.json")).files["site/src/ouro/ouro-base.css"], sha256(STATIC("v1.3.248")));
  repo.setMain({ "site/src/ouro/ouro-base.css": STATIC("v1.3.248"), ".github/ouro-hx-installed.json": repo.fileAt(BRANCH, ".github/ouro-hx-installed.json") });
  assert.equal((await keepRepo(repo.gh, "o/r", releases, { tarball })).state, "current", "once the copy is the release's, the repository is current");
});

test("moving to the import takes out a keyframes ouro-base wrote inside @theme inline, and keeps one the app changed", () => {
  const base = "@keyframes ouro-spin {\n  to {\n    rotate: 1turn;\n  }\n}\n\n@keyframes ouro-pulse {\n  50% {\n    opacity: 0.4;\n  }\n}\n";
  const css = '@import "tailwindcss";\n\n@theme inline {\n  --color-x: red;\n  @keyframes ouro-spin {\n  to {\n    rotate: 1turn;\n    }\n  }\n}\n\n@keyframes ouro-pulse {\n  50% {\n    opacity: 0.2;\n  }\n}\n';
  const moved = importBase(css, base);
  assert.equal(moved.text, '@import "tailwindcss";\n@import "./ouro/ouro-base.css";\n\n@theme inline {\n  --color-x: red;\n}\n\n@keyframes ouro-pulse {\n  50% {\n    opacity: 0.2;\n  }\n}\n');
  assert.deepEqual(moved.kept, [{ where: "`@keyframes ouro-pulse`", prop: null, value: null }]);
});

/**
 * An app at `dir` (the folder of its components.json) that installed Ouro check and the X-ray under its lib folder at
 * v1.3.117. The next tag moves both to `~/scripts/ouro/`, and the shared AX file `command.ts` stays under the lib folder.
 */
function moveFixture(dir, { checkHere = 'export const check = "v1";\n', source = "src", extra = {} } = {}) {
  const lib = `${dir}${source}/lib/`;
  const CHECK = (v) => `export const check = "${v}";\n`;
  const XRAY = (v) => `import { command } from "#ouro-ax/ax-command.ts";\nexport const xray = "${v}";\n`;
  const COMMAND = (v) => `export const command = "${v}";\n`;
  const registry = (checkTarget, xrayTarget) => ({ items: [
    // At the new tag Ouro check also gains a file, which goes beside its moved files.
    { name: "ouro-check", files: [{ path: "registry/ouro/check/check.ts", target: checkTarget }, ...(checkTarget.startsWith("~/") ? [{ path: "registry/ouro/check/run.ts", target: "~/scripts/ouro/check/run.ts" }] : [])] },
    { name: "ax-xray", files: [{ path: "registry/ouro/ax/xray.ts", target: xrayTarget }] },
    { name: "ax-command", files: [{ path: "registry/ouro/ax/ax-command.ts", target: "@lib/ouro/ax/ax-command.ts" }] },
  ] });
  const files = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
  const previous = files({ "registry.json": JSON.stringify(registry("@lib/ouro/check/check.ts", "@lib/ouro/ax/xray.ts")), "registry/ouro/check/check.ts": CHECK("v1"), "registry/ouro/ax/xray.ts": XRAY("v1"), "registry/ouro/ax/ax-command.ts": COMMAND("v1") });
  const next = files({ "registry.json": JSON.stringify(registry("~/scripts/ouro/check/check.ts", "~/scripts/ouro/ax/xray.ts")), "registry/ouro/check/check.ts": CHECK("v2"), "registry/ouro/check/run.ts": "export const run = 2;\n", "registry/ouro/ax/xray.ts": XRAY("v2"), "registry/ouro/ax/ax-command.ts": COMMAND("v2") });
  const installed = { [`${lib}ouro/check/check.ts`]: checkHere, [`${lib}ouro/ax/xray.ts`]: XRAY("v1"), [`${lib}ouro/ax/ax-command.ts`]: COMMAND("v1") };
  const record = { tag: "v1.3.117", tagCommit: "old", files: { [`${lib}ouro/check/check.ts`]: sha256(CHECK("v1")), [`${lib}ouro/ax/xray.ts`]: sha256(XRAY("v1")), [`${lib}ouro/ax/ax-command.ts`]: sha256(COMMAND("v1")) } };
  // The package's scripts name the files by their path from the package folder, as a package.json does.
  const packageJson = `{\n    "name": "app",\n    "scripts": {\n        "check": "node ${lib.slice(dir.length)}ouro/check/check.ts dist"\n    }\n}\n`;
  const consumer = files({
    [`${dir}components.json`]: JSON.stringify({ aliases: { components: "@/components", lib: "@/lib" } }),
    [`${dir}tsconfig.json`]: JSON.stringify({ compilerOptions: { paths: { "@/*": [`./${source}/*`] } } }),
    [`${dir}package.json`]: packageJson,
    ...installed,
    ...extra,
  });
  const ctx = { tarball: async (follows, tag) => (tag === "v1.3.117" ? previous : next), consumerFiles: async () => consumer };
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  return { record, ctx, pin, consumer };
}

test("Ouro HX moves Ouro check and the X-ray to scripts/ouro where their items now install, deleting the old copies and fixing package.json", async () => {
  const { record, ctx, pin } = moveFixture("");
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  assert.equal(update.files["src/lib/ouro/check/check.ts"], null, "the old copy is deleted, as a null value");
  assert.equal(update.files["src/lib/ouro/ax/xray.ts"], null);
  assert.equal(update.files["scripts/ouro/check/check.ts"].toString(), 'export const check = "v2";\n');
  assert.equal(update.files["scripts/ouro/ax/xray.ts"].toString(), 'import { command } from "#ouro-ax/ax-command.ts";\nexport const xray = "v2";\n');
  assert.equal(update.files["src/lib/ouro/ax/ax-command.ts"].toString(), 'export const command = "v2";\n', "the shared file is updated where it is");
  const written = JSON.parse(update.files[pin.file]);
  assert.equal(written.files["scripts/ouro/check/check.ts"], sha256('export const check = "v2";\n'));
  assert.equal(written.files["scripts/ouro/ax/xray.ts"], sha256('import { command } from "#ouro-ax/ax-command.ts";\nexport const xray = "v2";\n'), "the record keeps the registry source's hash");
  assert.equal(written.files["src/lib/ouro/ax/ax-command.ts"], sha256('export const command = "v2";\n'));
  assert.equal("src/lib/ouro/check/check.ts" in written.files, false, "the record holds the new path, not the old");
  assert.equal("src/lib/ouro/ax/xray.ts" in written.files, false);
  assert.equal(update.files["package.json"].toString(), `{
    "name": "app",
    "scripts": {
        "check": "node scripts/ouro/check/check.ts dist"
    },
    "imports": {
        "#ouro-ax/*": "./src/lib/ouro/ax/*"
    }
}
`, "the imports entry is added and the script points at the moved file, in the file's own indentation");
  assert.ok(update.notes.includes("Moves `src/lib/ouro/check/check.ts` to `scripts/ouro/check/check.ts`, outside the app's TypeScript project."));
  assert.ok(update.notes.includes("Moves `src/lib/ouro/ax/xray.ts` to `scripts/ouro/ax/xray.ts`, outside the app's TypeScript project."));
  assert.ok(update.notes.some((note) => note.includes("`#ouro-ax/*`") && note.includes("`imports`")));
  assert.ok(update.notes.some((note) => note.includes("`scripts`")));
  assert.deepEqual(lintMarkdown(body([{ file: pin.file, follows: "web", current: "v1.3.117" }], { web: RELEASES.web }, update.notes), { file: "pull request body" }), []);
});

/**
 * An app laid out as mendelow.me was at v1.3.242: components.json and `@/*` -> `./src/*`, but Ouro check and the
 * Ouro AX shared files kept apart at the root in `lib/ouro/`. The next tag moves Ouro check to `~/scripts/ouro/`.
 */
function apartFixture({ imports, kit = true } = {}) {
  // As Ouro check's entry point guards itself: it runs only when it is the file node was asked to run.
  const RUN = 'import { realpathSync } from "node:fs";\nimport { fileURLToPath } from "node:url";\nimport "#ouro-ax/ax-command.ts";\nif (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) console.log(JSON.stringify(process.argv.slice(2)));\n';
  const registry = (check) => ({ items: [
    { name: "ouro-check", registryDependencies: ["ax-command"], files: [{ path: "registry/ouro/check/check.ts", target: `${check}check/check.ts` }, { path: "registry/ouro/check/fades.ts", target: `${check}check/fades.ts` }] },
    { name: "ax-command", files: [{ path: "registry/ouro/ax/ax-command.ts", target: "@lib/ouro/ax/ax-command.ts" }] },
    { name: "lib-cn", files: [{ path: "registry/ouro/lib/ouro/cn.ts", target: "@lib/ouro/cn.ts" }] },
  ] });
  const files = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
  const previous = files({ "registry.json": JSON.stringify(registry("@lib/ouro/")), "registry/ouro/check/check.ts": "check v1\n", "registry/ouro/check/fades.ts": "fades v1\n", "registry/ouro/ax/ax-command.ts": "command v1\n", "registry/ouro/lib/ouro/cn.ts": "cn\n" });
  const next = files({ "registry.json": JSON.stringify(registry("~/scripts/ouro/")), "registry/ouro/check/check.ts": RUN, "registry/ouro/check/fades.ts": "export const fades = 2;\n", "registry/ouro/ax/ax-command.ts": "export const command = 2;\n", "registry/ouro/lib/ouro/cn.ts": "cn\n" });
  const installed = { "lib/ouro/check/check.ts": "check v1\n", "lib/ouro/check/fades.ts": "fades v1\n", ...(kit ? { "lib/ouro/ax/ax-command.ts": "command v1\n" } : {}), "src/lib/ouro/cn.ts": "cn\n" };
  const record = { tag: "v1.3.242", tagCommit: "old", files: Object.fromEntries(Object.entries(installed).map(([path, text]) => [path, sha256(text)])) };
  const consumer = files({
    "components.json": JSON.stringify({ aliases: { components: "@/components", lib: "@/lib" } }),
    "tsconfig.json": JSON.stringify({ include: ["src/**/*"], compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    "package.json": `${JSON.stringify({ name: "site", type: "module", scripts: { "check:screens": "node lib/ouro/check/check.ts dist" }, ...(imports ? { imports } : {}) }, null, 2)}\n`,
    ".github/workflows/pages.yml": "jobs:\n  check:\n    steps:\n      - run: node lib/ouro/check/check.ts _site --sizes 390x844\n      - run: diff -r .ouro-ui/registry/ouro/check lib/ouro/check\n      - run: for f in lib/ouro/ax/*.ts; do cmp a \"$f\"; done\n",
    "lib/ouro/check/README.md": "ours\n",
    "scripts/list.sh": "ls lib/ouro/check/README.md lib/ouro/check\n",
    "scripts/check-fades.mjs": "spawnSync(process.execPath, ['lib/ouro/check/fades.ts', 'src']);\n",
    "readme.md": "Run `node lib/ouro/check/check.ts dist` after a build.\n",
    "tests/fades.test.mjs": 'import { fades } from "../lib/ouro/check/fades.ts";\n',
    ...installed,
  });
  const ctx = { tarball: async (follows, tag) => (tag === "v1.3.242" ? previous : next), consumerFiles: async () => consumer };
  return { record, ctx, consumer, pin: { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" } };
}

test("an install record with Ouro AX and no components.json updates across a renamed kit file, without reading a components.json it lacks", async () => {
  // As ourostack/factory: the kit in lib/ouro/ax/, a root package.json, and no components.json (#2777).
  const files = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
  const registry = (name) => JSON.stringify({ items: [{ name: "ax-command", files: [{ path: `registry/ouro/ax/${name}`, target: `@lib/ouro/ax/${name}` }] }] });
  const previous = files({ "registry.json": registry("command.ts"), "registry/ouro/ax/command.ts": "command v1\n" });
  const next = files({ "registry.json": registry("ax-command.ts"), "registry/ouro/ax/ax-command.ts": "command v2\n" });
  const record = { tag: "v1.3.242", tagCommit: "old", files: { "lib/ouro/ax/command.ts": sha256("command v1\n") } };
  const consumer = files({ "package.json": JSON.stringify({ name: "factory", type: "module" }), "lib/ouro/ax/command.ts": "command v1\n", "bin/factory.mts": 'import { defineCli } from "../lib/ouro/ax/command.ts";\nimport { Cli } from "#ouro-ax/command.ts";\n' });
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, { tarball: async (follows, tag) => (tag === "v1.3.242" ? previous : next), consumerFiles: async () => consumer });
  assert.equal(update.files["lib/ouro/ax/ax-command.ts"]?.toString(), "command v2\n");
  assert.deepEqual(Object.keys(JSON.parse(update.files[pin.file]).files), ["lib/ouro/ax/ax-command.ts"]);
  assert.equal(update.files["lib/ouro/ax/command.ts"], null, "the old file goes");
  assert.equal(update.files["bin/factory.mts"]?.toString(), 'import { defineCli } from "../lib/ouro/ax/ax-command.ts";\nimport { Cli } from "#ouro-ax/ax-command.ts";\n');
  assert.ok(update.notes.includes("Renames `lib/ouro/ax/command.ts` to `lib/ouro/ax/ax-command.ts`, as the release renamed it."));
  assert.deepEqual(update.notes.flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
  assert.equal("package.json" in update.files, false, "with no components.json there is no package to edit beside it");
});

test("an install record mirrors the release: a file the release no longer ships goes, beside a renamed one (ourostack/ouroboros-website#466)", async () => {
  // As ouroboros-website: its CI diffs the vendored folder against the release's, so a file left behind fails it.
  const files = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
  const registry = (...names) => JSON.stringify({ items: [{ name: "ax-command", files: names.map((name) => ({ path: `registry/ouro/ax/${name}`, target: `@lib/ouro/ax/${name}` })) }] });
  const previous = files({ "registry.json": registry("command.ts", "dropped.ts"), "registry/ouro/ax/command.ts": "command v1\n", "registry/ouro/ax/dropped.ts": "dropped v1\n" });
  const next = files({ "registry.json": registry("ax-command.ts"), "registry/ouro/ax/ax-command.ts": "command v2\n" });
  const record = { tag: "v1.3.242", tagCommit: "old", files: { "lib/ouro/ax/command.ts": sha256("command v1\n"), "lib/ouro/ax/dropped.ts": sha256("dropped v1\n") } };
  const consumer = files({ "package.json": JSON.stringify({ name: "site", type: "module" }), "lib/ouro/ax/command.ts": "command v1\n", "lib/ouro/ax/dropped.ts": "dropped v1\n" });
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, { tarball: async (follows, tag) => (tag === "v1.3.242" ? previous : next), consumerFiles: async () => consumer });
  assert.equal(update.files["lib/ouro/ax/command.ts"], null, "the renamed file's old copy goes");
  assert.equal(update.files["lib/ouro/ax/dropped.ts"], null, "the file the release no longer ships goes");
  assert.deepEqual(Object.keys(JSON.parse(update.files[pin.file]).files), ["lib/ouro/ax/ax-command.ts"]);
  assert.ok(update.notes.includes("Deletes what the release no longer ships: `lib/ouro/ax/dropped.ts`."));
  assert.deepEqual(update.notes.flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
});

test("an install record keeps a file it cannot place in the release when the release still ships its source (ourostack/factory#1138)", async () => {
  // As factory: no components.json, its Ouro check in lib/ouro/check/ while the registry targets ~/scripts/ouro/check/,
  // and the theme's stylesheets copied to site/src/ouro/, which no registry item targets. The release still ships both.
  const files = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
  const registry = JSON.stringify({ items: [{ name: "ouro-check", files: [{ path: "registry/ouro/check/fades.ts", target: "~/scripts/ouro/check/fades.ts" }] }] });
  const shipped = (v) => files({ "registry.json": registry, "registry/ouro/check/fades.ts": `fades ${v}\n`, "registry/ouro/theme/ouro-base.css": `base ${v}\n` });
  const record = { tag: "v1.3.242", tagCommit: "old", files: { "lib/ouro/check/fades.ts": sha256("fades v1\n"), "site/src/ouro/ouro-base.css": sha256("base v1\n") } };
  const consumer = files({ "package.json": JSON.stringify({ name: "factory", type: "module" }), "lib/ouro/check/fades.ts": "fades v1\n", "site/src/ouro/ouro-base.css": "base v1\n" });
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, { tarball: async (follows, tag) => shipped(tag === "v1.3.242" ? "v1" : "v2"), consumerFiles: async () => consumer });
  for (const path of Object.keys(record.files)) assert.notEqual(update.files[path], null, `${path}, which the release still ships, is not deleted`);
  assert.ok(!update.notes.some((note) => note.startsWith("Deletes")));
});

test("an install record deletes a copy an earlier update kept after the release dropped it, when its bytes are still the recorded source (spoonjoy/spoonjoy-v2#829)", async () => {
  // As spoonjoy-v2 after #828: the record lists both the old and the new name, at a tag that ships only the new one.
  const files = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
  const registry = JSON.stringify({ items: [{ name: "ax-command", files: [{ path: "registry/ouro/ax/ax-command.ts", target: "@lib/ouro/ax/ax-command.ts" }] }] });
  const previous = files({ "registry.json": registry, "registry/ouro/ax/ax-command.ts": "command v1\n" });
  const next = files({ "registry.json": registry, "registry/ouro/ax/ax-command.ts": "command v2\n" });
  const record = { tag: "v1.3.242", tagCommit: "old", files: { "lib/ouro/ax/ax-command.ts": sha256("command v1\n"), "lib/ouro/ax/command.ts": sha256("command v0\n"), "lib/ouro/ax/claims.ts": sha256("claims v0\n") } };
  const consumer = files({ "package.json": JSON.stringify({ name: "app", type: "module" }), "lib/ouro/ax/ax-command.ts": "command v1\n", "lib/ouro/ax/command.ts": "command v0\n", "lib/ouro/ax/claims.ts": "claims v0, edited here\n" });
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, { tarball: async (follows, tag) => (tag === "v1.3.242" ? previous : next), consumerFiles: async () => consumer });
  assert.equal(update.files["lib/ouro/ax/command.ts"], null, "the unedited leftover goes");
  assert.equal("lib/ouro/ax/claims.ts" in update.files, false, "an edited leftover is the app's own");
  assert.deepEqual(Object.keys(JSON.parse(update.files[pin.file]).files).sort(), ["lib/ouro/ax/ax-command.ts", "lib/ouro/ax/claims.ts"]);
  assert.ok(update.notes.includes("Deletes what the release no longer ships: `lib/ouro/ax/command.ts`."));
});

test("a renamed file's old copy goes even when the release ships another file of that name (spoonjoy/spoonjoy-v2#830)", async () => {
  // As spoonjoy-v2: ax/claims.ts was renamed ax-claims.ts, while lib-claims still ships a claims.ts of its own.
  const files = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
  const registry = JSON.stringify({ items: [{ name: "ax-claims", files: [{ path: "registry/ouro/ax/ax-claims.ts", target: "@lib/ouro/ax/ax-claims.ts" }] }] });
  const shipped = (v) => files({ "registry.json": registry, "registry/ouro/ax/ax-claims.ts": `ax claims ${v}\n`, "registry/ouro/lib/ouro/claims.ts": `lib claims ${v}\n` });
  const record = { tag: "v1.3.242", tagCommit: "old", files: { "lib/ouro/ax/ax-claims.ts": sha256("ax claims v1\n"), "lib/ouro/ax/claims.ts": sha256("ax claims v0\n") } };
  const consumer = files({ "package.json": JSON.stringify({ name: "app", type: "module" }), "lib/ouro/ax/ax-claims.ts": "ax claims v1\n", "lib/ouro/ax/claims.ts": "ax claims v0\n" });
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, { tarball: async (follows, tag) => shipped(tag === "v1.3.242" ? "v1" : "v2"), consumerFiles: async () => consumer });
  assert.equal(update.files["lib/ouro/ax/claims.ts"], null);
});

test("an install record keeps a file the release no longer ships while the repository still names it, and lists each line that does", async () => {
  // As factory's site build: a workflow step and a script copy the vendored stylesheet by its path.
  const files = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
  const registry = (...names) => JSON.stringify({ items: [{ name: "theme", files: names.map((name) => ({ path: `registry/ouro/theme/${name}`, target: `@lib/ouro/theme/${name}` })) }] });
  const previous = files({ "registry.json": registry("ouro-kept.css", "ouro-old.css", "ouro-free.css"), "registry/ouro/theme/ouro-kept.css": "kept v1\n", "registry/ouro/theme/ouro-old.css": "old v1\n", "registry/ouro/theme/ouro-free.css": "free v1\n" });
  const next = files({ "registry.json": registry("ouro-kept.css"), "registry/ouro/theme/ouro-kept.css": "kept v2\n" });
  const record = { tag: "v1.3.242", tagCommit: "old", files: { "lib/ouro/theme/ouro-kept.css": sha256("kept v1\n"), "lib/ouro/theme/ouro-old.css": sha256("old v1\n"), "lib/ouro/theme/ouro-free.css": sha256("free v1\n") } };
  const consumer = files({
    "package.json": JSON.stringify({ name: "site", type: "module" }),
    "lib/ouro/theme/ouro-kept.css": "kept v1\n",
    "lib/ouro/theme/ouro-old.css": "old v1\n",
    "lib/ouro/theme/ouro-free.css": "free v1\n",
    ".github/workflows/site.yml": "jobs:\n  build:\n    steps:\n      - run: cp lib/ouro/theme/ouro-old.css site/dist/\n",
    ".github/scripts/build-site.mjs": 'import { cpSync } from "node:fs";\ncpSync("lib/ouro/theme/ouro-old.css", "site/dist/ouro-old.css");\n',
    "CHANGELOG.md": "Prose may mention lib/ouro/theme/ouro-free.css without holding it.\n",
  });
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, { tarball: async (follows, tag) => (tag === "v1.3.242" ? previous : next), consumerFiles: async () => consumer });
  assert.equal("lib/ouro/theme/ouro-old.css" in update.files, false, "a file the repository still names stays");
  assert.ok(Object.keys(JSON.parse(update.files[pin.file]).files).includes("lib/ouro/theme/ouro-old.css"), "and stays in the record");
  assert.equal(update.files["lib/ouro/theme/ouro-free.css"], null, "a file only prose names goes");
  assert.ok(update.notes.includes("Keeps `lib/ouro/theme/ouro-old.css`, which the release no longer ships, because `.github/scripts/build-site.mjs:2` and `.github/workflows/site.yml:4` still name it. Change those lines, and the next update deletes it."));
  assert.deepEqual(update.notes.flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
});

test("an install record keeps a file the release no longer ships when it was edited here", async () => {
  const files = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
  const registry = (...names) => JSON.stringify({ items: [{ name: "ax-command", files: names.map((name) => ({ path: `registry/ouro/ax/${name}`, target: `@lib/ouro/ax/${name}` })) }] });
  const previous = files({ "registry.json": registry("command.ts", "dropped.ts"), "registry/ouro/ax/command.ts": "command v1\n", "registry/ouro/ax/dropped.ts": "dropped v1\n" });
  const next = files({ "registry.json": registry("command.ts"), "registry/ouro/ax/command.ts": "command v2\n" });
  const record = { tag: "v1.3.242", tagCommit: "old", files: { "lib/ouro/ax/command.ts": sha256("command v1\n"), "lib/ouro/ax/dropped.ts": sha256("dropped v1\n") } };
  const consumer = files({ "package.json": JSON.stringify({ name: "site", type: "module" }), "lib/ouro/ax/command.ts": "command v1\n", "lib/ouro/ax/dropped.ts": "dropped, edited here\n" });
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, { tarball: async (follows, tag) => (tag === "v1.3.242" ? previous : next), consumerFiles: async () => consumer });
  assert.equal("lib/ouro/ax/dropped.ts" in update.files, false, "an edited file is the app's own");
});

/** The folder each Ouro AX shared file sits in after the update, and the one the package's `#ouro-ax/*` resolves to. */
function kitAndImport(update, consumer, pin) {
  const recorded = Object.keys(JSON.parse(update.files[pin.file]).files);
  const kit = [...new Set(recorded.filter((path) => /(^|\/)ouro\/ax\/[^/]+$/.test(path) && !path.startsWith("scripts/")).map((path) => `${dirname(path)}/`))];
  const pkg = JSON.parse((update.files["package.json"] ?? consumer.get("package.json")).toString());
  return { kit, resolves: pkg.imports["#ouro-ax/*"].replace(/^\.\//, "").replace(/\*$/, "") };
}

test("Ouro HX puts the Ouro AX shared files where the package's #ouro-ax import resolves, and the two agree", async () => {
  // No import yet: the kit stays where the install record has it, in the root's lib/, and the import added points there,
  // not at the lib folder components.json names (as mendelow.me and ouroboros-website were left after v1.3.244).
  const fresh = apartFixture();
  const update = await UPDATERS["hx-installed"](fresh.pin, JSON.stringify(fresh.record), RELEASES.web, fresh.ctx);
  assert.equal(update.files["lib/ouro/ax/ax-command.ts"]?.toString(), "export const command = 2;\n");
  assert.equal(update.files["src/lib/ouro/ax/ax-command.ts"], undefined);
  assert.deepEqual(kitAndImport(update, fresh.consumer, fresh.pin), { kit: ["lib/ouro/ax/"], resolves: "lib/ouro/ax/" });

  // The record holds no shared file yet: the kit goes under the lib folder components.json names, and so does the import.
  const none = apartFixture({ kit: false });
  const added = await UPDATERS["hx-installed"](none.pin, JSON.stringify(none.record), RELEASES.web, none.ctx);
  assert.equal(added.files["src/lib/ouro/ax/ax-command.ts"]?.toString(), "export const command = 2;\n");
  assert.deepEqual(kitAndImport(added, none.consumer, none.pin), { kit: ["src/lib/ouro/ax/"], resolves: "src/lib/ouro/ax/" });

  // The package already declares where the kit is: it stays there.
  const declared = apartFixture({ imports: { "#ouro-ax/*": "./lib/ouro/ax/*" } });
  const kept = await UPDATERS["hx-installed"](declared.pin, JSON.stringify(declared.record), RELEASES.web, declared.ctx);
  assert.equal(kept.files["lib/ouro/ax/ax-command.ts"]?.toString(), "export const command = 2;\n");
  assert.equal(kept.files["src/lib/ouro/ax/ax-command.ts"], undefined);
  assert.deepEqual(kitAndImport(kept, declared.consumer, declared.pin), { kit: ["lib/ouro/ax/"], resolves: "lib/ouro/ax/" });
  assert.deepEqual([...update.notes, ...added.notes, ...kept.notes].flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
});

test("Ouro HX points the app's scripts and docs at a moved file, names a workflow line it cannot change, and leaves a forwarding file that runs the new one", async () => {
  const { record, ctx, consumer, pin } = apartFixture();
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  assert.equal(update.files["scripts/check-fades.mjs"]?.toString(), "spawnSync(process.execPath, ['scripts/ouro/check/fades.ts', 'src']);\n");
  assert.equal(update.files["readme.md"], undefined, "prose is not rewritten");
  assert.ok(update.notes.includes("Check `readme.md:1`: it names `lib/ouro/check/check.ts`, which moved to `scripts/ouro/check/check.ts`. Ouro Current leaves prose to you."));
  assert.equal(update.files["tests/fades.test.mjs"]?.toString(), 'import { fades } from "../scripts/ouro/check/fades.ts";\n', "a path relative to the file stays relative");
  assert.equal(update.files[".github/workflows/pages.yml"], undefined, "a workflow is not written");
  assert.ok(update.notes.includes("To do: `.github/workflows/pages.yml:4` names `lib/ouro/check/check.ts`; change it to `scripts/ouro/check/check.ts`, where it moved."));
  // A folder whose installed files all moved is named by its new path; a file in it that did not move keeps its own.
  assert.ok(update.notes.includes("To do: `.github/workflows/pages.yml:5` names `lib/ouro/check`; change it to `scripts/ouro/check`, where it moved."));
  assert.ok(!update.notes.some((note) => note.includes("pages.yml:6")), "the shared Ouro AX files stay where the record has them, so their folder is not moved");
  assert.equal(update.files["scripts/list.sh"]?.toString(), "ls lib/ouro/check/README.md scripts/ouro/check\n");
  assert.ok(update.notes.some((note) => note.startsWith("Leaves a forwarding file at `lib/ouro/check/check.ts` that runs `scripts/ouro/check/check.ts`")));
  assert.deepEqual(update.notes.flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
  const recorded = JSON.parse(update.files[pin.file]).files;
  assert.equal("lib/ouro/check/check.ts" in recorded, false, "the forwarding file is the app's, not an installed file");

  // The forwarding file works: run, the old path runs the new file with its arguments. It imports nothing of the new
  // file, so an old path inside the app's TypeScript project does not take the Node-only tools back into it.
  assert.doesNotMatch(update.files["lib/ouro/check/check.ts"].toString(), /(import|export)[^\n]*scripts\/ouro/);
  assert.match(update.files["lib/ouro/check/check.ts"].toString(), /^\/\/ @ts-nocheck\n/);
  const dir = scratchDir("current-forward-");
  const tree = new Map([...consumer].filter(([path]) => !(path in update.files)));
  for (const [path, bytes] of Object.entries(update.files)) if (bytes !== null) tree.set(path, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  const pkg = JSON.parse(tree.get("package.json").toString());
  tree.set("package.json", Buffer.from(JSON.stringify(pkg)));
  for (const [path, bytes] of tree) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), bytes);
  }
  const ran = spawnSync(process.execPath, ["lib/ouro/check/check.ts", "_site", "--sizes", "390x844"], { cwd: dir, encoding: "utf8" });
  assert.equal(ran.status, 0, ran.stderr);
  assert.equal(ran.stdout.trim(), JSON.stringify(["_site", "--sizes", "390x844"]));
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e", 'await import("./lib/ouro/check/check.ts");'], { cwd: dir, encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, "", "imported, it runs nothing");
});

test("Ouro HX leaves a moved file it was edited into where it is, and says so, while an unedited file still moves", async () => {
  const { record, ctx, pin } = moveFixture("", { checkHere: 'export const check = "edited here";\n' });
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  assert.equal("src/lib/ouro/check/check.ts" in update.files, false, "not deleted, and not overwritten");
  assert.equal("scripts/ouro/check/check.ts" in update.files, false, "not moved");
  assert.equal(update.files["src/lib/ouro/ax/xray.ts"], null, "the unedited X-ray still moves");
  assert.equal(update.files["package.json"].toString().includes("node src/lib/ouro/check/check.ts dist"), true, "its script still names the file it is at");
  const written = JSON.parse(update.files[pin.file]);
  assert.equal(written.files["src/lib/ouro/check/check.ts"], sha256('export const check = "v1";\n'), "the record keeps the file and its old source's hash");
  assert.ok(update.notes.some((note) => note.includes("`src/lib/ouro/check/check.ts`") && /edited here/.test(note)));
  assert.ok(!update.notes.some((note) => note.includes("Moves `src/lib/ouro/check/check.ts`")));
});

test("Ouro HX leaves a file where it is when the app already has its own file at the new path", async () => {
  const { record, ctx, pin, consumer } = moveFixture("");
  consumer.set("scripts/ouro/check/check.ts", Buffer.from("the app's own script"));
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  assert.equal("src/lib/ouro/check/check.ts" in update.files, false, "the old copy is not deleted");
  assert.equal("scripts/ouro/check/check.ts" in update.files, false, "the app's own file is not replaced");
  assert.ok(update.notes.includes("Leaves `src/lib/ouro/check/check.ts` where it is, because `scripts/ouro/check/check.ts` already exists in the app and is not replaced."));
  assert.equal(update.files["src/lib/ouro/ax/xray.ts"], null, "the other file still moves");
});

test("Ouro HX moves a file in a monorepo package to that package's scripts folder, with the package's own imports and script paths", async () => {
  const { record, ctx, pin } = moveFixture("packages/web/");
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  assert.equal(update.files["packages/web/src/lib/ouro/check/check.ts"], null);
  assert.equal(update.files["packages/web/scripts/ouro/check/run.ts"]?.toString(), "export const run = 2;\n", "a file the moved item gained goes in the package too");
  assert.equal(update.files["scripts/ouro/check/run.ts"], undefined, "and not at the repository's root");
  assert.equal(update.files["packages/web/scripts/ouro/check/check.ts"].toString(), 'export const check = "v2";\n');
  assert.equal(update.files["packages/web/scripts/ouro/ax/xray.ts"].toString(), 'import { command } from "#ouro-ax/ax-command.ts";\nexport const xray = "v2";\n');
  assert.equal(update.files["package.json"], undefined, "the repository's root package.json is not the package's");
  assert.equal(update.files["packages/web/package.json"].toString(), `{
    "name": "app",
    "scripts": {
        "check": "node scripts/ouro/check/check.ts dist"
    },
    "imports": {
        "#ouro-ax/*": "./src/lib/ouro/ax/*"
    }
}
`);
  const written = JSON.parse(update.files[pin.file]);
  assert.equal(written.files["packages/web/scripts/ouro/check/check.ts"], sha256('export const check = "v2";\n'));
});

/** A product's own files that name the paths a move changes, as spoonjoy-v2's `scripts/mcp-xray.ts` named the X-ray. */
const NOT_THESE = "// not app/lib/ouro/ax/xray.tsx, myapp/lib/ouro/ax/xray.ts, other/app/lib/ouro/ax/xray.ts, app/lib/ouro/ax/xray-old.ts or app/lib/ouro/ax/xray.test.ts\n";
const REFERENCES = {
  "scripts/mcp-xray.ts": `spawn("node", ["app/lib/ouro/ax/xray.ts", "--mcp"]);\n${NOT_THESE}`,
  "scripts/check.sh": "node ./app/lib/ouro/check/check.ts dist\nls app/lib/ouro/check/ app/lib/ouro/ax/\n",
  Makefile: "check:\n\tnode app/lib/ouro/check/check.ts dist\n",
  "app/routes/xray.ts": "// run app/lib/ouro/ax/xray.ts by hand\nexport {};\n",
  ".github/workflows/site.yml": "jobs:\n  check:\n    steps:\n      - run: node app/lib/ouro/check/check.ts dist\n",
};

test("Ouro HX points the product's own scripts at the files it moves, and lists the workflow lines it cannot change", async () => {
  const { record, ctx, pin } = moveFixture("", { source: "app", extra: REFERENCES });
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  assert.equal(update.files["scripts/mcp-xray.ts"]?.toString(), `spawn("node", ["scripts/ouro/ax/xray.ts", "--mcp"]);\n${NOT_THESE}`, "the spawned path moves, and the paths that only look like it stay");
  assert.equal(update.files["scripts/check.sh"]?.toString(), "node ./scripts/ouro/check/check.ts dist\nls scripts/ouro/check/ app/lib/ouro/ax/\n", "a folder whose every file moved moves, and one with a file left in it stays");
  assert.equal(update.files.Makefile?.toString(), "check:\n\tnode scripts/ouro/check/check.ts dist\n");
  assert.equal("app/routes/xray.ts" in update.files, false, "the app's own source is not touched");
  assert.equal(".github/workflows/site.yml" in update.files, false, "a workflow is not written");
  assert.ok(update.notes.includes("Points `scripts/mcp-xray.ts` at `scripts/ouro/ax/xray.ts`, where it moved."));
  assert.ok(update.notes.includes("Points `scripts/check.sh` at `scripts/ouro/check/check.ts` and `scripts/ouro/check/`, where they moved."));
  assert.ok(update.notes.includes("To do: `.github/workflows/site.yml:4` names `app/lib/ouro/check/check.ts`; change it to `scripts/ouro/check/check.ts`, where it moved."));
  assert.ok(update.notes.some((note) => note.startsWith("Ouro Current leaves those workflow lines to you: GitHub lets an app change `.github/workflows/` only with the `workflows` permission")));
  assert.deepEqual(lintMarkdown(body([{ file: pin.file, follows: "web", current: "v1.3.117" }], { web: RELEASES.web }, update.notes), { file: "pull request body" }), []);
});

test("Ouro HX points a stylesheet's @source line and a test in the app's source at a moved folder, and lists prose that names it rather than rewriting it", async () => {
  const CSS = '@import "tailwindcss";\n@source not "../lib/ouro/check";\n/* not ../lib/ouro/check either */\n';
  const { record, ctx, pin } = moveFixture("", { source: "app", extra: {
    "app/styles/app.css": CSS,
    "app/routes/xray.test.ts": 'const run = spawn("node", ["app/lib/ouro/ax/xray.ts"]);\n',
    "AGENTS.md": "# Agents\n\nRun `node app/lib/ouro/ax/xray.ts --mcp` to see the screens.\n",
  } });
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  assert.equal(update.files["app/styles/app.css"]?.toString(), '@import "tailwindcss";\n@source not "../../scripts/ouro/check";\n/* not ../lib/ouro/check either */\n', "only the @source line, relative to the stylesheet");
  assert.equal(update.files["app/routes/xray.test.ts"]?.toString(), 'const run = spawn("node", ["scripts/ouro/ax/xray.ts"]);\n', "a test runs the tool as a script does");
  assert.equal(update.files["AGENTS.md"], undefined, "prose is not rewritten");
  assert.ok(update.notes.includes("Check `AGENTS.md:3`: it names `app/lib/ouro/ax/xray.ts`, which moved to `scripts/ouro/ax/xray.ts`. Ouro Current leaves prose to you."));
  assert.ok(update.notes.includes("Points `app/styles/app.css` at `scripts/ouro/check/`, where it moved."));
  assert.deepEqual(update.notes.flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
});

test("Ouro HX points a monorepo's scripts at the files it moves, by their path from the root or from the app's package", async () => {
  const { record, ctx, pin } = moveFixture("packages/web/", { extra: {
    "package.json": '{\n  "scripts": {\n    "xray": "node packages/web/src/lib/ouro/ax/xray.ts"\n  }\n}\n',
    "scripts/ci.sh": "cd packages/web && node src/lib/ouro/check/check.ts dist\nnode packages/web/src/lib/ouro/ax/xray.ts\n",
    "packages/web/scripts/xray.sh": "node src/lib/ouro/ax/xray.ts --mcp\n",
    "packages/api/package.json": "{}\n",
    "packages/api/scripts/run.sh": "node src/lib/ouro/check/check.ts\n",
  } });
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  assert.equal(update.files["packages/web/scripts/xray.sh"]?.toString(), "node scripts/ouro/ax/xray.ts --mcp\n", "the package's own script, from its own folder");
  assert.equal(update.files["scripts/ci.sh"]?.toString(), "cd packages/web && node scripts/ouro/check/check.ts dist\nnode packages/web/scripts/ouro/ax/xray.ts\n");
  assert.equal(update.files["package.json"]?.toString(), '{\n  "scripts": {\n    "xray": "node packages/web/scripts/ouro/ax/xray.ts"\n  }\n}\n', "the root's scripts too");
  assert.equal("packages/api/scripts/run.sh" in update.files, false, "another package's path from its own folder is its own");
  assert.ok(update.notes.includes("Points `packages/web/scripts/xray.sh` at `packages/web/scripts/ouro/ax/xray.ts`, where it moved."));
  assert.ok(update.notes.includes("Points `package.json` at `packages/web/scripts/ouro/ax/xray.ts`, where it moved."));
});

test("a moved file's references reach the update's commit, and its workflow lines reach the pull request as to-dos", async () => {
  const { record, ctx, consumer } = moveFixture("", { source: "app", extra: REFERENCES });
  const repo = fakeRepo({ ...Object.fromEntries([...consumer].map(([path, bytes]) => [path, bytes.toString("utf8")])), ".github/ouro-hx-installed.json": JSON.stringify(record) });
  const kept = await keepRepo(repo.gh, "o/r", RELEASES, { tarball: ctx.tarball });
  assert.equal(kept.state, "pr");
  assert.match(repo.fileAt(BRANCH, "scripts/mcp-xray.ts"), /\["scripts\/ouro\/ax\/xray\.ts", "--mcp"\]/);
  assert.equal(repo.fileAt(BRANCH, ".github/workflows/site.yml"), REFERENCES[".github/workflows/site.yml"]);
  assert.match(repo.pulls[0].body, /- To do: `\.github\/workflows\/site\.yml:4` names `app\/lib\/ouro\/check\/check\.ts`; change it to `scripts\/ouro\/check\/check\.ts`/);
});

test("a move reaches the update's commit as a deletion of the old copy, with the moved file and the package's fixes in the same tree", async () => {
  const { record, ctx, consumer } = moveFixture("");
  const repo = fakeRepo({ ...Object.fromEntries([...consumer].map(([path, bytes]) => [path, bytes.toString("utf8")])), ".github/ouro-hx-installed.json": JSON.stringify(record) });
  const kept = await keepRepo(repo.gh, "o/r", RELEASES, { tarball: ctx.tarball });
  assert.equal(kept.state, "pr");
  assert.equal(repo.fileAt(BRANCH, "src/lib/ouro/check/check.ts"), undefined, "the old copy is gone from the branch");
  assert.equal(repo.fileAt(BRANCH, "scripts/ouro/check/check.ts"), 'export const check = "v2";\n');
  assert.equal(repo.fileAt(BRANCH, "src/lib/ouro/ax/ax-command.ts"), 'export const command = "v2";\n');
  assert.match(repo.fileAt(BRANCH, "package.json"), /"#ouro-ax\/\*": "\.\/src\/lib\/ouro\/ax\/\*"/);
  assert.equal(JSON.parse(repo.fileAt(BRANCH, ".github/ouro-hx-installed.json")).tag, "v1.3.187");
  assert.match(repo.pulls[0].body, /Moves `src\/lib\/ouro\/check\/check\.ts` to `scripts\/ouro\/check\/check\.ts`/);
});

const OFF_THEME = { rule: "off-theme", summary: "A colour, radius, shadow or font written past the theme where the theme has a token for it; each finding names the token to use." };
const OFF_SCALE = { rule: "off-scale", summary: "Spacing (a margin, padding or gap) off the theme's spacing scale; each finding names the step to use." };

/**
 * An app on v1.3.117 with Button and, unless `check` is false, Ouro check in scripts/ouro/check/, whose release tags
 * hold `registry/ouro/check/new-rules.json` as given (text, or undefined for a tag without the file).
 */
function checkRulesFixture({ before, after, check = true }) {
  const items = [
    { name: "button", files: [{ path: "registry/ouro/components/ouro/button/button.tsx", target: "@components/ouro/button/button.tsx" }] },
    { name: "ouro-check", files: [{ path: "registry/ouro/check/check.ts", target: "~/scripts/ouro/check/check.ts" }, { path: "registry/ouro/check/new-rules.json", target: "~/scripts/ouro/check/new-rules.json" }] },
  ];
  const tag = (version, rules) => {
    const files = { "registry/ouro/components/ouro/button/button.tsx": `export const Button = "${version}";\n`, "registry/ouro/check/check.ts": `export const check = "${version}";\n`, ...(rules === undefined ? {} : { "registry/ouro/check/new-rules.json": rules }) };
    const registry = { items: items.map((item) => ({ ...item, files: item.files.filter((file) => file.path in files) })) };
    return new Map(Object.entries({ "registry.json": JSON.stringify(registry), ...files }).map(([k, v]) => [k, Buffer.from(v)]));
  };
  const previous = tag("v1", before);
  const next = tag("v2", after);
  const installed = { "src/components/ouro/button/button.tsx": 'export const Button = "v1";\n', ...(check ? { "scripts/ouro/check/check.ts": 'export const check = "v1";\n' } : {}) };
  const record = { tag: "v1.3.117", tagCommit: "old", files: Object.fromEntries(Object.entries(installed).map(([path, text]) => [path, sha256(text)])) };
  const consumer = new Map(Object.entries({ "components.json": JSON.stringify({ aliases: { components: "@/components", lib: "@/lib" } }), "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }), ...installed }).map(([k, v]) => [k, Buffer.from(v)]));
  const ctx = { tarball: async (follows, at) => (at === "v1.3.117" ? previous : next), consumerFiles: async () => consumer };
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  return { pin, ctx, consumer, record, update: () => UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx) };
}

const prBody = (update, pin, seed = null) => body([{ file: pin.file, follows: "web", current: "v1.3.117" }], { web: RELEASES.web }, update.notes, [checkRulesSection(update.checkRules, seed)].filter(Boolean));

test("new Ouro check rules: the pull request names each rule the release adds, with its summary and the findings recorded as known for it", async () => {
  const { update, pin } = checkRulesFixture({ before: undefined, after: JSON.stringify([OFF_THEME, OFF_SCALE]) });
  const result = await update();
  const waiting = prBody(result, pin);
  assert.match(waiting, /### New Ouro check rules\n\n- `off-theme`: A colour, radius, shadow or font written past the theme where the theme has a token for it; each finding names the token to use\.\[\^ouro-check-off-theme\] The findings this app already has are recorded in `ouro-check\.json`'s `known` once this pull request's checks report them: they pass, and a new one fails\.\n- `off-scale`: Spacing/);
  assert.match(waiting, /\[\^ouro-check-off-theme\]: https:\/\/github\.com\/ourostack\/ouro-ui\/blob\/v1\.3\.187\/registry\/ouro\/check\/new-rules\.json verify:urlOk\(/);
  assert.doesNotMatch(waiting, /gates/, "a rule gates from its release: the findings an app already has are recorded, not warned about");
  assert.deepEqual(lintMarkdown(waiting, { file: "pull request body" }), [], "a repository that lints its pull requests for claims accepts the section");
  const seeded = prBody(result, pin, { counts: { "off-theme": 12, "off-scale": 27 } });
  assert.match(seeded, /- `off-theme`: .*\[\^ouro-check-off-theme\] `12` findings this app already has are recorded in `ouro-check\.json`'s `known`: they pass, and a new one fails\.\n- `off-scale`: .* `27` findings/);
  assert.match(seeded, /\nMove the recorded findings onto the theme in a pull request of their own\./);
  assert.deepEqual(lintMarkdown(seeded, { file: "pull request body" }), []);
});

test("new Ouro check rules: only a rule the old tag's file lacks is listed, by name, and a file without dates or summaries still lists its rules", async () => {
  const { update, pin } = checkRulesFixture({ before: JSON.stringify([OFF_THEME]), after: JSON.stringify([OFF_THEME, { rule: "off-scale" }]) });
  const text = prBody(await update(), pin, { counts: { "off-scale": 3 } });
  assert.match(text, /- `off-scale`: `3` findings this app already has/);
  assert.doesNotMatch(text, /`off-theme`/, "a rule the app's old release already listed is not new to it");
  assert.deepEqual(lintMarkdown(text, { file: "pull request body" }), []);
});

test("new Ouro check rules: without new-rules.json, the rules whose findings were recorded are named from the record", async () => {
  const { update, pin } = checkRulesFixture({ before: undefined, after: undefined });
  const result = await update();
  assert.deepEqual(result.checkRules, []);
  assert.equal(checkRulesSection(result.checkRules, null), null, "nothing to name before the checks report");
  const text = prBody(result, pin, { counts: { "off-theme": 9, "off-scale": 30 } });
  assert.match(text, /### New Ouro check rules\n\n- `off-scale`: `30` findings this app already has are recorded in `ouro-check\.json`'s `known`: they pass, and a new one fails\.\n- `off-theme`: `9` findings/);
  assert.deepEqual(lintMarkdown(text, { file: "pull request body" }), []);
});

test("new Ouro check rules: an app without Ouro check installed gets no section", async () => {
  const { update } = checkRulesFixture({ before: undefined, after: JSON.stringify([OFF_THEME, OFF_SCALE]), check: false });
  const result = await update();
  assert.deepEqual(result.checkRules, []);
  assert.equal(result.notes.some((note) => /Ouro check/.test(note)), false);
});

test("new Ouro check rules: a new-rules.json that cannot be read leaves the section out with a note, and the update goes on", async () => {
  for (const [before, after, tag] of [[undefined, "{ not json", "v1.3.187"], [JSON.stringify({ rule: "off-theme" }), JSON.stringify([OFF_THEME]), "v1.3.117"], [undefined, JSON.stringify([{ rule: 3, summary: "x" }]), "v1.3.187"]]) {
    const { update, pin } = checkRulesFixture({ before, after });
    const result = await update();
    assert.deepEqual(result.checkRules, []);
    assert.equal(result.files["scripts/ouro/check/check.ts"].toString(), 'export const check = "v2";\n', "the files still update");
    const note = result.notes.find((entry) => /new Ouro check rules/.test(entry));
    assert.ok(note?.includes(`\`registry/ouro/check/new-rules.json\` at \`${tag}\` could not be read`), note);
    assert.deepEqual(lintMarkdown(prBody(result, pin), { file: "pull request body" }), []);
  }
});

test("widened Ouro check rules: an entry with widened names an existing rule again, new to the app by its rule and widening, and the body says what it now finds", async () => {
  const WIDER = { rule: "off-scale", widened: "negative lengths", summary: OFF_SCALE.summary };
  const { update, pin } = checkRulesFixture({ before: JSON.stringify([OFF_THEME, OFF_SCALE]), after: JSON.stringify([OFF_THEME, OFF_SCALE, WIDER]) });
  const result = await update();
  assert.deepEqual(result.checkRules.map(({ rule, widened }) => [rule, widened]), [["off-scale", "negative lengths"]], "the rule itself is not new to the app; its widening is");
  const text = prBody(result, pin, { counts: { "off-scale": 4 } });
  assert.match(text, /- `off-scale`, which now also finds negative lengths: Spacing .*\[\^ouro-check-off-scale\] `4` findings this app already has are recorded/);
  assert.deepEqual(lintMarkdown(text, { file: "pull request body" }), []);
  const again = checkRulesFixture({ before: JSON.stringify([OFF_SCALE, WIDER]), after: JSON.stringify([OFF_SCALE, WIDER]) });
  assert.deepEqual((await again.update()).checkRules, [], "a widening the old release already declared is not new");
});

test("new Ouro check rules reach the update pull request's body", async () => {
  const { record, ctx, consumer } = checkRulesFixture({ before: undefined, after: JSON.stringify([OFF_THEME]) });
  const repo = fakeRepo({ ...Object.fromEntries([...consumer].map(([path, bytes]) => [path, bytes.toString("utf8")])), ".github/ouro-hx-installed.json": JSON.stringify(record) });
  const kept = await keepRepo(repo.gh, "o/r", RELEASES, { tarball: ctx.tarball });
  assert.equal(kept.state, "pr");
  assert.match(repo.pulls[0].body, /### New Ouro check rules\n\n- `off-theme`: A colour/);
  assert.match(repo.pulls[0].body, /in a pull request of their own\.\n\n\[\^ouro-check-off-theme\][^\n]*\n\nYour checks decide/, "the section sits after the notes");
});

test("a vendored source moves to the release's commit with each file's new bytes and hash", async () => {
  const lock = { schemaVersion: 1, sources: [{ id: "ax", repository: "ourostack/ouro-ui", commit: "old", files: [{ sourcePath: "registry/ouro/ax/cli.ts", generatedPath: "lib/ouro-ui/registry/ouro/ax/cli.ts", sha256: "x" }] }] };
  const ctx = { tarball: async () => new Map([["registry/ouro/ax/cli.ts", Buffer.from("cli v2")]]) };
  const update = await UPDATERS["vendor-lock"]({ kind: "vendor-lock", file: "upstream-sources.lock.json", follows: "web", source: "ax" }, JSON.stringify(lock), RELEASES.web, ctx);
  assert.equal(update.files["lib/ouro-ui/registry/ouro/ax/cli.ts"].toString(), "cli v2");
  const written = JSON.parse(update.files["upstream-sources.lock.json"]);
  assert.equal(written.sources[0].commit, RELEASES.web.sha);
  assert.equal(written.sources[0].files[0].sha256, sha256("cli v2"));
});

test("a vendored source the release renamed follows it: the copy takes the new name, the old copy goes, and the repository's own imports of it follow", async () => {
  // As ourostack/desk vendors Ouro AX before #2766 renamed command.ts and claims.ts (#2777).
  const entry = (name) => ({ sourcePath: `registry/ouro/ax/${name}`, generatedPath: `tools/ax/${name}`, sha256: "old" });
  const lock = { schemaVersion: 1, sources: [{ id: "ax", repository: "ourostack/ouro-ui", commit: "old", files: [entry("command.ts"), entry("claims.ts"), entry("cli.ts")] }] };
  const tarball = new Map(Object.entries({
    "registry/ouro/ax/ax-command.ts": "export const defineCli = 2;\n",
    "registry/ouro/ax/ax-claims.ts": "export const CLAIM_SET = 2;\n",
    "registry/ouro/ax/cli.ts": 'import { defineCli } from "./ax-command.ts";\n',
  }).map(([k, v]) => [k, Buffer.from(v)]));
  const consumer = new Map(Object.entries({
    "tools/tasks.mts": 'import { defineCli } from "./ax/command.ts";\nimport { CLAIM_SET } from "#ouro-ax/claims.ts";\nconst later = await import("./ax/command");\n',
    "src/other.ts": 'import { Command } from "./components/ouro/command/command";\nimport { x } from "#ouro-ax/cli.ts";\n',
    "tools/ax/command.ts": "export const defineCli = 1;\n",
  }).map(([k, v]) => [k, Buffer.from(v)]));
  const pin = { kind: "vendor-lock", file: "upstream-sources.lock.json", follows: "web", source: "ax" };
  const update = await UPDATERS["vendor-lock"](pin, JSON.stringify(lock), RELEASES.web, { tarball: async () => tarball, consumerFiles: async () => consumer });
  assert.equal(update.files["tools/ax/ax-command.ts"].toString(), "export const defineCli = 2;\n");
  assert.equal(update.files["tools/ax/ax-claims.ts"].toString(), "export const CLAIM_SET = 2;\n");
  assert.equal(update.files["tools/ax/command.ts"], null, "the old copy goes");
  assert.equal(update.files["tools/ax/claims.ts"], null);
  const written = JSON.parse(update.files["upstream-sources.lock.json"]);
  assert.deepEqual(written.sources[0].files.map((file) => [file.sourcePath, file.generatedPath]), [
    ["registry/ouro/ax/ax-command.ts", "tools/ax/ax-command.ts"],
    ["registry/ouro/ax/ax-claims.ts", "tools/ax/ax-claims.ts"],
    ["registry/ouro/ax/cli.ts", "tools/ax/cli.ts"],
  ]);
  assert.equal(written.sources[0].files[0].sha256, sha256("export const defineCli = 2;\n"));
  assert.equal(
    update.files["tools/tasks.mts"].toString(),
    'import { defineCli } from "./ax/ax-command.ts";\nimport { CLAIM_SET } from "#ouro-ax/ax-claims.ts";\nconst later = await import("./ax/ax-command");\n',
  );
  assert.equal("src/other.ts" in update.files, false, "Command's own command and an AX file that kept its name are left alone");
  assert.ok(update.notes.some((note) => note.includes("`tools/ax/command.ts` is now `tools/ax/ax-command.ts`") && note.includes("`tools/tasks.mts`")));
  assert.deepEqual(update.notes.flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
  // A source the release dropped with no new path still stops the update and names it.
  const gone = { ...lock, sources: [{ ...lock.sources[0], files: [entry("gone.ts")] }] };
  await assert.rejects(UPDATERS["vendor-lock"](pin, JSON.stringify(gone), RELEASES.web, { tarball: async () => tarball, consumerFiles: async () => consumer }), /registry\/ouro\/ax\/gone\.ts is not in ourostack\/ouro-ui/);
});

test("an update pull request for a renamed vendored source deletes the old copy in its commit", async () => {
  const lock = { schemaVersion: 1, sources: [{ id: "ax", repository: "ourostack/ouro-ui", commit: "old", files: [{ sourcePath: "registry/ouro/ax/command.ts", generatedPath: "tools/ax/command.ts", sha256: "old" }] }] };
  const repo = fakeRepo({ "upstream-sources.lock.json": JSON.stringify(lock, null, 2), "tools/ax/command.ts": "export const defineCli = 1;\n", "tools/run.mts": 'import { defineCli } from "./ax/command.ts";\n', ".github/ouro-current.json": "{}" });
  const release = new Map([["registry/ouro/ax/ax-command.ts", Buffer.from("export const defineCli = 2;\n")]]);
  const kept = await keepRepo(repo.gh, "o/r", RELEASES, { tarball: async () => release });
  assert.equal(kept.state, "pr");
  assert.equal(repo.fileAt(BRANCH, "tools/ax/command.ts"), undefined);
  assert.equal(repo.fileAt(BRANCH, "tools/ax/ax-command.ts"), "export const defineCli = 2;\n");
  assert.equal(repo.fileAt(BRANCH, "tools/run.mts"), 'import { defineCli } from "./ax/ax-command.ts";\n');
});

test("a vendored file that imports the shared Ouro AX files as #ouro-ax gets the import in the package.json Node resolves it through, or a package.json of its own when none is above it", async () => {
  const entry = (name) => ({ sourcePath: `registry/ouro/ax/${name}`, generatedPath: `lib/ouro-ui/registry/ouro/ax/${name}`, sha256: "old" });
  const text = `${JSON.stringify({ schemaVersion: 1, sources: [{ id: "ax", repository: "ourostack/ouro-ui", commit: "old", files: [entry("ax-command.ts"), entry("xray.ts")] }] }, null, 2)}\n`;
  const tarball = new Map(Object.entries({ "registry/ouro/ax/ax-command.ts": "export const command = 2;\n", "registry/ouro/ax/xray.ts": 'import { command } from "#ouro-ax/ax-command.ts";\n' }).map(([k, v]) => [k, Buffer.from(v)]));
  const pin = { kind: "vendor-lock", file: "upstream-sources.lock.json", follows: "web", source: "ax" };
  const run = (repo) => UPDATERS["vendor-lock"](pin, text, RELEASES.web, { tarball: async () => tarball, consumerFile: async (path) => (path in repo ? Buffer.from(repo[path]) : null) });
  // Node resolves `#ouro-ax/*` through the nearest package.json above the importing file, so that one gets the entry.
  const nearest = await run({ "package.json": JSON.stringify({ name: "root" }) });
  assert.deepEqual(JSON.parse(nearest.files["package.json"]).imports, { "#ouro-ax/*": "./lib/ouro-ui/registry/ouro/ax/*" });
  assert.equal("lib/ouro-ui/package.json" in nearest.files, false, "no package.json is created");
  assert.deepEqual(nearest.notes.flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
  // With no package.json above it (m365crawl is a Go repository), the vendored folder takes one of its own.
  const unmapped = await run({});
  assert.deepEqual(JSON.parse(unmapped.files["lib/ouro-ui/registry/ouro/ax/package.json"]), { private: true, type: "module", imports: { "#ouro-ax/*": "./*" } });
  assert.ok(unmapped.notes.some((note) => note.includes("`lib/ouro-ui/registry/ouro/ax/package.json`")));
  assert.deepEqual(unmapped.notes.filter((note) => note.includes("needs an `imports` entry")), [], "nothing is left for a person to add");
  assert.deepEqual(unmapped.notes.flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
  // The vendored folder's own package.json is the nearest, so it gets the entry, pointed at itself.
  const own = await run({ "package.json": JSON.stringify({ name: "root" }), "lib/ouro-ui/registry/ouro/ax/package.json": JSON.stringify({ type: "module" }) });
  assert.deepEqual(JSON.parse(own.files["lib/ouro-ui/registry/ouro/ax/package.json"]).imports, { "#ouro-ax/*": "./*" });
  assert.equal("package.json" in own.files, false);
  const mapped = await run({ "package.json": JSON.stringify({ name: "root" }), "lib/ouro-ui/package.json": JSON.stringify({ imports: { "#ouro-ax/*": "./registry/ouro/ax/*" } }) });
  assert.deepEqual(mapped.notes.filter((note) => note.includes("#ouro-ax")), []);
});

test("a vendored file that now imports a file beside it brings that file, and what it imports, into the lock in the lock's own layout", async () => {
  // As ouro-work-substrate vendors Ouro AX: one file to a line, in the order of source paths, the release as `tag`.
  const entry = (name, sha) => `        { "sourcePath": "registry/ouro/ax/${name}", "generatedPath": "lib/ouro-ui/registry/ouro/ax/${name}", "sha256": "${sha}" }`;
  const text = [
    "{",
    '  "schemaVersion": 1,',
    '  "sources": [',
    "    {",
    '      "id": "ax",',
    '      "repository": "ourostack/ouro-ui",',
    '      "tag": "v1.3.243",',
    '      "commit": "old",',
    '      "files": [',
    `${entry("cli.ts", "a")},`,
    `${entry("wait.ts", "b")},`,
    entry("xray.ts", "c"),
    "      ]",
    "    }",
    "  ]",
    "}",
    "",
  ].join("\n");
  const XRAY = 'import { run } from "./xray.kit.mts";\nexport const xray = run;\n';
  const KIT = 'export { kit } from "./kit-shared.ts";\nimport "./cli.ts";\nexport const run = 2;\n';
  const tarball = new Map(Object.entries({
    "registry/ouro/ax/cli.ts": "cli v2\n",
    "registry/ouro/ax/wait.ts": "wait v2\n",
    "registry/ouro/ax/xray.ts": XRAY,
    "registry/ouro/ax/xray.kit.mts": KIT,
    "registry/ouro/ax/kit-shared.ts": "export const kit = 1;\n",
  }).map(([k, v]) => [k, Buffer.from(v)]));
  const pin = { kind: "vendor-lock", file: "upstream-sources.lock.json", follows: "web", source: "ax" };
  const update = await UPDATERS["vendor-lock"](pin, text, RELEASES.web, { tarball: async () => tarball });
  assert.equal(update.files["lib/ouro-ui/registry/ouro/ax/xray.kit.mts"]?.toString(), KIT, "the file xray.ts now imports is vendored beside it");
  assert.equal(update.files["lib/ouro-ui/registry/ouro/ax/kit-shared.ts"]?.toString(), "export const kit = 1;\n", "and the file that one imports");
  const lock = update.files[pin.file];
  const sha = (body) => createHash("sha256").update(body).digest("hex");
  const expected = [
    "{",
    '  "schemaVersion": 1,',
    '  "sources": [',
    "    {",
    '      "id": "ax",',
    '      "repository": "ourostack/ouro-ui",',
    `      "tag": "${RELEASES.web.tag}",`,
    `      "commit": "${RELEASES.web.sha}",`,
    '      "files": [',
    `${entry("cli.ts", sha("cli v2\n"))},`,
    `${entry("kit-shared.ts", sha("export const kit = 1;\n"))},`,
    `${entry("wait.ts", sha("wait v2\n"))},`,
    `${entry("xray.kit.mts", sha(KIT))},`,
    entry("xray.ts", sha(XRAY)),
    "      ]",
    "    }",
    "  ]",
    "}",
    "",
  ].join("\n");
  assert.equal(lock, expected, "each new file is a line like its neighbours, in source-path order, and every other byte is kept");
  assert.ok(update.notes.some((note) => note.includes("`lib/ouro-ui/registry/ouro/ax/xray.kit.mts`")));
  assert.deepEqual(update.notes.flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
});

test("vendored Ouro AX files that import each other as #ouro-ax/ bring what they import, and the package's imports entry points at the vendored folder", async () => {
  const lockFor = (dir) => `${JSON.stringify({ schemaVersion: 1, sources: [{ id: "ax", repository: "ourostack/ouro-ui", commit: "old", files: [
    { sourcePath: "registry/ouro/ax/ax-claims.ts", generatedPath: `${dir}ax-claims.ts`, sha256: "a" },
    { sourcePath: "registry/ouro/ax/xray.ts", generatedPath: `${dir}xray.ts`, sha256: "b" },
  ] }] }, null, 2)}\n`;
  const KIT = 'import { claims } from "#ouro-ax/ax-claims.ts";\nimport { extra } from "#ouro-ax/extra.ts";\nexport const run = [claims, extra];\n';
  const tarball = new Map(Object.entries({
    "registry/ouro/ax/ax-claims.ts": "export const claims = 1;\n",
    "registry/ouro/ax/extra.ts": "export const extra = 1;\n",
    "registry/ouro/ax/xray.ts": 'import { run } from "./xray.kit.mts";\n',
    "registry/ouro/ax/xray.kit.mts": KIT,
  }).map(([k, v]) => [k, Buffer.from(v)]));
  const pin = { kind: "vendor-lock", file: "upstream-sources.lock.json", follows: "web", source: "ax" };
  const run = async (dir, packageJson) => {
    const consumer = new Map([["package.json", Buffer.from(packageJson)]]);
    return UPDATERS["vendor-lock"](pin, lockFor(dir), RELEASES.web, { tarball: async () => tarball, consumerFile: async (path) => consumer.get(path) ?? null });
  };
  const agree = (update, dir) => {
    const lock = JSON.parse(update.files[pin.file]);
    const folders = new Set(lock.sources[0].files.map((file) => `${dirname(file.generatedPath)}/`));
    const target = JSON.parse(update.files["package.json"]).imports["#ouro-ax/*"];
    assert.deepEqual([...folders], [dir]);
    assert.equal(target, `./${dir}*`, "the import resolves to the folder the lock vendors Ouro AX in");
  };

  // As housesitter and friends vendor it, and as apple-distribution-kit does under src/.
  for (const dir of ["lib/ouro-ui/registry/ouro/ax/", "src/ouro-ax/"]) {
    const update = await run(dir, '{\n  "name": "tool",\n  "type": "module"\n}\n');
    assert.equal(update.files[`${dir}xray.kit.mts`]?.toString(), KIT);
    assert.equal(update.files[`${dir}extra.ts`]?.toString(), "export const extra = 1;\n", "a file the kit imports as #ouro-ax/ is vendored beside it");
    agree(update, dir);
    assert.ok(update.notes.some((note) => note.includes("`#ouro-ax/*`") && note.includes(`\`${dir}\``)));
    assert.deepEqual(update.notes.flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
  }

  // An entry that already points elsewhere is named, not changed.
  const other = await run("src/ouro-ax/", '{ "imports": { "#ouro-ax/*": "./lib/ax/*" } }\n');
  assert.equal(other.files["package.json"], undefined);
  assert.ok(other.notes.some((note) => note.includes("point it at `./src/ouro-ax/*`")));
  assert.deepEqual(other.notes.flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
});

test("a vendored source changes only its own values in the lock, every other byte kept as the repository lays it out", async () => {
  // One file to a line, and a source Ouro Current does not follow, as a repository's own lock check may expect.
  const text = [
    "{",
    '  "schemaVersion": 1,',
    '  "sources": [',
    "    {",
    '      "id": "other",',
    '      "repository": "someone/else",',
    '      "commit": "1111111",',
    '      "files": [',
    '        {"sourcePath": "LICENSE", "generatedPath": "plugins/other/LICENSE", "sha256": "aaa"}',
    "      ]",
    "    },",
    "    {",
    '      "id": "ax",',
    '      "repository": "ourostack/ouro-ui",',
    '      "commit": "old",',
    '      "files": [',
    '        {"sourcePath": "registry/ouro/ax/cli.ts", "generatedPath": "lib/ax/cli.ts", "sha256": "x", "upstreamPath": "lib/ax/upstream/cli.ts"},',
    '        {"sourcePath": "LICENSE", "generatedPath": "lib/ax/LICENSE", "sha256": "aaa"}',
    "      ]",
    "    }",
    "  ]",
    "}",
    "",
  ].join("\n");
  const ctx = { tarball: async () => new Map([["registry/ouro/ax/cli.ts", Buffer.from("cli v2")], ["LICENSE", Buffer.from("MIT 2")]]) };
  const update = await UPDATERS["vendor-lock"]({ kind: "vendor-lock", file: "upstream-sources.lock.json", follows: "web", source: "ax" }, text, RELEASES.web, ctx);
  const expected = text
    .replace('"commit": "old"', `"commit": "${RELEASES.web.sha}"`)
    .replace('"sha256": "x"', `"sha256": "${sha256("cli v2")}"`)
    .replace('"generatedPath": "lib/ax/LICENSE", "sha256": "aaa"', `"generatedPath": "lib/ax/LICENSE", "sha256": "${sha256("MIT 2")}"`);
  assert.equal(update.files["upstream-sources.lock.json"], expected, "the other source's LICENSE hash, equal to this one's old hash, is left alone");
});

test("a vendored core file comes from the new release's asset", async () => {
  const pin = { tag: "v0.13.1", release: "https://github.com/ourostack/ouro-ui-core/releases/tag/v0.13.1", asset: "ouro-ui-core-v0.13.1-dist.zip", path: "web/themes/cookbook.css", sha256: "x" };
  const asked = [];
  const ctx = { assetFile: async (...args) => (asked.push(args), Buffer.from("css v2")) };
  const update = await UPDATERS["core-pin"]({ kind: "core-pin", file: "vendor/ouro-ui-core/pin.json", follows: "core" }, JSON.stringify(pin), RELEASES.core, ctx);
  assert.deepEqual(asked[0], ["core", "v0.15.0", "ouro-ui-core-v0.15.0-dist.zip", "web/themes/cookbook.css"]);
  assert.equal(update.files["vendor/ouro-ui-core/cookbook.css"].toString(), "css v2");
  assert.deepEqual(JSON.parse(update.files["vendor/ouro-ui-core/pin.json"]), { ...pin, tag: "v0.15.0", release: "https://github.com/ourostack/ouro-ui-core/releases/tag/v0.15.0", asset: "ouro-ui-core-v0.15.0-dist.zip", sha256: sha256("css v2") });
});

/** A ctx whose core dist asset holds `files` (dist-relative paths, as the zip has them), recording what was asked. */
const distAsset = (files, asked = []) => ({
  assetFiles: async (follows, tag, asset, paths) => {
    asked.push([follows, tag, asset, ...paths]);
    return new Map(paths.filter((path) => path in files).map((path) => [path, Buffer.from(files[path])]));
  },
  tarball: async () => {
    throw new Error("core commits no dist/: its files come from the release's dist asset");
  },
});

test("a vendored source that follows core reads its dist files from the release's dist asset, and moves its release", async () => {
  const lock = { schemaVersion: 1, sources: [{ id: "core-actions", repository: "ourostack/ouro-ui-core", commit: "old", release: "v0.13.0", license: "MIT", files: [
    { sourcePath: "dist/actions/ouro-actions.mts", generatedPath: "tools/ouro-actions/ouro-actions.mts", sha256: "x" },
    { sourcePath: "dist-manifest.json", generatedPath: "tools/ouro-actions/dist-manifest.json", sha256: "y" },
  ] }] };
  const asked = [];
  const ctx = distAsset({ "actions/ouro-actions.mts": "gen v2", "dist-manifest.json": "manifest v2" }, asked);
  const update = await UPDATERS["vendor-lock"]({ kind: "vendor-lock", file: "upstream-sources.lock.json", follows: "core", source: "core-actions" }, JSON.stringify(lock, null, 2), RELEASES.core, ctx);
  assert.deepEqual(asked[0].slice(0, 3), ["core", "v0.15.0", "ouro-ui-core-v0.15.0-dist.zip"]);
  assert.equal(update.files["tools/ouro-actions/ouro-actions.mts"].toString(), "gen v2");
  assert.equal(update.files["tools/ouro-actions/dist-manifest.json"].toString(), "manifest v2");
  const written = JSON.parse(update.files["upstream-sources.lock.json"]);
  assert.equal(written.sources[0].commit, RELEASES.core.sha);
  assert.equal(written.sources[0].release, "v0.15.0");
  assert.deepEqual(written.sources[0].files.map((file) => file.sha256), [sha256("gen v2"), sha256("manifest v2")]);
  await assert.rejects(UPDATERS["vendor-lock"]({ kind: "vendor-lock", file: "upstream-sources.lock.json", follows: "core", source: "core-actions" }, JSON.stringify(lock), RELEASES.core, distAsset({})), /not in ourostack\/ouro-ui-core v0\.15\.0 \(ouro-ui-core-v0\.15\.0-dist\.zip\)/);
});

test("a source that names its release as `tag` moves it with its commit, every other byte as it was", async () => {
  // ouro-work-substrate's lock: the source names its release as `tag`, and it follows Ouro UI.
  const text = `${JSON.stringify({ schemaVersion: 1, sources: [{ id: "ax", repository: "ourostack/ouro-ui", tag: "v1.3.100", commit: "old", license: "MIT", files: [{ sourcePath: "registry/ouro/ax/cli.ts", generatedPath: "lib/ax/cli.ts", sha256: "x" }] }] }, null, 2)}\n`;
  const ctx = { tarball: async () => new Map([["registry/ouro/ax/cli.ts", Buffer.from("cli v2")]]) };
  const update = await UPDATERS["vendor-lock"]({ kind: "vendor-lock", file: "upstream-sources.lock.json", follows: "web", source: "ax" }, text, RELEASES.web, ctx);
  const expected = text.replace('"tag": "v1.3.100"', `"tag": "${RELEASES.web.tag}"`).replace('"commit": "old"', `"commit": "${RELEASES.web.sha}"`).replace('"sha256": "x"', `"sha256": "${sha256("cli v2")}"`);
  assert.equal(update.files["upstream-sources.lock.json"], expected);
});

test("a core manifest copied beside its files moves with them, or, when one was edited here or is no longer shipped, none of them moves", async () => {
  const oldManifest = { coreTag: "v0.13.0", files: { "dist/actions/ouro-actions.mts": sha256("gen v1"), "dist/ax/actions.claims.json": sha256("claims v1"), "dist/web/ouro-base.css": sha256("base v1") } };
  const newManifest = `${JSON.stringify({ coreTag: "v0.15.0", files: { "dist/actions/ouro-actions.mts": sha256("gen v2"), "dist/ax/actions.claims.json": sha256("claims v1"), "dist/web/ouro-base.css": sha256("base v2") } }, null, 2)}\n`;
  const folder = (claims) => async (dir) => {
    assert.equal(dir, "tools/ouro-actions");
    return new Map(Object.entries({
      "tools/ouro-actions/dist-manifest.json": JSON.stringify(oldManifest),
      "tools/ouro-actions/ouro-actions.mts": "gen v1",
      "tools/ouro-actions/actions.claims.json": claims,
      "tools/ouro-actions/README.md": "ours",
    }).map(([path, text]) => [path, Buffer.from(text)]));
  };
  const asset = distAsset({ "dist-manifest.json": newManifest, "actions/ouro-actions.mts": "gen v2", "ax/actions.claims.json": "claims v1", "web/ouro-base.css": "base v2" });
  const pin = { kind: "core-manifest", file: "tools/ouro-actions/dist-manifest.json", follows: "core", current: "v0.13.0" };

  // As housesitter and m365crawl vendor the generator: it moves with the manifest; an unchanged file and one the
  // manifest does not list stay as they are.
  const update = await UPDATERS["core-manifest"](pin, JSON.stringify(oldManifest), RELEASES.core, { ...asset, consumerFolder: folder("claims v1") });
  assert.deepEqual(Object.keys(update.files).sort(), ["tools/ouro-actions/dist-manifest.json", "tools/ouro-actions/ouro-actions.mts"]);
  assert.equal(update.files["tools/ouro-actions/ouro-actions.mts"].toString(), "gen v2");
  assert.equal(update.files["tools/ouro-actions/dist-manifest.json"].toString(), newManifest, "the release's manifest, byte for byte");

  // One listed file edited here: the manifest stays with it, so the repository's hash check still holds.
  const edited = await UPDATERS["core-manifest"](pin, JSON.stringify(oldManifest), RELEASES.core, { ...asset, consumerFolder: folder("claims edited here") });
  assert.deepEqual(edited.files, {});
  assert.ok(edited.notes.some((note) => note.includes("`tools/ouro-actions/actions.claims.json` is not the file `v0.13.0` shipped") && /moves only with its files/.test(note)));

  // A listed file the release no longer ships: none of them moves either.
  const dropped = `${JSON.stringify({ coreTag: "v0.15.0", files: { "dist/actions/ouro-actions.mts": sha256("gen v2") } }, null, 2)}\n`;
  const gone = await UPDATERS["core-manifest"](pin, JSON.stringify(oldManifest), RELEASES.core, { ...distAsset({ "dist-manifest.json": dropped, "actions/ouro-actions.mts": "gen v2" }), consumerFolder: folder("claims v1") });
  assert.deepEqual(gone.files, {});
  assert.ok(gone.notes.some((note) => /no longer ships `tools\/ouro-actions\/actions\.claims\.json`/.test(note)));
  assert.deepEqual([...edited.notes, ...gone.notes].flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);

  const later = await UPDATERS["core-manifest"](pin, JSON.stringify(oldManifest), { ...RELEASES.core, tag: "v0.17.6" }, { ...asset, consumerFolder: folder("claims v1") });
  assert.ok(![...update.notes, ...later.notes].some((note) => /version stamp|nothing generated again/.test(note)), "no update is said to need nothing generated again (ouro-ui-core#123)");
});

// An app whose projections Ouro UI core v1.1.0's generator wrote (fixtures/actions-v1.1.0), stamped 1.1.0, and which the
// generator Ouro UI vendors (scripts/ouro-actions, core v1.2.0 or later) writes differently: the update that moves the
// generator generates them again, or the app's projections check fails on the update (ouro-ui-core#123).
const OLD_ACTIONS = join(import.meta.dirname, "fixtures", "actions-v1.1.0", "actions");
const NEW_GENERATOR = readFileSync(join(import.meta.dirname, "..", "ouro-actions", "ouro-actions.mts"), "utf8");
const oldActionsApp = (extra = {}) => {
  const files = { "tools/ouro-actions/ouro-actions.mts": "gen v1", "actions/notes.actions.mts": readFileSync(join(OLD_ACTIONS, "notes.actions.mts"), "utf8"), ...extra };
  for (const name of ["actions.json", "commands.json", "mcp.json", "OuroActions.swift", "OuroActionsReins.swift", "web.ts", "webmcp.json"]) files[`actions/generated/${name}`] = readFileSync(join(OLD_ACTIONS, "generated", name), "utf8");
  files["tools/ouro-actions/dist-manifest.json"] = JSON.stringify({ coreTag: "v1.1.0", files: { "dist/actions/ouro-actions.mts": sha256("gen v1") } });
  return files;
};
const newCore = () => distAsset({ "dist-manifest.json": JSON.stringify({ coreTag: "v0.15.0", files: { "dist/actions/ouro-actions.mts": sha256(NEW_GENERATOR) } }), "actions/ouro-actions.mts": NEW_GENERATOR });

test("an update that vendors a new action generator generates the projections again, as the repository runs generate, and commits what changed", async () => {
  const scripts = { scripts: { "actions:generate": "node tools/ouro-actions/ouro-actions.mts generate actions/notes.actions.mts actions/generated", "actions:check": "node tools/ouro-actions/ouro-actions.mts check actions/notes.actions.mts actions/generated" } };
  const repo = fakeRepo(oldActionsApp({ "package.json": JSON.stringify(scripts, null, 2) }));
  const kept = await keepRepo(repo.gh, "o/r", RELEASES, newCore());
  assert.equal(kept.state, "pr");
  assert.equal(repo.fileAt(BRANCH, "tools/ouro-actions/ouro-actions.mts"), NEW_GENERATOR);
  const mcp = repo.fileAt(BRANCH, "actions/generated/mcp.json");
  assert.match(mcp, /"title": "Delete a note"/, "what the new generator writes, not what v1.1.0 wrote");
  assert.match(repo.fileAt(BRANCH, "actions/generated/webmcp.json"), /"title": "List the notes"/);
  assert.doesNotMatch(mcp, /ouro-actions 1\.1\.0/);
  // The branch passes the projections check the repository runs, with the vendored generator.
  const dir = scratchDir("current-actions-");
  for (const [path, bytes] of repo.filesAt(BRANCH)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), bytes);
  }
  const check = spawnSync(process.execPath, ["tools/ouro-actions/ouro-actions.mts", "check", "actions/notes.actions.mts", "actions/generated"], { cwd: dir, encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
  const body = repo.pulls[0].body;
  assert.match(body, /Runs `generate` with the new `tools\/ouro-actions\/ouro-actions\.mts` on `actions\/notes\.actions\.mts`, as `package\.json` does, and commits what it changed: [^\n]*`actions\/generated\/mcp\.json`/);
  assert.doesNotMatch(body, /nothing generated again|version stamp/);
  assert.deepEqual(lintMarkdown(body, { file: "pull request body" }), []);
});

// As ouro-md runs its generator: a shell wrapper names the generator, the declarations and the folder in variables,
// and its workflow calls the wrapper, never the generator itself (ouro-md#215).
const WRAPPER = `#!/usr/bin/env bash
#   scripts/ouro-actions.sh generate          write every door from the declaration
#   scripts/ouro-actions.sh check             nothing generated has drifted
set -euo pipefail
ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
DIR=tools/ouro-actions
GEN="$DIR/ouro-actions.mts"
DECLARATIONS=actions/notes.actions.mts
OUT='actions/generated'

case "\${1:-}" in
  generate)
    node "$GEN" generate "$DECLARATIONS" "$OUT"
    ;;
  check)
    node "$GEN" check "$DECLARATIONS" "$OUT"
    ;;
  report)
    node "$GEN" check "$DECLARATIONS" "$OUT" --report "\${2:-xray/actions/report.json}"
    ;;
esac
`;

test("an update that vendors a new action generator follows a shell script that runs it, as ouro-md's wrapper does", async () => {
  const workflow = "jobs:\n  bundle:\n    steps:\n      - run: scripts/ouro-actions.sh check\n";
  const repo = fakeRepo(oldActionsApp({ "scripts/ouro-actions.sh": WRAPPER, ".github/workflows/app-bundle.yml": workflow }));
  await keepRepo(repo.gh, "o/r", RELEASES, newCore());
  assert.match(repo.fileAt(BRANCH, "actions/generated/mcp.json"), /"title": "Delete a note"/);
  assert.match(repo.fileAt(BRANCH, "actions/generated/webmcp.json"), /"title": "List the notes"/);
  assert.equal(repo.fileAt(BRANCH, "scripts/ouro-actions.sh"), WRAPPER, "the wrapper is read, never written");
  const body = repo.pulls[0].body;
  assert.match(body, /Runs `generate` with the new `tools\/ouro-actions\/ouro-actions\.mts` on `actions\/notes\.actions\.mts`, as `scripts\/ouro-actions\.sh` does, and commits what it changed: [^\n]*`actions\/generated\/mcp\.json`/);
  assert.doesNotMatch(body, /could not find a step/);
  assert.deepEqual(lintMarkdown(body, { file: "pull request body" }), []);
});

test("an update that vendors a new action generator finds generate in a workflow, and says so when it finds no generate step", async () => {
  // As m365crawl runs it: the check in its X-ray workflow, a command split over two lines, no package.json.
  const workflow = "jobs:\n  x:\n    steps:\n      - run: |\n          node tools/ouro-actions/ouro-actions.mts check actions/notes.actions.mts actions/generated \\\n            --report xray-actions/report.json --app notes\n";
  const fromWorkflow = fakeRepo(oldActionsApp({ ".github/workflows/ax-xray.yml": workflow }));
  await keepRepo(fromWorkflow.gh, "o/r", RELEASES, newCore());
  assert.match(fromWorkflow.fileAt(BRANCH, "actions/generated/mcp.json"), /"title": "Delete a note"/);
  assert.match(fromWorkflow.pulls[0].body, /as `\.github\/workflows\/ax-xray\.yml` does/);
  assert.equal(fromWorkflow.fileAt(BRANCH, ".github/workflows/ax-xray.yml"), workflow, "a workflow is read, never written");

  const none = fakeRepo(oldActionsApp());
  const kept = await keepRepo(none.gh, "o/r", RELEASES, newCore());
  assert.equal(kept.state, "pr");
  assert.equal(none.fileAt(BRANCH, "actions/generated/mcp.json"), none.fileAt("main", "actions/generated/mcp.json"));
  const body = none.pulls[0].body;
  assert.match(body, /Leaves the projections as they were: [^\n]*could not find a step that runs `tools\/ouro-actions\/ouro-actions\.mts`/);
  assert.match(body, /node tools\/ouro-actions\/ouro-actions\.mts generate <declarations> <folder>/);
  assert.deepEqual(lintMarkdown(body, { file: "pull request body" }), []);

  // A generate step that fails is said, with its first error line, and the projections stay as they were.
  const broken = fakeRepo(oldActionsApp({ "package.json": JSON.stringify({ scripts: { gen: "node tools/ouro-actions/ouro-actions.mts generate actions/gone.actions.mts actions/generated" } }) }));
  await keepRepo(broken.gh, "o/r", RELEASES, newCore());
  assert.equal(broken.fileAt(BRANCH, "actions/generated/mcp.json"), broken.fileAt("main", "actions/generated/mcp.json"));
  assert.match(broken.pulls[0].body, /Running `generate` with the new `tools\/ouro-actions\/ouro-actions\.mts` on `actions\/gone\.actions\.mts`, as `package\.json` does, failed: 'actions\/gone\.actions\.mts' is not in the repository\./);
});

test("a repository whose whole update is held back gets no pull request, and the reason", async () => {
  const oldManifest = { coreTag: "v0.13.0", files: { "dist/actions/ouro-actions.mts": sha256("gen v1") } };
  const newManifest = JSON.stringify({ coreTag: "v0.15.0", files: { "dist/actions/ouro-actions.mts": sha256("gen v2") } });
  const repo = fakeRepo({ "tools/ouro-actions/dist-manifest.json": JSON.stringify(oldManifest), "tools/ouro-actions/ouro-actions.mts": "gen edited here" });
  const kept = await keepRepo(repo.gh, "o/r", RELEASES, distAsset({ "dist-manifest.json": newManifest, "actions/ouro-actions.mts": "gen v2" }));
  assert.equal(kept.state, "skipped");
  assert.equal(kept.pr, null);
  assert.match(kept.reason, /`tools\/ouro-actions\/ouro-actions\.mts` is not the file `v0\.13\.0` shipped/);
  assert.equal(repo.pulls.length, 0);
  assert.equal(repo.calls.filter((call) => call.startsWith("POST repos/o/r/git/")).length, 0, "nothing is written");
});

test("a core manifest a lock vendors is the lock's, a repository never follows itself, and its rules can leave a pin alone", async () => {
  const manifest = JSON.stringify({ coreTag: "v0.13.0", files: {} });
  const lock = JSON.stringify({ sources: [{ id: "core", repository: "ourostack/ouro-ui-core", commit: "old", files: [{ sourcePath: "dist-manifest.json", generatedPath: "tools/ouro-actions/dist-manifest.json", sha256: "x" }] }] });
  const locked = fakeRepo({ "upstream-sources.lock.json": lock, "tools/ouro-actions/dist-manifest.json": manifest });
  const sources = distAsset({ "dist-manifest.json": manifest });
  const fromLock = await keepRepo(locked.gh, "o/r", RELEASES, sources, { dryRun: true });
  assert.deepEqual(fromLock.pins.map((pin) => pin.kind), ["vendor-lock"]);

  const self = fakeRepo({ "scripts/ouro-actions/dist-manifest.json": manifest, "scripts/agent-benchmark/vendor/ouro-actions/dist-manifest.json": manifest, ".github/workflows/site.yml": "env:\n  OURO_UI_TAG: v1.3.99\n", ".github/ouro-current.json": JSON.stringify({ ignore: ["scripts/agent-benchmark/vendor/"] }) }, { name: "ourostack/ouro-ui" });
  const own = await keepRepo(self.gh, "ourostack/ouro-ui", RELEASES, sources, { dryRun: true });
  assert.deepEqual(own.pins.map((pin) => pin.file), ["scripts/ouro-actions/dist-manifest.json"]);
  assert.deepEqual(own.plan.files, ["scripts/ouro-actions/dist-manifest.json"]);
});

test("a dry run reports a repository that fails and goes on to the next, then exits nonzero", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT });
  const ok = (data) => ({ status: 200, headers: new Map(), text: async () => JSON.stringify(data) });
  const fetch = async (url, init) => {
    const path = url.replace("https://api.github.com/", "");
    if (path.endsWith("releases/latest") && !path.startsWith("repos/o/")) return ok({ tag_name: "v9.9.9", html_url: "https://example.test/r" });
    if (/^repos\/ourostack\/[^/]+\/commits\//.test(path)) return ok({ sha: "a".repeat(40) });
    if (path === "repos/o/broken") return { status: 422, headers: new Map(), text: async () => "upstream-sources.lock.json: not in the release" };
    return repo.fetch(url, init);
  };
  const lines = [];
  const dir = scratchDir("current-dry-run-");
  const code = await main(["--dry-run", "--only", "o/broken,o/r", "--out", join(dir, "current.json")], {}, { makeGitHub: (options) => createGitHub({ ...options, fetch, sleep: async () => {} }), log: (line) => lines.push(line) });
  assert.equal(code, 1);
  const out = JSON.parse(readFileSync(join(dir, "current.json"), "utf8"));
  assert.deepEqual(out.repos.map((item) => [item.repo, item.state]), [["o/broken", "failed"], ["o/r", "would-update"]]);
  assert.match(out.repos[0].error, /not in the release/);
  assert.match(lines[0], /"state": "failed"/);
});

test("NuGet and Gradle pins of Ouro UI for Windows and Android move to the release in every form they are written, and nothing else moves", async () => {
  const run = async (kind, file, text, follows) => {
    let out = text;
    for (const pin of findPins(file, text)) out = (await UPDATERS[kind](pin, out, RELEASES[follows], {})).files[file];
    return out;
  };
  const csproj = [
    '<PackageReference Include="Ouro.UI.Windows" Version="0.11.0" />',
    '<PackageReference Version="0.11.0" Include="Ouro.Actions" />',
    '<PackageReference Include="Microsoft.WindowsAppSDK" Version="0.11.0" />',
    '<PackageReference Include="Ouro.UI.Windows.Gallery">\n  <Version>0.10.0</Version>\n</PackageReference>',
    '<PackageReference Update="Ouro.UI.Windows" VersionOverride="0.9.0" />',
    '<PackageReference Include="Ouro.UI.Windows" Version="[0.11.0]" />',
  ].join("\n");
  assert.equal(
    await run("nuget", "App/App.csproj", csproj, "windows"),
    [
      '<PackageReference Include="Ouro.UI.Windows" Version="0.12.0" />',
      '<PackageReference Version="0.12.0" Include="Ouro.Actions" />',
      '<PackageReference Include="Microsoft.WindowsAppSDK" Version="0.11.0" />',
      '<PackageReference Include="Ouro.UI.Windows.Gallery">\n  <Version>0.12.0</Version>\n</PackageReference>',
      '<PackageReference Update="Ouro.UI.Windows" VersionOverride="0.12.0" />',
      '<PackageReference Include="Ouro.UI.Windows" Version="[0.11.0]" />',
    ].join("\n"),
  );
  const kts = 'implementation("bot.ouro.ui:ouro-hx:0.11.0")\nimplementation(group = "bot.ouro.ui", name = "ouro-actions", version = "0.11.0")\nimplementation("androidx.core:core-ktx:0.11.0")';
  assert.equal(await run("gradle", "app/build.gradle.kts", kts, "android"), kts.replace("ouro-hx:0.11.0", "ouro-hx:0.12.0").replace('version = "0.11.0"', 'version = "0.12.0"'));
  const groovy = "implementation 'bot.ouro.ui:ouro-hx:0.11.0'\nimplementation group: 'bot.ouro.ui', name: 'ouro-actions', version: '0.11.0'";
  assert.equal(await run("gradle", "app/build.gradle", groovy, "android"), groovy.replaceAll("0.11.0", "0.12.0"));
  // A catalog's version.ref moves only when every library that refers to it is an Ouro one.
  const toml = [
    "[versions]",
    'ouro = "0.11.0"',
    'shared = "0.11.0"',
    "",
    "[libraries]",
    'ouro-hx = { module = "bot.ouro.ui:ouro-hx", version.ref = "ouro" }',
    'ouro-actions = { group = "bot.ouro.ui", name = "ouro-actions", version = { ref = "ouro" } }',
    'gallery = { module = "bot.ouro.ui:gallery", version.ref = "shared" }',
    'other = { module = "a.b:c", version.ref = "shared" }',
    'pinned = { module = "bot.ouro.ui:ouro-hx", version = "0.10.0" }',
    "",
  ].join("\n");
  assert.equal(await run("gradle", "gradle/libs.versions.toml", toml, "android"), toml.replace('ouro = "0.11.0"', 'ouro = "0.12.0"').replace('version = "0.10.0"', 'version = "0.12.0"'));
  // A version in a variable moves where the file defines it, unless another package reads it too.
  const property = '<PropertyGroup><Hx>0.11.0</Hx><Shared>0.11.0</Shared><Version>0.11.0</Version></PropertyGroup>\n<PackageReference Include="Ouro.UI.Windows" Version="$(Hx)" />\n<PackageReference Include="Ouro.Actions" Version="$(Shared)" />\n<PackageReference Include="Other" Version="$(Shared)" />';
  assert.equal(await run("nuget", "App/App.csproj", property, "windows"), property.replace("<Hx>0.11.0", "<Hx>0.12.0"));
  const buildProps = "<Project><PropertyGroup><OuroUIVersion>0.11.0</OuroUIVersion><Version>0.11.0</Version></PropertyGroup></Project>";
  assert.equal(await run("nuget", "Directory.Build.props", buildProps, "windows"), buildProps.replace("<OuroUIVersion>0.11.0", "<OuroUIVersion>0.12.0"));
  const variable = 'val hx = "0.11.0"\nval shared = "0.11.0"\nimplementation("bot.ouro.ui:ouro-hx:$hx")\nimplementation("bot.ouro.ui:ouro-actions:${shared}")\nimplementation("a.b:c:$shared")';
  assert.equal(await run("gradle", "app/build.gradle.kts", variable, "android"), variable.replace('hx = "0.11.0"', 'hx = "0.12.0"'));
  const ext = "ext {\n  ouroVersion = '0.11.0'\n}\nimplementation \"bot.ouro.ui:ouro-hx:$ouroVersion\"";
  assert.equal(await run("gradle", "build.gradle", ext, "android"), ext.replace("0.11.0", "0.12.0"));
  const properties = "org.gradle.jvmargs=-Xmx2g\nouroUiVersion=0.11.0\nkotlinVersion=0.11.0\n";
  assert.equal(await run("gradle", "gradle.properties", properties, "android"), properties.replace("ouroUiVersion=0.11.0", "ouroUiVersion=0.12.0"));
});

test("a NuGet or Gradle update opens one pull request, and names a lock file holding the old package's hashes instead of writing it", async () => {
  const csproj = '<Project Sdk="Microsoft.NET.Sdk">\n  <ItemGroup>\n    <PackageReference Include="Ouro.UI.Windows" Version="0.11.0" />\n  </ItemGroup>\n</Project>\n';
  const lock = '{ "dependencies": { "net8.0-windows10.0.19041": { "Ouro.UI.Windows": { "type": "Direct", "requested": "[0.11.0, )", "resolved": "0.11.0" } } } }';
  const windows = fakeRepo({ "src/App/App.csproj": csproj, "src/App/packages.lock.json": lock });
  const kept = await keepRepo(windows.gh, "o/r", RELEASES, {});
  assert.equal(kept.state, "pr");
  assert.equal(kept.pr.title, "Update to Ouro UI for Windows v0.12.0");
  assert.equal(windows.fileAt(BRANCH, "src/App/App.csproj"), csproj.replace("0.11.0", "0.12.0"));
  assert.equal(windows.fileAt(BRANCH, "src/App/packages.lock.json"), lock, "a lock file is never written");
  assert.equal(windows.fileAt("main", "src/App/App.csproj"), csproj, "the default branch is never written");
  assert.match(windows.pulls[0].body, /Leaves `src\/App\/packages\.lock\.json` as it is/);
  const central = fakeRepo({ "Directory.Packages.props": '<PackageVersion Include="Ouro.UI.Windows" Version="0.11.0" />\n', "src/App/App.csproj": '<PackageReference Include="Ouro.UI.Windows" />\n', "src/App/packages.lock.json": lock });
  await keepRepo(central.gh, "o/r", RELEASES, {});
  assert.match(central.pulls[0].body, /Leaves `src\/App\/packages\.lock\.json` as it is/, "a central version names the lock files of the projects under it");
  assert.deepEqual(lintMarkdown(windows.pulls[0].body, { file: "pull request body" }), []);

  const kts = 'dependencies {\n    implementation("bot.ouro.ui:ouro-hx:0.11.0")\n    implementation("bot.ouro.ui:ouro-actions:0.11.0")\n}\n';
  const android = fakeRepo({ "app/build.gradle.kts": kts, "settings.gradle.kts": 'rootProject.name = "app"\n' });
  const first = await keepRepo(android.gh, "o/r", RELEASES, {});
  assert.equal(first.pr.title, "Update to Ouro UI for Android v0.12.0");
  assert.equal(android.fileAt(BRANCH, "app/build.gradle.kts"), kts.replaceAll("0.11.0", "0.12.0"));
  assert.equal(android.pulls.length, 1);
  const again = await keepRepo(android.gh, "o/r", { ...RELEASES, android: { ...RELEASES.android, tag: "v0.13.0" } }, {});
  assert.equal(again.pr.number, first.pr.number, "a newer release updates the same pull request");
  assert.equal(android.fileAt(BRANCH, "app/build.gradle.kts"), kts.replaceAll("0.11.0", "0.13.0"));
});

test("the title names each release a pull request moves to", () => {
  assert.equal(title([{ follows: "apple" }], RELEASES), "Update to Ouro UI for Apple v0.9.0");
  assert.equal(title([{ follows: "web" }, { follows: "core" }, { follows: "web" }], RELEASES), "Update to Ouro UI core v0.15.0 and Ouro UI v1.3.187");
});


const SWIFT = '.package(url: "https://github.com/ourostack/ouro-ui-apple.git", exact: "0.6.0")';

test("one pull request per repository: opened once, left alone when nothing changed, and updated in place", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT, "README.md": "hi" });
  const first = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(first.state, "pr");
  assert.equal(first.pr.title, "Update to Ouro UI for Apple v0.9.0");
  assert.equal(first.pr.autoMerge, true);
  assert.equal(repo.fileAt(BRANCH, "Package.swift"), SWIFT.replace("0.6.0", "0.9.0"));
  assert.equal(repo.fileAt("main", "Package.swift"), SWIFT, "the default branch is never written");
  const pushes = repo.calls.filter((call) => call.startsWith("POST repos/o/r/git/commits")).length;

  const again = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(again.pr.number, first.pr.number);
  assert.equal(again.pr.pushed, false, "the same update is not pushed twice");
  assert.equal(repo.calls.filter((call) => call.startsWith("POST repos/o/r/git/commits")).length, pushes);
  assert.equal(repo.pulls.length, 1);

  const newer = { ...RELEASES, apple: { ...RELEASES.apple, tag: "v0.10.0", sha: "f".repeat(40) } };
  const updated = await keepRepo(repo.gh, "o/r", newer, {});
  assert.equal(updated.pr.number, first.pr.number, "a newer release updates the same pull request");
  assert.equal(repo.pulls.length, 1);
  assert.equal(repo.pulls[0].title, "Update to Ouro UI for Apple v0.10.0");
  assert.equal(repo.fileAt(BRANCH, "Package.swift"), SWIFT.replace("0.6.0", "0.10.0"));
});

test("a repository's own rules ride along: its version moves past its latest release, and its changelog fragment is added", async () => {
  const rules = {
    version: [
      { path: "Sources/App/Release.swift", pattern: 'static let version = "([0-9]+\\.[0-9]+\\.[0-9]+)"' },
      { path: "README.md", pattern: "^> \\*\\*Status:\\*\\* v([0-9]+\\.[0-9]+\\.[0-9]+)" },
    ],
    changelog: { path: "changes/ouro-ui-{version}.md", text: "---\ntestflight: Uses {releases}.\n---\n" },
  };
  const swift = 'enum Release {\n  static let version = "0.9.118"\n}\n';
  const readme = "# App\n\n> **Status:** v0.9.118. Reads Markdown.\n";
  const repo = fakeRepo({ "Package.swift": SWIFT, ".github/ouro-current.json": JSON.stringify(rules), "Sources/App/Release.swift": swift, "README.md": readme }, { latestRelease: "v0.9.118" });
  const result = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(result.state, "pr");
  assert.equal(repo.fileAt(BRANCH, "Sources/App/Release.swift"), swift.replace("0.9.118", "0.9.119"));
  assert.equal(repo.fileAt(BRANCH, "README.md"), readme.replace("0.9.118", "0.9.119"));
  assert.equal(repo.fileAt(BRANCH, "changes/ouro-ui-0.9.0.md"), "---\ntestflight: Uses Ouro UI for Apple v0.9.0.\n---\n");
  assert.match(repo.pulls[0].body, /moves to `0\.9\.119`, after its latest release `v0\.9\.118`/);

  // A version already past the latest release (a bump waiting to ship) is left as it is.
  const ahead = fakeRepo({ "Package.swift": SWIFT, ".github/ouro-current.json": JSON.stringify({ version: rules.version }), "Sources/App/Release.swift": swift, "README.md": readme }, { latestRelease: "v0.9.117" });
  await keepRepo(ahead.gh, "o/r", RELEASES, {});
  assert.equal(ahead.fileAt(BRANCH, "Sources/App/Release.swift"), swift);
  // A repository without the file gets the pins alone.
  const plain = fakeRepo({ "Package.swift": SWIFT, "README.md": readme }, { latestRelease: "v0.9.118" });
  await keepRepo(plain.gh, "o/r", RELEASES, {});
  assert.equal(plain.fileAt(BRANCH, "README.md"), readme);
});

test("a pull request someone else pushed to is left to them, never force-pushed over", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT, "test.mjs": "assert(tag === '0.6.0')" });
  const first = await keepRepo(repo.gh, "o/r", RELEASES, {});
  const ours = repo.refs.get(BRANCH);
  // A fix the pull request's checks needed, pushed on top of Ouro Current's commit.
  const tree = await repo.gh.post("repos/o/r/git/trees", { base_tree: repo.commitTree(ours), tree: [{ path: "test.mjs", mode: "100644", type: "blob", sha: (await repo.gh.post("repos/o/r/git/blobs", { content: Buffer.from("assert(tag)").toString("base64"), encoding: "base64" })).sha }] });
  const fix = await repo.gh.post("repos/o/r/git/commits", { message: "Stop pinning the tag in the test", tree: tree.sha, parents: [ours] });
  await repo.gh.patch(`repos/o/r/git/refs/heads/${BRANCH}`, { sha: fix.sha, force: true });

  const newer = { ...RELEASES, apple: { ...RELEASES.apple, tag: "v0.10.0", sha: "f".repeat(40) } };
  const again = await keepRepo(repo.gh, "o/r", newer, {});
  assert.equal(again.pr.number, first.pr.number);
  assert.equal(again.pr.edited, true);
  assert.equal(repo.refs.get(BRANCH), fix.sha, "the branch keeps the hand-pushed fix");
  assert.equal(repo.fileAt(BRANCH, "test.mjs"), "assert(tag)");
});

test("a release held while the last push's checks still run moves the pull request once, after they finish (#3573)", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT });
  const first = await keepRepo(repo.gh, "o/r", RELEASES, {});
  const pushed = repo.refs.get(BRANCH);

  // A release that comes while the open pull request's checks are still running on the last one is held: pushing
  // over them would restart those checks, so a repository whose checks are slower than the release cadence would
  // never get a run that finishes.
  const newer = { ...RELEASES, apple: { ...RELEASES.apple, tag: "v0.10.0", sha: "f".repeat(40) } };
  const held = await keepRepo(repo.gh, "o/r", newer, { ciPending: async () => true });
  assert.equal(held.pr.number, first.pr.number);
  assert.equal(held.pr.pushed, false);
  assert.equal(held.pr.held, true);
  assert.match(held.pr.note, /checks running/);
  assert.equal(repo.refs.get(BRANCH), pushed, "the branch keeps the last push while its checks run");

  // Once nothing on that push is still queued or in progress, the next run moves the pull request straight to
  // whatever is newest by then, in one push.
  const moved = await keepRepo(repo.gh, "o/r", newer, { ciPending: async () => false });
  assert.equal(moved.pr.number, first.pr.number);
  assert.equal(moved.pr.pushed, true);
  assert.notEqual(repo.refs.get(BRANCH), pushed, "the held release is pushed once its checks finished");
  assert.match(moved.pr.title, /v0\.10\.0/);
});

test("an update pull request in a merge queue is left as it is, not failed, and updated once it leaves the queue (#1809)", async () => {
  let inQueue = false;
  const repo = fakeRepo({ "Package.swift": SWIFT }, { queued: () => inQueue });
  const first = await keepRepo(repo.gh, "o/r", RELEASES, {});
  const queuedAt = repo.refs.get(BRANCH);
  inQueue = true;
  const newer = { ...RELEASES, apple: { ...RELEASES.apple, tag: "v0.10.0", sha: "f".repeat(40) } };
  const held = await keepRepo(repo.gh, "o/r", newer, {});
  assert.equal(held.state, "pr");
  assert.equal(held.pr.number, first.pr.number);
  assert.equal(held.pr.pushed, false);
  assert.match(held.pr.note, /merge queue/);
  assert.equal(repo.refs.get(BRANCH), queuedAt, "the queued branch is not written");
  assert.equal(repo.pulls[0].title, first.pr.title, "nor is its pull request retitled for an update it does not hold");
  // Out of the queue (say it left without merging), the next run updates it.
  inQueue = false;
  const after = await keepRepo(repo.gh, "o/r", newer, {});
  assert.equal(after.pr.pushed, true);
  assert.equal(repo.fileAt(BRANCH, "Package.swift"), SWIFT.replace("0.6.0", "0.10.0"));
});

test("a push to an update pull request with auto-merge on turns it off first and on again after, so a merge queue cannot take the pull request before its checks start", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT });
  await keepRepo(repo.gh, "o/r", RELEASES, {});
  const before = repo.refs.get(BRANCH);
  assert.ok(repo.pulls[0].auto_merge, "the first run turns auto-merge on");
  const newer = { ...RELEASES, apple: { ...RELEASES.apple, tag: "v0.10.0", sha: "f".repeat(40) } };
  const start = repo.calls.length;
  const again = await keepRepo(repo.gh, "o/r", newer, {});
  assert.equal(again.pr.autoMerge, true);
  const after = repo.refs.get(BRANCH);
  const steps = repo.calls.slice(start).filter((call) => /^(disarm|arm) |^PATCH repos\/o\/r\/git\/refs/.test(call));
  assert.deepEqual(steps, [`disarm 1 at ${before}`, `PATCH repos/o/r/git/refs/heads/${BRANCH}`, `arm 1 at ${after}`]);
  // Nothing to push: auto-merge is left as it is.
  const quiet = repo.calls.length;
  await keepRepo(repo.gh, "o/r", newer, {});
  assert.deepEqual(repo.calls.slice(quiet).filter((call) => call.startsWith("disarm")), []);
});

test("a run that overlaps the update pull request's merge writes nothing: no branch on the old main, no title on the merged pull request (#1840)", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT });
  const first = await keepRepo(repo.gh, "o/r", RELEASES, {});
  const title = repo.pulls[0].title;
  // The pull request merges after the run has read main and found it open: GitHub deletes its branch.
  const gh = {
    ...repo.gh,
    get: async (path, options) => {
      if (path === `repos/o/r/git/ref/heads/${BRANCH}` && repo.pulls[0].state === "open") {
        Object.assign(repo.pulls[0], { state: "closed", merged: true });
        repo.refs.delete(BRANCH);
      }
      return repo.gh.get(path, options);
    },
  };
  const newer = { ...RELEASES, apple: { ...RELEASES.apple, tag: "v0.10.0", sha: "f".repeat(40) } };
  const raced = await keepRepo(gh, "o/r", newer, {});
  assert.equal(raced.state, "skipped");
  assert.equal(raced.pr, null);
  assert.match(raced.reason, new RegExp(`#${first.pr.number} merged while this run read the repository`));
  assert.equal(repo.refs.has(BRANCH), false, "the branch is not made again on the old main");
  assert.equal(repo.pulls[0].title, title, "the merged pull request keeps its title");
  // The next run opens a new pull request from main.
  const next = await keepRepo(repo.gh, "o/r", newer, {});
  assert.equal(next.state, "pr");
  assert.notEqual(next.pr.number, first.pr.number);
});

test("a branch deleted between the read and the write skips the repository for this run, not fails it (#1993)", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT });
  await keepRepo(repo.gh, "o/r", RELEASES, {});
  const gh = { ...repo.gh, patch: async (path, input) => (path.includes("/git/refs/heads/") ? Promise.reject(Object.assign(new Error(`PATCH ${path}: 422 {"message":"Reference does not exist"}`), { status: 422 })) : repo.gh.patch(path, input)) };
  const newer = { ...RELEASES, apple: { ...RELEASES.apple, tag: "v0.10.0", sha: "f".repeat(40) } };
  const gone = await keepRepo(gh, "o/r", newer, {});
  assert.equal(gone.state, "skipped");
  assert.equal(gone.pr, null);
  assert.match(gone.reason, /was deleted while this run wrote it \(its pull request merged or closed\), so the next run starts from the new main\./);
});

test("a branch write that fails for any other reason still fails the repository", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT });
  await keepRepo(repo.gh, "o/r", RELEASES, {});
  const gh = { ...repo.gh, patch: async (path, input) => (path.includes("/git/refs/heads/") ? Promise.reject(Object.assign(new Error(`PATCH ${path}: 422 Reference update failed`), { status: 422 })) : repo.gh.patch(path, input)) };
  const newer = { ...RELEASES, apple: { ...RELEASES.apple, tag: "v0.10.0", sha: "f".repeat(40) } };
  await assert.rejects(keepRepo(gh, "o/r", newer, {}), /Reference update failed/);
});

test("a workflow is left alone and said so, since an app may write .github/workflows/ only with a permission Ouro Current does not ask for", async () => {
  const workflow = "env:\n  OURO_UI_TAG: v1.3.100\n";
  const only = fakeRepo({ ".github/workflows/checks.yml": workflow });
  const skipped = await keepRepo(only.gh, "o/r", RELEASES, {});
  assert.equal(skipped.state, "skipped");
  assert.equal(skipped.pr, null);
  assert.match(skipped.reason, /`\.github\/workflows\/checks\.yml` alone: GitHub lets an app change `\.github\/workflows\/` only with the `workflows` permission/);
  assert.equal(only.calls.filter((call) => call.startsWith("POST repos/o/r/git/")).length, 0, "nothing is written");

  const both = fakeRepo({ ".github/workflows/checks.yml": workflow, "Package.swift": SWIFT });
  const updated = await keepRepo(both.gh, "o/r", RELEASES, {});
  assert.equal(updated.state, "pr");
  assert.equal(updated.pr.title, "Update to Ouro UI for Apple v0.9.0", "the title names only what it moves");
  assert.equal(both.fileAt(BRANCH, "Package.swift"), SWIFT.replace("0.6.0", "0.9.0"));
  assert.equal(both.fileAt(BRANCH, ".github/workflows/checks.yml"), workflow);
  assert.match(both.pulls[0].body, /`\.github\/workflows\/checks\.yml` alone/);
});

test("a repository that caught up on its own has its stale pull request closed", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT });
  await keepRepo(repo.gh, "o/r", RELEASES, {});
  repo.setMain({ "Package.swift": SWIFT.replace("0.6.0", "0.9.0") });
  const result = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(result.state, "current");
  assert.equal(repo.pulls[0].state, "closed");
});

test("auto-merge falls back to a merge method the repository allows", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT }, { mergeMethods: ["MERGE"] });
  const result = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(result.pr.autoMerge, true);
  assert.equal(repo.pulls[0].autoMerge, "MERGE");
});

test("a repository that names a review team gets its update with auto-merge off and that team asked to review (#2296)", async () => {
  const rules = JSON.stringify({ review: { team: "design-system" } });
  const repo = fakeRepo({ "Package.swift": SWIFT, ".github/ouro-current.json": rules });
  const first = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(first.state, "pr");
  assert.equal(first.pr.autoMerge, false);
  assert.equal(first.pr.review, "o/design-system");
  assert.match(first.pr.note, /review requested from o\/design-system/);
  assert.deepEqual(repo.pulls[0].requested_teams, [{ slug: "design-system" }]);
  assert.ok(!repo.calls.some((call) => call.startsWith("arm ")), "auto-merge is never turned on");
  assert.match(repo.pulls[0].body, /Auto-merge is off: this repository asks `o\/design-system` to review the update\./);
  assert.deepEqual(lintMarkdown(repo.pulls[0].body, { file: "pull request body" }), []);

  // Nothing new to push: the team is not asked again.
  const again = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(again.pr.pushed, false);
  assert.equal(repo.calls.filter((call) => call.endsWith("/requested_reviewers")).length, 1);
  assert.match(again.pr.note, /already asked/);

  // A newer release pushes to the same pull request, and asks again.
  await keepRepo(repo.gh, "o/r", { ...RELEASES, apple: { ...RELEASES.apple, tag: "v0.10.0", sha: "f".repeat(40) } }, {});
  assert.equal(repo.calls.filter((call) => call.endsWith("/requested_reviewers")).length, 2);
  assert.equal(repo.pulls.length, 1);
});

test("a repository that adds a review team has its armed update pull request disarmed, and not armed again (#2296)", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT });
  await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.ok(repo.pulls[0].auto_merge, "armed while the repository asks for no review");
  repo.setMain({ ".github/ouro-current.json": JSON.stringify({ review: { team: "o/design-system" } }) });
  const result = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(result.pr.autoMerge, false);
  assert.equal(repo.pulls[0].auto_merge, null);
  assert.equal(repo.calls.filter((call) => call.startsWith("arm ")).length, 1);
  assert.deepEqual(repo.pulls[0].requested_teams, [{ slug: "design-system" }]);
});

test("a review team GitHub will not take is named in the result, the update still opens, and the next run asks again (#2296)", async () => {
  let status = 422;
  const repo = fakeRepo({ "Package.swift": SWIFT, ".github/ouro-current.json": JSON.stringify({ review: { team: "nobody" } }) }, { review: () => status });
  const result = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(result.state, "pr");
  assert.equal(result.pr.autoMerge, false);
  assert.match(result.pr.note, /could not request review from o\/nobody \(422\)/);

  // Nothing to push, nobody waiting and nobody has reviewed: asked again, now that GitHub takes the team.
  status = 201;
  const again = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(again.pr.pushed, false);
  assert.equal(again.pr.note, "review requested from o/nobody");
  assert.deepEqual(repo.pulls[0].requested_teams, [{ slug: "nobody" }]);
});

test("an update pull request whose auto-merge GitHub will not turn off fails the run of a repository that asks for review (#2296)", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT, ".github/ouro-current.json": JSON.stringify({ review: { team: "design-system" } }) }, { disarmFails: true });
  repo.pulls.push({ number: 1, node_id: "PR1", html_url: "https://example.test/pull/1", state: "open", title: "x", body: "x", auto_merge: { merge_method: "squash" } });
  await assert.rejects(keepRepo(repo.gh, "o/r", RELEASES, {}), /would not turn it off, so it could merge without review by o\/design-system/);
});

test("a review setting that is not a team in the repository's own organisation fails the repository with the fix (#2296)", async () => {
  const files = (review) => ({ "Package.swift": SWIFT, ".github/ouro-current.json": JSON.stringify({ review }) });
  await assert.rejects(keepRepo(fakeRepo(files({ team: "other/design-system" })).gh, "o/r", RELEASES, {}), /review team other\/design-system is not in o/);
  await assert.rejects(keepRepo(fakeRepo(files({})).gh, "o/r", RELEASES, {}), /"review" needs a "team", a team slug such as "design-system" or "o\/design-system"/);
  await assert.rejects(keepRepo(fakeRepo(files({ team: "a b" })).gh, "o/r", RELEASES, {}), /"review" needs a "team"/);
});

test("a repository with no pin file gets nothing", async () => {
  const repo = fakeRepo({ "README.md": "hi" });
  const result = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(result.state, "no-pins");
  assert.equal(repo.pulls.length, 0);
});

test("requests are retried on a server error or rate limit, and not on a refusal", async () => {
  assert.equal(retryable(502), true);
  assert.equal(retryable(429), true);
  assert.equal(retryable(403, "API rate limit exceeded"), true);
  assert.equal(retryable(404), false);
  assert.equal(retryable(422), false);
  let calls = 0;
  const flaky = createGitHub({ fetch: async () => (++calls < 3 ? { status: 502, headers: new Map(), text: async () => "Bad Gateway" } : { status: 200, headers: new Map(), text: async () => "{\"ok\":true}" }), sleep: async () => {} });
  assert.deepEqual(await flaky.get("x"), { ok: true });
  assert.equal(calls, 3);
  let refused = 0;
  const strict = createGitHub({ fetch: async () => (refused++, { status: 404, headers: new Map(), text: async () => "Not Found" }), sleep: async () => {} });
  await assert.rejects(strict.get("x"), (error) => error.status === 404);
  assert.equal(refused, 1);
});

test("the app signs in with a JWT its public key verifies", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const token = appJwt(5773987, privateKey, Date.parse("2026-11-15T20:00:00Z"));
  const [head, payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  assert.equal(claims.iss, "5773987");
  assert.ok(claims.exp - claims.iat <= 600, "GitHub refuses a token that lives longer than ten minutes");
  assert.ok(createVerify("RSA-SHA256").update(`${head}.${payload}`).verify(publicKey, Buffer.from(signature, "base64url")));
});

test("every installation runs, a failing repository is reported while the rest go on, and a private one is never named in public", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const ok = (data) => ({ status: 200, headers: new Map(), text: async () => JSON.stringify(data) });
  const fetch = async (url) => {
    const path = url.replace("https://api.github.com/", "");
    if (/releases\/latest$/.test(path)) return ok({ tag_name: "v9.9.9", html_url: "https://example.test/r" });
    if (/\/commits\//.test(path)) return ok({ sha: "a".repeat(40) });
    if (path.startsWith("app/installations?")) return ok([{ id: 1, account: { login: "o" } }]);
    if (path === "app/installations/1/access_tokens") return ok({ token: "inst" });
    if (path.startsWith("installation/repositories")) return ok({ repositories: [{ full_name: "o/broken", private: false }, { full_name: "o/secret", private: true }, { full_name: "o/old", archived: true }, { full_name: "ourostack/ouro-ui" }] });
    if (path === "repos/o/broken") return { status: 500, headers: new Map(), text: async () => "boom" };
    if (path === "repos/o/secret") return ok({ default_branch: "main", private: true, owner: { login: "o" } });
    if (path === "repos/o/secret/git/ref/heads/main") return ok({ object: { sha: "s" } });
    if (path.startsWith("repos/o/secret/git/trees/")) return ok({ sha: "t", tree: [] });
    if (path.startsWith("repos/o/secret/pulls")) return ok([]);
    throw new Error(`no ${path}`);
  };
  const lines = [];
  const report = await keepCurrent({ appId: 1, privateKey, makeGitHub: (options) => createGitHub({ ...options, fetch, sleep: async () => {} }), log: (line) => lines.push(line), now: () => new Date("2026-11-15T20:00:00Z") });
  assert.deepEqual(report.repos.map((repo) => [repo.repo, repo.state]), [["o/broken", "failed"], ["o/secret", "no-pins"]], "archived repositories and Ouro UI itself are skipped");
  assert.match(report.repos[0].error, /500/);
  assert.ok(!lines.join("\n").includes("o/secret"), "the public log never names a private repository");
  const view = publicView({ ...report, repos: [...report.repos, { repo: "o/secret2", private: true, state: "pr", pins: [] }] });
  assert.equal(view.privateRepos, 2);
  assert.ok(!JSON.stringify(view).includes("secret"));
});

test("the pull request's title and body pass Ouro UI's claims check, which a repository may run on pull requests", () => {
  const releases = {
    web: { tag: "v1.3.187", url: "https://github.com/ourostack/ouro-ui/releases/tag/v1.3.187" },
    apple: { tag: "v0.9.0", url: "https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.9.0" },
  };
  const behind = [
    { file: ".github/ouro-hx-installed.json", follows: "web", current: "v1.3.117" },
    { file: "Package.swift", follows: "apple", current: "0.6.0" },
  ];
  const notes = ["Leaves `app/lib/x.ts` at `v1.3.117`, because it is not what the CLI wrote for `v1.3.117` (edited here, or rewritten in a way Ouro Current does not reproduce). Install it again with the CLI, or move the change into Ouro UI.", "Adds what installed items now include: `app/lib/y.ts`.", "Keeps what the registry no longer has: `app/lib/z.ts`."];
  assert.deepEqual(lintPlain(title(behind, releases), { file: "pull request title" }), []);
  assert.deepEqual(lintMarkdown(body(behind, releases, notes), { file: "pull request body" }), []);
});

test("--with-token opens the update with GH_TOKEN, only for the repositories named", async () => {
  await assert.rejects(main(["--with-token"], {}), /--with-token needs --only/);
  await assert.rejects(main(["--with-token", "--only", "org/app", "--dry-run"], { GH_TOKEN: "t" }), /is not --dry-run/);
  await assert.rejects(main(["--with-token", "--only", "org/app"], {}), /--with-token needs GH_TOKEN/);
});

test("auto-merge names the merge commit itself, so GitHub adds no Co-authored-by trailer for the bot", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT });
  const result = await keepRepo(repo.gh, "o/r", RELEASES, {});
  const { headline, body } = repo.pulls[0].mergeCommit;
  assert.equal(headline, `${result.pr.title} (#${result.pr.number})`);
  assert.equal(body, "Ouro Current: Package.swift 0.6.0 to v0.9.0.");
  assert.doesNotMatch(`${headline}\n${body}`, /co-authored-by|\[bot\]/i);
});

test("an Ouro check rule an update brings in has the findings the pull request's checks reported recorded as known, the run after, and kept while the next checks run", async () => {
  const lockOf = (commit, text) => JSON.stringify({ schemaVersion: 1, sources: [{ id: "check", repository: "ourostack/ouro-ui", commit, files: [{ sourcePath: "registry/ouro/check/run.ts", generatedPath: "scripts/ouro/check/run.ts", sha256: sha256(text) }] }] }, null, 2);
  const old = 'const RULES = ["overlap"];\n';
  const repo = fakeRepo({ "upstream-sources.lock.json": lockOf("old", old), "scripts/ouro/check/run.ts": old, "ouro-check.json": '{\n  "waive": {}\n}\n' });
  const tarball = async () => new Map([["registry/ouro/check/run.ts", Buffer.from('const RULES = ["overlap", "off-theme", "off-scale"];\n')]]);
  let reports = [];
  const sources = { tarball, ciReports: async (gh, name, sha) => (sha === repo.refs.get(BRANCH) ? reports : []) };
  await keepRepo(repo.gh, "o/r", RELEASES, sources);
  assert.equal(repo.fileAt(BRANCH, "ouro-check.json"), '{\n  "waive": {}\n}\n', "the run that brings the rule has no report of it yet");
  reports = [
    { findings: [
      { rule: "off-theme", detail: ".hero-sub sets color: var(--ink-soft), a fixed colour; use var(--muted-foreground) (text-muted-foreground)" },
      { rule: "off-scale", detail: ".cta-row sets gap: 0.75rem, a fixed spacing; use calc(var(--spacing) * 3) (gap-3)" },
      { rule: "overlap", detail: "a rule the repository already had" },
    ] },
    { findings: [{ rule: "off-theme", detail: ".hero-sub sets color: var(--ink-soft), a fixed colour; use var(--muted-foreground) (text-muted-foreground)" }] },
  ];
  await keepRepo(repo.gh, "o/r", RELEASES, sources);
  const seeded = repo.fileAt(BRANCH, "ouro-check.json");
  assert.deepEqual(JSON.parse(seeded), { waive: {}, known: { "off-scale": [".cta-row sets gap: 0.75rem, a fixed spacing"], "off-theme": [".hero-sub sets color: var(--ink-soft), a fixed colour"] } });
  assert.match(repo.pulls[0].body, /### New Ouro check rules\n\n- `off-scale`: `1` findings this app already has are recorded in `ouro-check\.json`'s `known`: they pass, and a new one fails\.\n- `off-theme`: `1` findings/, "without new-rules.json, the rules are named from what was recorded");
  // The seeded commit's checks have not reported yet: what the last run recorded stays, and nothing is pushed.
  const head = repo.refs.get(BRANCH);
  reports = [];
  await keepRepo(repo.gh, "o/r", RELEASES, sources);
  assert.equal(repo.refs.get(BRANCH), head);
  assert.equal(repo.fileAt(BRANCH, "ouro-check.json"), seeded);
});

test("a check vendored in a monorepo's package has its findings recorded in that package's ouro-check.json, the one it reads, not the root's", async () => {
  const lockOf = (commit, text) => JSON.stringify({ schemaVersion: 1, sources: [{ id: "check", repository: "ourostack/ouro-ui", commit, files: [{ sourcePath: "registry/ouro/check/run.ts", generatedPath: "packages/app/scripts/ouro/check/run.ts", sha256: sha256(text) }] }] }, null, 2);
  const old = 'const RULES = ["overlap"];\n';
  // Like ourostack/ouroboros: the package runs its check from its own folder, and keeps no ouro-check.json yet.
  const repo = fakeRepo({ "upstream-sources.lock.json": lockOf("old", old), "packages/app/scripts/ouro/check/run.ts": old });
  const tarball = async () => new Map([["registry/ouro/check/run.ts", Buffer.from('const RULES = ["overlap", "fragment-focus"];\n')]]);
  let reports = [];
  const sources = { tarball, ciReports: async (gh, name, sha) => (sha === repo.refs.get(BRANCH) ? reports : []) };
  await keepRepo(repo.gh, "o/r", RELEASES, sources);
  reports = [{ findings: [{ rule: "fragment-focus", detail: "Safari takes focus as stylesheets load, on this page opened at a place on it, without fragmentFocusScript" }] }];
  await keepRepo(repo.gh, "o/r", RELEASES, sources);
  assert.deepEqual(JSON.parse(repo.fileAt(BRANCH, "packages/app/ouro-check.json")).known, { "fragment-focus": ["Safari takes focus as stylesheets load, on this page opened at a place on it, without fragmentFocusScript"] });
  assert.equal(repo.fileAt(BRANCH, "ouro-check.json"), undefined, "the root's is no check's");
  assert.match(repo.pulls[0].body, /`1` findings this app already has are recorded in `packages\/app\/ouro-check\.json`'s `known`/);
});

test("a rule the release declares widened has the findings the pull request's checks reported recorded as known, as a new rule's are, and an existing rule it does not declare has none", async () => {
  const lockOf = (commit, text) => JSON.stringify({ schemaVersion: 1, sources: [{ id: "check", repository: "ourostack/ouro-ui", commit, files: [{ sourcePath: "registry/ouro/check/run.ts", generatedPath: "scripts/ouro/check/run.ts", sha256: sha256(text) }] }] }, null, 2);
  const code = 'const RULES = ["overlap", "off-scale"];\n';
  const rules = (entries) => ["registry/ouro/check/new-rules.json", Buffer.from(JSON.stringify(entries))];
  const scale = { rule: "off-scale", summary: "Spacing off the theme's spacing scale." };
  const findings = [
    { rule: "off-scale", detail: ".lab-line sets margin: -0.25rem, a fixed spacing; use calc(var(--spacing) * -1) (-m-1)" },
    { rule: "overlap", detail: "a rule the release did not widen" },
  ];
  for (const [declared, known] of [
    [[scale, { ...scale, widened: "negative lengths" }], { "off-scale": [".lab-line sets margin: -0.25rem, a fixed spacing"] }],
    [[scale], undefined],
  ]) {
    const repo = fakeRepo({ "upstream-sources.lock.json": lockOf("old", code), "scripts/ouro/check/run.ts": code, "ouro-check.json": '{\n  "waive": {}\n}\n' });
    // The release changes the rule's code without naming it anew: only new-rules.json says it reaches further.
    const tarball = async (follows, at) => new Map([["registry/ouro/check/run.ts", Buffer.from(at === "old" ? code : `${code}// negative lengths\n`)], rules(at === "old" ? [scale] : declared)]);
    let reports = [];
    const sources = { tarball, ciReports: async (gh, name, sha) => (sha === repo.refs.get(BRANCH) ? reports : []) };
    await keepRepo(repo.gh, "o/r", RELEASES, sources);
    reports = [{ findings }];
    await keepRepo(repo.gh, "o/r", RELEASES, sources);
    assert.deepEqual(JSON.parse(repo.fileAt(BRANCH, "ouro-check.json")).known, known);
    if (known) assert.match(repo.pulls[0].body, /- `off-scale`, which now also finds negative lengths: Spacing off the theme's spacing scale\.\[\^ouro-check-off-scale\] `1` findings this app already has/);
  }
});

test("when a failing shard cancelled the others and the round pushes nothing, a full run is asked for with a repository_dispatch event, and a workflow without its trigger is named", async () => {
  const lockOf = (commit, text) => JSON.stringify({ schemaVersion: 1, sources: [{ id: "check", repository: "ourostack/ouro-ui", commit, files: [{ sourcePath: "registry/ouro/check/run.ts", generatedPath: "scripts/ouro/check/run.ts", sha256: sha256(text) }] }] }, null, 2);
  const old = 'const RULES = ["overlap"];\n';
  const listening = "on:\n  pull_request:\n  repository_dispatch:\n    types: [ouro-current-full-run]\n";
  const start = (workflow) => ({ "upstream-sources.lock.json": lockOf("old", old), "scripts/ouro/check/run.ts": old, "ouro-check.json": '{\n  "waive": {}\n}\n', ".github/workflows/checks.yml": workflow });
  const tarball = async () => new Map([["registry/ouro/check/run.ts", Buffer.from('const RULES = ["overlap", "linked-card-dead-zone"];\n')]]);
  const cases = [
    [listening, 204, /^sent `ouro-current-full-run` for \w+, since a failing shard cancelled the others in \.github\/workflows\/checks\.yml$/, (sha) => [`repository_dispatch ouro-current-full-run ${sha}`]],
    [listening, 403, /^could not send `ouro-current-full-run` \(403\)/, (sha) => [`repository_dispatch ouro-current-full-run ${sha} refused 403`]],
    ["on:\n  pull_request:\n", 204, /^\.github\/workflows\/checks\.yml has no `repository_dispatch` trigger for `ouro-current-full-run`/, () => []],
  ];
  for (const [workflow, dispatch, said, sent] of cases) {
    const repo = fakeRepo(start(workflow), { dispatch });
    const reports = [{ findings: [{ rule: "linked-card-dead-zone", detail: "a click on 17 of 19 spots on it opens nothing" }] }];
    let cut = [];
    const sources = { tarball, ciReports: async () => reports, ciCutShort: async (gh, name, sha) => (sha === repo.refs.get(BRANCH) ? cut : []) };
    await keepRepo(repo.gh, "o/r", RELEASES, sources);
    cut = [{ id: 7, path: ".github/workflows/checks.yml" }];
    const seeded = await keepRepo(repo.gh, "o/r", RELEASES, sources);
    assert.equal(seeded.pr.pushed, true);
    assert.equal(seeded.pr.fullRun, undefined, "a round that pushes starts new checks of its own, so it asks for nothing");
    assert.ok(!repo.calls.some((call) => call.startsWith("repository_dispatch")));
    const settled = await keepRepo(repo.gh, "o/r", RELEASES, sources);
    assert.equal(settled.pr.pushed, false);
    assert.match(settled.pr.fullRun, said);
    assert.deepEqual(repo.calls.filter((call) => call.startsWith("repository_dispatch")), sent(repo.refs.get(BRANCH)));
  }
});

test("ciCutShort names a check workflow whose run had a cancelled job, until a full run of it is dispatched on the commit or sent after it", async () => {
  const runs = [
    { id: 1, workflow_id: 7, path: ".github/workflows/checks.yml", event: "pull_request", status: "completed", created_at: "2026-11-17T22:00:00Z" },
    { id: 2, workflow_id: 8, path: ".github/workflows/other.yml", event: "pull_request", status: "completed", created_at: "2026-11-17T22:00:00Z" },
    { id: 3, workflow_id: 9, path: ".github/workflows/logs.yml", event: "pull_request", status: "completed", created_at: "2026-11-17T22:00:00Z" },
  ];
  let sent = [{ id: 5, workflow_id: 7, event: "repository_dispatch", status: "completed", created_at: "2026-11-17T21:00:00Z" }];
  const jobs = { 1: ["failure", "cancelled", "success"], 2: ["success"], 3: ["cancelled"] };
  const artifacts = { 1: ["ouro-check-5-of-6"], 2: ["ouro-check-1-of-1"], 3: ["site-checks-logs"] };
  const client = { get: async (path) => {
    if (/actions\/runs\?head_sha=/.test(path)) return { workflow_runs: runs };
    if (/actions\/runs\?event=repository_dispatch/.test(path)) return { workflow_runs: sent };
    const [, id, kind] = /runs\/(\d+)\/(jobs|artifacts)/.exec(path);
    return kind === "jobs" ? { jobs: jobs[id].map((conclusion) => ({ conclusion })) } : { artifacts: artifacts[id].map((name) => ({ name })) };
  } };
  const sources = createSources(client);
  assert.deepEqual(await sources.ciCutShort(client, "o/r", "abc"), [{ id: 7, path: ".github/workflows/checks.yml" }], "only the check's workflow, only when a job was cancelled, and a full run from before it does not count");
  sent = [...sent, { id: 6, workflow_id: 7, event: "repository_dispatch", status: "queued", created_at: "2026-11-17T22:10:00Z" }];
  assert.deepEqual(await sources.ciCutShort(client, "o/r", "abc"), [], "a full run was sent after it");
  sent = [];
  runs.push({ id: 4, workflow_id: 7, event: "workflow_dispatch", status: "in_progress", created_at: "2026-11-17T22:05:00Z" });
  assert.deepEqual(await sources.ciCutShort(client, "o/r", "abc"), [], "a full run was dispatched on the commit");
  const failing = { get: async () => { throw Object.assign(new Error("no"), { status: 403 }); } };
  assert.deepEqual(await createSources(failing).ciCutShort(failing, "o/r", "abc"), []);
});

test("ciPending finds a run still queued or in progress on a commit, and reads with the public token when the app's cannot", async () => {
  let runs = [{ id: 1, status: "completed" }, { id: 2, status: "completed" }];
  const client = { get: async (path) => (/actions\/runs\?head_sha=/.test(path) ? { workflow_runs: runs } : { workflow_runs: [] }) };
  const sources = createSources(client);
  assert.equal(await sources.ciPending(client, "o/r", "abc"), false, "nothing is still running");
  runs = [...runs, { id: 3, status: "in_progress" }];
  assert.equal(await sources.ciPending(client, "o/r", "abc"), true, "a run still in progress");
  runs = [{ id: 4, status: "queued" }];
  assert.equal(await sources.ciPending(client, "o/r", "abc"), true, "a run still queued");
  const failing = { get: async () => { throw Object.assign(new Error("no"), { status: 403 }); } };
  assert.equal(await createSources(failing).ciPending(failing, "o/r", "abc"), false, "a repository whose Actions neither token can read is never held on a guess");
});

test("ciReports reads a full run's reports by the commit its artifacts name, and no other commit's", async () => {
  const zipOf = (name) => Buffer.from(name);
  const client = { get: async (path) => {
    if (/actions\/runs\?head_sha=/.test(path)) return { workflow_runs: [{ id: 1, event: "pull_request" }] };
    if (/actions\/runs\?event=repository_dispatch/.test(path)) return { workflow_runs: [{ id: 2, event: "repository_dispatch" }] };
    if (/runs\/1\/artifacts/.test(path)) return { artifacts: [{ name: "ouro-check-1-of-6", archive_download_url: "u/ouro-check-1-of-6" }] };
    if (/runs\/2\/artifacts/.test(path)) return { artifacts: [{ name: "ouro-check-5-of-6-full-abc", archive_download_url: "u/ouro-check-5-of-6-full-abc" }, { name: "ouro-check-5-of-6-full-other", archive_download_url: "u/ouro-check-5-of-6-full-other" }] };
    return zipOf(path.slice(2));
  } };
  const unzip = (zip) => JSON.stringify({ findings: [{ from: String(zip) }] });
  const reports = await createSources(client, { unzip }).ciReports(client, "o/r", "abc");
  assert.deepEqual(reports.map((report) => report.findings[0].from), ["ouro-check-1-of-6", "ouro-check-5-of-6-full-abc"]);
});

test("a prerelease version carried twice in one file moves to the next number, and a JSON changelog gets an entry for it (ourostack/ouroboros)", async () => {
  const rules = {
    version: [
      { path: "package.json", pattern: '^  "version": "([^"]+)"' },
      { path: "package-lock.json", pattern: '^  "version": "([^"]+)"' },
      { path: "package-lock.json", pattern: '^      "version": "([^"]+)"' },
    ],
    changelog: { path: "changelog.json", json: "versions", text: "Uses {releases}." },
  };
  const pkg = '{\n  "name": "@ouro.bot/cli",\n  "version": "0.1.0-alpha.1183"\n}\n';
  const lock = '{\n  "name": "@ouro.bot/cli",\n  "version": "0.1.0-alpha.1183",\n  "packages": {\n    "": {\n      "version": "0.1.0-alpha.1183"\n    },\n    "node_modules/x": {\n      "version": "1.0.0"\n    }\n  }\n}\n';
  const changelog = `${JSON.stringify({ _note: "kept", versions: [{ version: "0.1.0-alpha.1183", changes: ["Shipped."] }] }, null, 2)}\n`;
  const start = { "Package.swift": SWIFT, ".github/ouro-current.json": JSON.stringify(rules), "package.json": pkg, "package-lock.json": lock, "changelog.json": changelog };
  const repo = fakeRepo(start, { latestRelease: "v0.1.0-alpha.1183" });
  await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(repo.fileAt(BRANCH, "package.json"), pkg.replace("1183", "1184"));
  assert.equal(repo.fileAt(BRANCH, "package-lock.json"), lock.replaceAll("0.1.0-alpha.1183", "0.1.0-alpha.1184"), "both places in the lock move, and another package's version does not");
  assert.deepEqual(JSON.parse(repo.fileAt(BRANCH, "changelog.json")), { _note: "kept", versions: [{ version: "0.1.0-alpha.1184", changes: ["Uses Ouro UI for Apple v0.9.0."] }, { version: "0.1.0-alpha.1183", changes: ["Shipped."] }] });
  assert.match(repo.pulls[0].body, /moves to `0\.1\.0-alpha\.1184`, after its latest release `v0\.1\.0-alpha\.1183`/);

  // A bump already waiting to ship keeps its version, and its entry gets the line.
  const waiting = `${JSON.stringify({ versions: [{ version: "0.1.0-alpha.1184", changes: ["Waiting."] }, { version: "0.1.0-alpha.1183", changes: ["Shipped."] }] }, null, 2)}\n`;
  const ahead = fakeRepo({ ...start, "package.json": pkg.replace("1183", "1184"), "package-lock.json": lock.replaceAll("1183", "1184"), "changelog.json": waiting }, { latestRelease: "v0.1.0-alpha.1183" });
  await keepRepo(ahead.gh, "o/r", RELEASES, {});
  assert.equal(ahead.fileAt(BRANCH, "package.json"), pkg.replace("1183", "1184"));
  assert.deepEqual(JSON.parse(ahead.fileAt(BRANCH, "changelog.json")).versions[0], { version: "0.1.0-alpha.1184", changes: ["Waiting.", "Uses Ouro UI for Apple v0.9.0."] });
});

test("a version the npm registry already serves starts the next version, though the repository's latest release is behind it", async () => {
  const rules = {
    version: [{ path: "package.json", pattern: '^  "version": "([^"]+)"' }],
    npm: "@acme/app",
    changelog: { path: "changelog.json", json: "versions", text: "Uses {releases}." },
  };
  const pkg = '{\n  "name": "@acme/app",\n  "version": "0.1.0-alpha.1293"\n}\n';
  const changelog = `${JSON.stringify({ versions: [{ version: "0.1.0-alpha.1293", changes: ["Waiting."] }] }, null, 2)}\n`;
  const start = { "Package.swift": SWIFT, ".github/ouro-current.json": JSON.stringify(rules), "package.json": pkg, "changelog.json": changelog };
  const asked = [];
  const serving = (served) => async (url) => {
    asked.push(url);
    return { ok: served };
  };
  const out = fakeRepo(start, { latestRelease: "v0.1.0-alpha.1292" });
  await keepRepo(out.gh, "o/r", RELEASES, {}, { fetchImpl: serving(true) });
  assert.deepEqual(asked, ["https://registry.npmjs.org/@acme%2Fapp/0.1.0-alpha.1293"]);
  assert.equal(out.fileAt(BRANCH, "package.json"), pkg.replace("1293", "1294"));
  assert.deepEqual(JSON.parse(out.fileAt(BRANCH, "changelog.json")).versions[0], { version: "0.1.0-alpha.1294", changes: ["Uses Ouro UI for Apple v0.9.0."] });
  assert.match(out.pulls[0].body, /which the npm registry already serves/);

  const waiting = fakeRepo(start, { latestRelease: "v0.1.0-alpha.1292" });
  await keepRepo(waiting.gh, "o/r", RELEASES, {}, { fetchImpl: serving(false) });
  assert.equal(waiting.fileAt(BRANCH, "package.json"), pkg);
  assert.deepEqual(JSON.parse(waiting.fileAt(BRANCH, "changelog.json")).versions[0], { version: "0.1.0-alpha.1293", changes: ["Waiting.", "Uses Ouro UI for Apple v0.9.0."] });
});

test("an update pull request with only merges of main on top of Ouro Current's commit is still Ouro Current's, and moves to the newest release (ourostack/ouroboros#1389)", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT, "README.md": "# App\n" });
  const first = await keepRepo(repo.gh, "o/r", RELEASES, {});
  const merge = async (message) => {
    repo.setMain({ "README.md": `# App\n${message}\n` });
    const head = repo.refs.get(BRANCH);
    const commit = await repo.gh.post("repos/o/r/git/commits", { message, tree: repo.commitTree(repo.refs.get("main")), parents: [head, repo.refs.get("main")] });
    await repo.gh.patch(`repos/o/r/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true });
    return commit.sha;
  };
  await merge("Merge branch 'main' into ouro-current/update");
  await merge("Merge branch 'main' into ouro-current/update");
  const newer = { ...RELEASES, apple: { ...RELEASES.apple, tag: "v0.10.0", sha: "f".repeat(40) } };
  const again = await keepRepo(repo.gh, "o/r", newer, {});
  assert.equal(again.pr.number, first.pr.number);
  assert.equal(again.pr.edited, undefined);
  assert.equal(again.pr.pushed, true);
  assert.match(repo.fileAt(BRANCH, "Package.swift"), /0\.10\.0/);
  assert.equal(repo.fileAt(BRANCH, "README.md"), repo.fileAt("main", "README.md"), "built on the newest main");

  // A merge named like one, whose second parent is not on main, is someone's work, and is left to them.
  const other = fakeRepo({ "Package.swift": SWIFT });
  await keepRepo(other.gh, "o/r", RELEASES, {});
  const ours = other.refs.get(BRANCH);
  const side = await other.gh.post("repos/o/r/git/commits", { message: "A fix", tree: other.commitTree(ours), parents: [ours] });
  const fake = await other.gh.post("repos/o/r/git/commits", { message: "Merge branch 'main' into ouro-current/update", tree: other.commitTree(ours), parents: [ours, side.sha] });
  await other.gh.patch(`repos/o/r/git/refs/heads/${BRANCH}`, { sha: fake.sha, force: true });
  const left = await keepRepo(other.gh, "o/r", newer, {});
  assert.equal(left.pr.edited, true);
  assert.equal(other.refs.get(BRANCH), fake.sha);
});

test("a fragment name can carry the version with dashes for dots (ourostack/gatefold)", async () => {
  const rules = { changelog: { path: "changelog.d/ouro-ui-{versionSlug}.md", text: "---\ntitle: New parts\n---\nUses {releases}.\n" } };
  const repo = fakeRepo({ "Package.swift": SWIFT, ".github/ouro-current.json": JSON.stringify(rules) });
  const result = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(result.state, "pr");
  assert.equal(repo.fileAt(BRANCH, "changelog.d/ouro-ui-0-9-0.md"), "---\ntitle: New parts\n---\nUses Ouro UI for Apple v0.9.0.\n");
});

test("the versions of ouro-ui-apple a Swift manifest takes, as SwiftPM reads them", () => {
  const manifest = (requirement) => `.package(url: "https://github.com/ourostack/ouro-ui-apple.git", ${requirement}),`;
  assert.deepEqual(appleRequirement(manifest('.upToNextMinor(from: "1.0.0")')), { rule: "minor", version: "1.0.0" });
  assert.deepEqual(appleRequirement(manifest('from: "1.0.0"')), { rule: "major", version: "1.0.0" });
  assert.deepEqual(appleRequirement(manifest('exact: "1.0.0"')), { rule: "exact", version: "1.0.0" });
  assert.equal(appleRequirement('.package(url: "https://github.com/apple/swift-markdown.git", from: "0.4.0")'), null);
  assert.equal(takes({ rule: "minor", version: "1.0.0" }, "v1.0.3"), true);
  assert.equal(takes({ rule: "minor", version: "1.0.0" }, "v1.1.0"), false);
  assert.equal(takes({ rule: "major", version: "1.0.0" }, "v1.1.0"), true);
  assert.equal(takes({ rule: "major", version: "1.1.0" }, "v1.0.9"), false);
  assert.equal(takes({ rule: "major", version: "1.0.0" }, "v2.0.0"), false);
  assert.equal(takes({ rule: "exact", version: "1.1.0" }, "v1.1.0"), true);
});

test("Ouro UI for Apple waits while an ourostack package the app resolves does not take the release", async () => {
  // Ouro MD on ouro-ui-apple 1.0, with an app shell whose manifest takes only 1.0.x at the revision Ouro MD resolves.
  const apple = (requirement) => `.package(url: "https://github.com/ourostack/ouro-ui-apple.git", ${requirement}),`;
  const resolved = (shell) => JSON.stringify({ pins: [
    { identity: "ouro-native-apple-app-shell", location: "https://github.com/ourostack/ouro-native-apple-app-shell.git", state: { branch: "main", revision: shell } },
    { identity: "ouro-ui-apple", location: "https://github.com/ourostack/ouro-ui-apple.git", state: { revision: "a".repeat(40), version: "0.6.0" } },
  ] });
  const shell = { ["1".repeat(40)]: apple('.upToNextMinor(from: "0.6.0")'), ["2".repeat(40)]: apple('from: "0.6.0"') };
  const releases = { ...RELEASES, web: { ...RELEASES.web, tag: "v0.0.0" } };
  const run = async (revision, extra = {}) => {
    const repo = fakeRepo({ "Package.swift": apple('.upToNextMinor(from: "0.6.0")'), "Package.resolved": resolved(revision), ...extra });
    const fetch = async (url, init) => {
      const path = url.replace("https://api.github.com/", "");
      const match = /^repos\/ourostack\/ouro-native-apple-app-shell\/contents\/Package\.swift\?ref=(.+)$/.exec(path);
      if (match) return { status: 200, headers: new Map(), text: async () => JSON.stringify({ content: Buffer.from(shell[match[1]]).toString("base64") }) };
      return repo.fetch(url, init);
    };
    const gh = createGitHub({ token: "t", fetch, sleep: async () => {} });
    return { repo, result: await keepRepo(gh, "o/r", releases, {}) };
  };

  const held = await run("1".repeat(40));
  assert.equal(held.result.state, "skipped");
  assert.match(held.result.reason, /ourostack\/ouro-native-apple-app-shell at 1111111 takes 0\.6\.0 up to the next minor/);
  assert.equal(held.repo.fileAt("main", "Package.swift").includes("0.9.0"), false);

  const moves = await run("2".repeat(40));
  assert.equal(moves.result.state, "pr");
  assert.match(moves.repo.fileAt(BRANCH, "Package.swift"), /from: "0\.9\.0"/);
  assert.match(moves.repo.fileAt(BRANCH, "Package.resolved"), /"version":"0\.9\.0"/);
});

// A spoonjoy-shaped app: oxlint pinned in package.json, its config in .oxlintrc.json, and every hit held to
// oxlint.baseline.json (file → rule → count), which its lint fails on when a count falls as well as when it rises. An
// update that leaves fewer hits in the files it vendors lowers the baseline, or the app's lint fails on the update
// (spoonjoy-v2#814: react(no-children-prop) fell to 0 in 18 vendored type tests).
const VENDORED = "tools/ouro-actions/ouro-actions.mts";
const hits = (n) => n === 0 ? "export const none = 0;\n" : `import { createElement } from "react";\nconst Item = (props: { children?: string }) => props.children;\n${Array.from({ length: n }, (_, i) => `export const hit${i} = createElement(Item, { children: "${i}" });\n`).join("")}`;
const lintedApp = (before, { baseline = true } = {}) => {
  const files = {
    "package.json": JSON.stringify({ devDependencies: { oxlint: "1.86.0" } }, null, 2),
    // As spoonjoy's: a JavaScript plugin of the app's own, which Ouro Current never runs.
    ".oxlintrc.json": JSON.stringify({ plugins: ["react"], jsPlugins: ["./scripts/lint/comments.mjs"], rules: { "react/no-children-prop": "error", "comments/no-orphan-doc": "error" } }, null, 2),
    "scripts/lint/comments.mjs": 'throw new Error("Ouro Current ran the repository\'s own lint plugin");\n',
    [VENDORED]: before,
    "tools/ouro-actions/dist-manifest.json": JSON.stringify({ coreTag: "v1.1.0", files: { "dist/actions/ouro-actions.mts": sha256(before) } }),
  };
  if (baseline) files["oxlint.baseline.json"] = `${JSON.stringify({ "app/root.tsx": { "react(only-export-components)": 1 }, [VENDORED]: { "comments(no-orphan-doc)": 2, "react(no-children-prop)": 3, "unused-disable-directive": 1 } }, null, 2)}\n`;
  return files;
};
const lintedRelease = (after) => distAsset({ "dist-manifest.json": JSON.stringify({ coreTag: "v0.15.0", files: { "dist/actions/ouro-actions.mts": sha256(after) } }), "actions/ouro-actions.mts": after });

test("an update that leaves fewer lint hits in the files it vendors lowers the app's oxlint baseline, counted with the oxlint and config the app pins", async () => {
  const fewer = fakeRepo(lintedApp(`// oxlint-disable-next-line no-console\n${hits(3)}`));
  assert.equal((await keepRepo(fewer.gh, "o/r", RELEASES, lintedRelease(hits(1)))).state, "pr");
  assert.equal(fewer.fileAt(BRANCH, "oxlint.baseline.json"), `${JSON.stringify({ "app/root.tsx": { "react(only-export-components)": 1 }, [VENDORED]: { "comments(no-orphan-doc)": 2, "react(no-children-prop)": 1 } }, null, 2)}\n`, "a count that falls is lowered, one that reaches 0 goes, and the rest is as it was");
  const body = fewer.pulls[0].body;
  assert.match(body, /Lowers `oxlint\.baseline\.json` to the hits left in the files this update changes, counted with oxlint `1\.86\.0` and `\.oxlintrc\.json`, as the repository pins them \(the rules of its JavaScript plugins, `comments`, are its own code, which Ouro Current does not run, so their counts stay as they were\): `tools\/ouro-actions\/ouro-actions\.mts` `react\(no-children-prop\)` `3` to `1`, `unused-disable-directive` `1` to `0`\./);
  assert.deepEqual(lintMarkdown(body, { file: "pull request body" }), []);

  // A file with none left loses its entry.
  const none = fakeRepo(lintedApp(`// oxlint-disable-next-line no-console\n${hits(3)}`));
  await keepRepo(none.gh, "o/r", RELEASES, lintedRelease(hits(0)));
  assert.deepEqual(JSON.parse(none.fileAt(BRANCH, "oxlint.baseline.json")), { "app/root.tsx": { "react(only-export-components)": 1 }, [VENDORED]: { "comments(no-orphan-doc)": 2 } }, "a JavaScript plugin's count stays, as Ouro Current cannot count it");
  // A file with no count left at all loses its entry.
  const gone = fakeRepo({ ...lintedApp(hits(3)), "oxlint.baseline.json": `${JSON.stringify({ [VENDORED]: { "react(no-children-prop)": 3 } }, null, 2)}\n` });
  await keepRepo(gone.gh, "o/r", RELEASES, lintedRelease(hits(0)));
  assert.equal(gone.fileAt(BRANCH, "oxlint.baseline.json"), "{}\n");
});

test("an update that raises a lint count in the files it vendors leaves the baseline alone and says which file, rule and count went up", async () => {
  const more = fakeRepo(lintedApp(`// oxlint-disable-next-line no-console\n${hits(3)}`));
  assert.equal((await keepRepo(more.gh, "o/r", RELEASES, lintedRelease(hits(5)))).state, "pr");
  assert.equal(more.fileAt(BRANCH, "oxlint.baseline.json"), more.fileAt("main", "oxlint.baseline.json"), "a baseline is never raised, and not lowered either when a count rises");
  const body = more.pulls[0].body;
  assert.match(body, /Leaves `oxlint\.baseline\.json` as it was: this update raises `tools\/ouro-actions\/ouro-actions\.mts` `react\(no-children-prop\)` from `3` to `5`, counted with oxlint `1\.86\.0`/);
  assert.deepEqual(lintMarkdown(body, { file: "pull request body" }), []);
});

test("an update that deletes a vendored file drops its baseline entry, and runs no generator it deletes (spoonjoy/spoonjoy-v2#828)", async () => {
  const { lowerBaseline } = await import("./baseline.mjs");
  const { regenerate } = await import("./generate.mjs");
  const bytes = { "oxlint.baseline.json": Buffer.from(`${JSON.stringify({ "app/lib/ouro/ax/command.ts": { "no-console": 2 }, "app/root.tsx": { "no-console": 1 } }, null, 2)}\n`), "app/lib/ouro/ax/command.ts": Buffer.from("console.log(1);\nconsole.log(2);\n"), "tools/ouro-actions/ouro-actions.mts": Buffer.from("gen\n") };
  const ctx = { consumerFile: async (path) => bytes[path] ?? null, consumerPaths: () => Object.keys(bytes) };
  const lowered = await lowerBaseline({ "app/lib/ouro/ax/command.ts": null }, ctx);
  assert.deepEqual(JSON.parse(lowered.files["oxlint.baseline.json"]), { "app/root.tsx": { "no-console": 1 } }, "a deleted file has no hits left");
  assert.deepEqual(lowered.notes, ["Lowers `oxlint.baseline.json` to the hits left in the files this update changes, which it deletes: `app/lib/ouro/ax/command.ts` `no-console` `2` to `0`."]);
  assert.deepEqual(lowered.notes.flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
  assert.deepEqual(await regenerate({ "tools/ouro-actions/ouro-actions.mts": null }, ctx), { files: {}, notes: [] });
});

test("an update to an app with no oxlint baseline writes none", async () => {
  const bare = fakeRepo(lintedApp(hits(3), { baseline: false }));
  await keepRepo(bare.gh, "o/r", RELEASES, lintedRelease(hits(1)));
  assert.equal(bare.fileAt(BRANCH, "oxlint.baseline.json"), undefined);
  assert.doesNotMatch(bare.pulls[0].body, /oxlint/);
});

/**
 * An app with Ouro HX's button installed from an old tag, and a release whose registry ships `lib-squircle-corners`,
 * the PostCSS plugin that alone draws squircles in WebKit since #3426 (#3488).
 */
function squircleFixture({ tag = "v1.3.117", build = {} } = {}) {
  const button = (v) => `import { cn } from "@/registry/ouro/lib/ouro/cn";\nexport const Button = "${v}";\n`;
  const plugin = "export { squircleCorners };\nfunction squircleCorners() {\n  return { postcssPlugin: \"ouro-squircle-corners\", OnceExit() {} };\n}\n";
  const buttonItem = { name: "button", type: "registry:ui", files: [{ path: "registry/ouro/components/ouro/button/button.tsx", target: "@components/ouro/button/button.tsx" }] };
  const squircleItem = { name: "lib-squircle-corners", type: "registry:lib", files: [{ path: "registry/ouro/lib/ouro/squircle-corners.ts", target: "@lib/ouro/squircle-corners.ts" }] };
  const at = (version) =>
    version === "v1.3.117"
      ? new Map(Object.entries({ "registry.json": JSON.stringify({ items: [buttonItem] }), "registry/ouro/components/ouro/button/button.tsx": button("v1") }).map(([k, v]) => [k, Buffer.from(v)]))
      : new Map(Object.entries({ "registry.json": JSON.stringify({ items: [buttonItem, squircleItem] }), "registry/ouro/components/ouro/button/button.tsx": button("v2"), "registry/ouro/lib/ouro/squircle-corners.ts": plugin }).map(([k, v]) => [k, Buffer.from(v)]));
  const v = tag === "v1.3.117" ? "v1" : "v2";
  const files = {
    "components.json": JSON.stringify({ aliases: { components: "~/components", lib: "~/lib" } }),
    "app/components/ouro/button/button.tsx": button(v).replace("@/registry/ouro/lib/", "~/lib/"),
    ".github/ouro-hx-installed.json": JSON.stringify({ tag, tagCommit: "old", files: { "app/components/ouro/button/button.tsx": sha256(button(v)) } }),
    ...build,
  };
  return { files, plugin, tarball: async (follows, version) => at(version) };
}

const VITE_CONFIG = 'import { defineConfig } from "vite";\n\nexport default defineConfig({\n  plugins: [],\n});\n';

test("an Ouro HX update to a release that draws squircles only through squircleCorners() installs the plugin and wires it into the app's Vite config (#3488)", async () => {
  const app = squircleFixture({ build: { "vite.config.ts": VITE_CONFIG } });
  const consumer = new Map(Object.entries(app.files).map(([k, v]) => [k, Buffer.from(v)]));
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const update = await UPDATERS["hx-installed"](pin, app.files[pin.file], RELEASES.web, { tarball: app.tarball, consumerFiles: async () => consumer });
  assert.equal(update.files["app/lib/ouro/squircle-corners.ts"]?.toString(), app.plugin, "the plugin lands where the app's lib alias resolves");
  assert.equal(JSON.parse(update.files[pin.file]).files["app/lib/ouro/squircle-corners.ts"], sha256(app.plugin), "and the install record holds it");
  assert.equal(String(update.files["vite.config.ts"]), 'import { defineConfig } from "vite";\nimport { squircleCorners } from "./app/lib/ouro/squircle-corners";\n\nexport default defineConfig({\n  css: { postcss: { plugins: [squircleCorners()] } },\n  plugins: [],\n});\n');
  assert.ok(update.notes.some((note) => note.includes("`vite.config.ts`") && note.includes("squircleCorners()")));
});

test("an Ouro HX update to a squircleCorners() release is held back whole when the app's PostCSS plugins are in a postcss.config file, and says what to add (#3488)", async () => {
  const app = squircleFixture({ build: { "vite.config.ts": VITE_CONFIG, "postcss.config.js": 'export default { plugins: { "@tailwindcss/postcss": {} } };\n' } });
  const repo = fakeRepo({ ...app.files, ".github/ouro-current.json": "{}" });
  const kept = await keepRepo(repo.gh, "o/r", RELEASES, { tarball: app.tarball });
  assert.equal(kept.state, "skipped");
  assert.match(kept.reason, /`postcss\.config\.js`/);
  assert.match(kept.reason, /squircleCorners\(\)/);
  assert.equal(repo.pulls.length, 0, "no pull request leaves Safari with round corners");
});

test("an install record already on a squircleCorners() release whose build lacks the plugin gets a pull request that adds it, and is current once it merges (#3488)", async () => {
  const app = squircleFixture({ tag: RELEASES.web.tag, build: { "vite.config.ts": VITE_CONFIG } });
  const repo = fakeRepo({ ...app.files, ".github/ouro-current.json": "{}" });
  const kept = await keepRepo(repo.gh, "o/r", RELEASES, { tarball: app.tarball });
  assert.equal(kept.state, "pr");
  assert.equal(kept.pr.title, `Draw squircles in WebKit with ${"Ouro UI"} ${RELEASES.web.tag}`);
  assert.match(repo.fileAt(BRANCH, "vite.config.ts"), /plugins: \[squircleCorners\(\)\]/);
  assert.equal(repo.fileAt(BRANCH, "app/lib/ouro/squircle-corners.ts"), app.plugin);
  repo.setMain({ "vite.config.ts": repo.fileAt(BRANCH, "vite.config.ts"), "app/lib/ouro/squircle-corners.ts": app.plugin, ".github/ouro-hx-installed.json": repo.fileAt(BRANCH, ".github/ouro-hx-installed.json") });
  assert.equal((await keepRepo(repo.gh, "o/r", RELEASES, { tarball: app.tarball })).state, "current");
});

test("an app that wired squircleCorners() its own way, or installs no component, is not held back or changed for it (#3488)", async () => {
  const own = squircleFixture({ tag: RELEASES.web.tag, build: { "postcss.config.mjs": 'import { squircleCorners } from "./app/lib/ouro/squircle-corners.ts";\nexport default { plugins: [squircleCorners()] };\n', "app/lib/ouro/squircle-corners.ts": "mine" } });
  assert.equal((await keepRepo(fakeRepo({ ...own.files, ".github/ouro-current.json": "{}" }).gh, "o/r", RELEASES, { tarball: own.tarball })).state, "current");
  const tools = squircleFixture({ build: { "vite.config.ts": VITE_CONFIG } });
  const check = { name: "ouro-check", type: "registry:lib", files: [{ path: "registry/ouro/check/run.ts", target: "~/scripts/ouro/check/run.ts" }] };
  const tarball = async (follows, version) => {
    const files = await tools.tarball(follows, version);
    const registry = JSON.parse(files.get("registry.json").toString());
    registry.items.push(check);
    files.set("registry.json", Buffer.from(JSON.stringify(registry)));
    files.set("registry/ouro/check/run.ts", Buffer.from(`run ${version}`));
    return files;
  };
  const consumer = new Map([["components.json", Buffer.from(tools.files["components.json"])], ["scripts/ouro/check/run.ts", Buffer.from("run v1.3.117")], ["vite.config.ts", Buffer.from(VITE_CONFIG)]]);
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const record = JSON.stringify({ tag: "v1.3.117", tagCommit: "old", files: { "scripts/ouro/check/run.ts": sha256("run v1.3.117") } });
  const update = await UPDATERS["hx-installed"](pin, record, RELEASES.web, { tarball, consumerFiles: async () => consumer });
  assert.equal(String(update.files["scripts/ouro/check/run.ts"]), `run ${RELEASES.web.tag}`);
  assert.equal(update.files["vite.config.ts"], undefined, "an app with no Ouro surface draws no corners");
  assert.ok(!Object.keys(update.files).some((path) => path.includes("squircle")));
});

const POINTER = "**[Interfaces follow Ouro UI](https://github.com/ourostack/.github/blob/main/agents/interfaces-follow-ouro-ui.md).** Build screens from Ouro HX.\nKeep it current.";
const AGENTS = `# Agents\n\nShip small.\n\n${POINTER}\n\n## Tests\n\nRun them.\n`;
const block = (text) => `<!-- ouro-ui:bar -->\n${text}\n<!-- /ouro-ui:bar -->`;

test("AGENTS.md gets the bar beside its pointer to Interfaces follow Ouro UI, or at the end, and a stale block is replaced in place", () => {
  assert.equal(withBar(AGENTS), `# Agents\n\nShip small.\n\n${POINTER}\n\n${block(BAR)}\n\n## Tests\n\nRun them.\n`);
  assert.equal(withBar(withBar(AGENTS)), null, "a block already in step changes nothing");
  assert.equal(withBar(`# Agents\n\n${block("old words")}\n\nRun them.\n`), `# Agents\n\n${block(BAR)}\n\nRun them.\n`, "only the block's text changes, where it is");
  assert.equal(withBar("# Agents\n\nRun them.\n\n"), `# Agents\n\nRun them.\n\n${block(BAR)}\n`);
  assert.deepEqual(lintMarkdown(BAR, { file: "AGENTS.md" }), [], "a repository that runs the claims check on AGENTS.md accepts the block");
});

test("an update brings the bar into AGENTS.md and the skill it points at, and moves AGENTS.md's byte budget by the block alone, unless the repository ignores AGENTS.md", async () => {
  const budget = 5000;
  const repo = fakeRepo({ "Package.swift": SWIFT, [AGENTS_PATH]: AGENTS, ".github/agents-md-budget.json": `${JSON.stringify({ [AGENTS_PATH]: budget }, null, 2)}\n` });
  assert.equal((await keepRepo(repo.gh, "o/r", RELEASES, {})).state, "pr");
  const written = repo.fileAt(BRANCH, AGENTS_PATH);
  assert.equal(written, withBar(AGENTS));
  assert.deepEqual(JSON.parse(repo.fileAt(BRANCH, ".github/agents-md-budget.json")), { [AGENTS_PATH]: budget + Buffer.byteLength(written) - Buffer.byteLength(AGENTS) });
  assert.equal(repo.fileAt(BRANCH, SKILL_PATH), SKILL);
  assert.match(repo.pulls[0].body, /Brings Ouro UI's bar for people and agents into `AGENTS\.md`, between `ouro-ui:bar` markers/);
  assert.match(repo.pulls[0].body, /Brings the `the-bar` skill to `\.agents\/skills\/the-bar\/SKILL\.md`/);
  assert.deepEqual(lintMarkdown(repo.pulls[0].body, { file: "pull request body" }), []);

  const edited = fakeRepo({ "Package.swift": SWIFT, [AGENTS_PATH]: withBar(AGENTS), [SKILL_PATH]: "an edited skill" });
  await keepRepo(edited.gh, "o/r", RELEASES, {});
  assert.equal(edited.fileAt(BRANCH, SKILL_PATH), SKILL, "an edited skill is brought back in step with Ouro UI's");
  assert.equal(edited.fileAt(BRANCH, AGENTS_PATH), withBar(AGENTS), "a block in step is left as it is");

  const ignoring = fakeRepo({ "Package.swift": SWIFT, [AGENTS_PATH]: AGENTS, ".github/ouro-current.json": JSON.stringify({ ignore: [AGENTS_PATH] }) });
  await keepRepo(ignoring.gh, "o/r", RELEASES, {});
  assert.equal(ignoring.fileAt(BRANCH, AGENTS_PATH), AGENTS);
  assert.equal(ignoring.fileAt(BRANCH, SKILL_PATH), undefined, "ignoring AGENTS.md leaves the skill out too");
  const without = fakeRepo({ "Package.swift": SWIFT });
  await keepRepo(without.gh, "o/r", RELEASES, {});
  assert.equal(without.fileAt(BRANCH, AGENTS_PATH), undefined, "a repository with no AGENTS.md gets none");
  assert.equal(without.fileAt(BRANCH, SKILL_PATH), undefined, "nor the skill");
});
