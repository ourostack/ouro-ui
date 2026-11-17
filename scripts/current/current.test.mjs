import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, createVerify, generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { lintMarkdown, lintPlain } from "../../registry/ouro/lib/ouro/claims-check.mjs";
import { BRANCH, body, keepCurrent, keepRepo, main, publicView, title } from "./current.mjs";
import { appJwt, createGitHub, retryable } from "./github.mjs";
import { UPDATERS, findPins, isBehind, isCandidate } from "./pins.mjs";
import { readTarball } from "./tar.mjs";
import { scratchDir } from "../scratch.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const RELEASES = {
  web: { repo: "ourostack/ouro-ui", name: "Ouro UI", tag: "v1.3.187", sha: "c".repeat(40), url: "https://example.test/web" },
  core: { repo: "ourostack/ouro-ui-core", name: "Ouro UI core", tag: "v0.15.0", sha: "d".repeat(40), url: "https://example.test/core" },
  apple: { repo: "ourostack/ouro-ui-apple", name: "Ouro UI for Apple", tag: "v0.9.0", sha: "e".repeat(40), url: "https://example.test/apple" },
};

/** A gzipped tar like GitHub's: one top folder, and a pax record for a long name. */
function tarball(files) {
  const blocks = [];
  const header = (name, size, type) => {
    const block = Buffer.alloc(512);
    block.write(name.slice(0, 99), 0);
    block.write(size.toString(8).padStart(11, "0"), 124);
    block.write(type, 156);
    return block;
  };
  const pad = (bytes) => Buffer.concat([bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)]);
  for (const [path, content] of Object.entries(files)) {
    const name = `ourostack-ouro-ui-abc123/${path}`;
    const bytes = Buffer.from(content);
    if (name.length > 99) {
      const rest = ` path=${name}\n`;
      let size = rest.length + 2;
      while (String(size).length + rest.length !== size) size = String(size).length + rest.length;
      const pax = Buffer.from(`${size}${rest}`);
      blocks.push(header("pax", pax.length, "x"), pad(pax));
    }
    blocks.push(header(name, bytes.length, "0"), pad(bytes));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

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
 * An app at `dir` (the folder of its components.json) that installed Ouro check and the X-ray under its lib folder at
 * v1.3.117. The next tag moves both to `~/scripts/ouro/`, and the shared AX file `command.ts` stays under the lib folder.
 */
function moveFixture(dir, { checkHere = 'export const check = "v1";\n' } = {}) {
  const lib = `${dir}src/lib/`;
  const CHECK = (v) => `export const check = "${v}";\n`;
  const XRAY = (v) => `import { command } from "#ouro-ax/command.ts";\nexport const xray = "${v}";\n`;
  const COMMAND = (v) => `export const command = "${v}";\n`;
  const registry = (checkTarget, xrayTarget) => ({ items: [
    // At the new tag Ouro check also gains a file, which goes beside its moved files.
    { name: "ouro-check", files: [{ path: "registry/ouro/check/check.ts", target: checkTarget }, ...(checkTarget.startsWith("~/") ? [{ path: "registry/ouro/check/run.ts", target: "~/scripts/ouro/check/run.ts" }] : [])] },
    { name: "ax-xray", files: [{ path: "registry/ouro/ax/xray.ts", target: xrayTarget }] },
    { name: "ax-command", files: [{ path: "registry/ouro/ax/command.ts", target: "@lib/ouro/ax/command.ts" }] },
  ] });
  const files = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
  const previous = files({ "registry.json": JSON.stringify(registry("@lib/ouro/check/check.ts", "@lib/ouro/ax/xray.ts")), "registry/ouro/check/check.ts": CHECK("v1"), "registry/ouro/ax/xray.ts": XRAY("v1"), "registry/ouro/ax/command.ts": COMMAND("v1") });
  const next = files({ "registry.json": JSON.stringify(registry("~/scripts/ouro/check/check.ts", "~/scripts/ouro/ax/xray.ts")), "registry/ouro/check/check.ts": CHECK("v2"), "registry/ouro/check/run.ts": "export const run = 2;\n", "registry/ouro/ax/xray.ts": XRAY("v2"), "registry/ouro/ax/command.ts": COMMAND("v2") });
  const installed = { [`${lib}ouro/check/check.ts`]: checkHere, [`${lib}ouro/ax/xray.ts`]: XRAY("v1"), [`${lib}ouro/ax/command.ts`]: COMMAND("v1") };
  const record = { tag: "v1.3.117", tagCommit: "old", files: { [`${lib}ouro/check/check.ts`]: sha256(CHECK("v1")), [`${lib}ouro/ax/xray.ts`]: sha256(XRAY("v1")), [`${lib}ouro/ax/command.ts`]: sha256(COMMAND("v1")) } };
  // The package's scripts name the files by their path from the package folder, as a package.json does.
  const packageJson = `{\n    "name": "app",\n    "scripts": {\n        "check": "node ${lib.slice(dir.length)}ouro/check/check.ts dist"\n    }\n}\n`;
  const consumer = files({
    [`${dir}components.json`]: JSON.stringify({ aliases: { components: "@/components", lib: "@/lib" } }),
    [`${dir}tsconfig.json`]: JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    [`${dir}package.json`]: packageJson,
    ...installed,
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
  assert.equal(update.files["scripts/ouro/ax/xray.ts"].toString(), 'import { command } from "#ouro-ax/command.ts";\nexport const xray = "v2";\n');
  assert.equal(update.files["src/lib/ouro/ax/command.ts"].toString(), 'export const command = "v2";\n', "the shared file is updated where it is");
  const written = JSON.parse(update.files[pin.file]);
  assert.equal(written.files["scripts/ouro/check/check.ts"], sha256('export const check = "v2";\n'));
  assert.equal(written.files["scripts/ouro/ax/xray.ts"], sha256('import { command } from "#ouro-ax/command.ts";\nexport const xray = "v2";\n'), "the record keeps the registry source's hash");
  assert.equal(written.files["src/lib/ouro/ax/command.ts"], sha256('export const command = "v2";\n'));
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
function apartFixture({ imports } = {}) {
  // As Ouro check's entry point guards itself: it runs only when it is the file node was asked to run.
  const RUN = 'import { realpathSync } from "node:fs";\nimport { fileURLToPath } from "node:url";\nimport "#ouro-ax/command.ts";\nif (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) console.log(JSON.stringify(process.argv.slice(2)));\n';
  const registry = (check) => ({ items: [
    { name: "ouro-check", files: [{ path: "registry/ouro/check/check.ts", target: `${check}check/check.ts` }, { path: "registry/ouro/check/fades.ts", target: `${check}check/fades.ts` }] },
    { name: "ax-command", files: [{ path: "registry/ouro/ax/command.ts", target: "@lib/ouro/ax/command.ts" }] },
    { name: "lib-cn", files: [{ path: "registry/ouro/lib/ouro/cn.ts", target: "@lib/ouro/cn.ts" }] },
  ] });
  const files = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
  const previous = files({ "registry.json": JSON.stringify(registry("@lib/ouro/")), "registry/ouro/check/check.ts": "check v1\n", "registry/ouro/check/fades.ts": "fades v1\n", "registry/ouro/ax/command.ts": "command v1\n", "registry/ouro/lib/ouro/cn.ts": "cn\n" });
  const next = files({ "registry.json": JSON.stringify(registry("~/scripts/ouro/")), "registry/ouro/check/check.ts": RUN, "registry/ouro/check/fades.ts": "export const fades = 2;\n", "registry/ouro/ax/command.ts": "export const command = 2;\n", "registry/ouro/lib/ouro/cn.ts": "cn\n" });
  const installed = { "lib/ouro/check/check.ts": "check v1\n", "lib/ouro/check/fades.ts": "fades v1\n", "lib/ouro/ax/command.ts": "command v1\n", "src/lib/ouro/cn.ts": "cn\n" };
  const record = { tag: "v1.3.242", tagCommit: "old", files: Object.fromEntries(Object.entries(installed).map(([path, text]) => [path, sha256(text)])) };
  const consumer = files({
    "components.json": JSON.stringify({ aliases: { components: "@/components", lib: "@/lib" } }),
    "tsconfig.json": JSON.stringify({ include: ["src/**/*"], compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    "package.json": `${JSON.stringify({ name: "site", type: "module", scripts: { "check:screens": "node lib/ouro/check/check.ts dist" }, ...(imports ? { imports } : {}) }, null, 2)}\n`,
    ".github/workflows/pages.yml": "jobs:\n  check:\n    steps:\n      - run: node lib/ouro/check/check.ts _site --sizes 390x844\n",
    "scripts/check-fades.mjs": "spawnSync(process.execPath, ['lib/ouro/check/fades.ts', 'src']);\n",
    "readme.md": "Run `node lib/ouro/check/check.ts dist` after a build.\n",
    "tests/fades.test.mjs": 'import { fades } from "../lib/ouro/check/fades.ts";\n',
    ...installed,
  });
  const ctx = { tarball: async (follows, tag) => (tag === "v1.3.242" ? previous : next), consumerFiles: async () => consumer };
  return { record, ctx, consumer, pin: { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" } };
}

/** The folder each Ouro AX shared file sits in after the update, and the one the package's `#ouro-ax/*` resolves to. */
function kitAndImport(update, consumer, pin) {
  const recorded = Object.keys(JSON.parse(update.files[pin.file]).files);
  const kit = [...new Set(recorded.filter((path) => /(^|\/)ouro\/ax\/[^/]+$/.test(path) && !path.startsWith("scripts/")).map((path) => `${dirname(path)}/`))];
  const pkg = JSON.parse((update.files["package.json"] ?? consumer.get("package.json")).toString());
  return { kit, resolves: pkg.imports["#ouro-ax/*"].replace(/^\.\//, "").replace(/\*$/, "") };
}

test("Ouro HX puts the Ouro AX shared files where the package's #ouro-ax import resolves, and the two agree", async () => {
  // No import yet: the kit moves from the root's lib/ to the app's lib folder, and the import added points there.
  const fresh = apartFixture();
  const update = await UPDATERS["hx-installed"](fresh.pin, JSON.stringify(fresh.record), RELEASES.web, fresh.ctx);
  assert.equal(update.files["lib/ouro/ax/command.ts"], null);
  assert.equal(update.files["src/lib/ouro/ax/command.ts"]?.toString(), "export const command = 2;\n");
  assert.deepEqual(kitAndImport(update, fresh.consumer, fresh.pin), { kit: ["src/lib/ouro/ax/"], resolves: "src/lib/ouro/ax/" });
  assert.ok(update.notes.includes("Moves `lib/ouro/ax/command.ts` to `src/lib/ouro/ax/command.ts`, where `#ouro-ax/*` resolves."));

  // The package already declares where the kit is: it stays there.
  const declared = apartFixture({ imports: { "#ouro-ax/*": "./lib/ouro/ax/*" } });
  const kept = await UPDATERS["hx-installed"](declared.pin, JSON.stringify(declared.record), RELEASES.web, declared.ctx);
  assert.equal(kept.files["lib/ouro/ax/command.ts"]?.toString(), "export const command = 2;\n");
  assert.equal(kept.files["src/lib/ouro/ax/command.ts"], undefined);
  assert.deepEqual(kitAndImport(kept, declared.consumer, declared.pin), { kit: ["lib/ouro/ax/"], resolves: "lib/ouro/ax/" });
  assert.deepEqual([...update.notes, ...kept.notes].flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
});

test("Ouro HX points the app's scripts and docs at a moved file, names a workflow line it cannot change, and leaves a forwarding file that runs the new one", async () => {
  const { record, ctx, consumer, pin } = apartFixture();
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  assert.equal(update.files["scripts/check-fades.mjs"]?.toString(), "spawnSync(process.execPath, ['scripts/ouro/check/fades.ts', 'src']);\n");
  assert.equal(update.files["readme.md"]?.toString(), "Run `node scripts/ouro/check/check.ts dist` after a build.\n");
  assert.equal(update.files["tests/fades.test.mjs"]?.toString(), 'import { fades } from "../scripts/ouro/check/fades.ts";\n', "a path relative to the file stays relative");
  assert.equal(update.files[".github/workflows/pages.yml"], undefined, "a workflow is not written");
  assert.ok(update.notes.includes("Ouro Current does not edit workflows, so change `.github/workflows/pages.yml:4` to `- run: node scripts/ouro/check/check.ts _site --sizes 390x844`."));
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
  assert.equal(update.files["packages/web/scripts/ouro/ax/xray.ts"].toString(), 'import { command } from "#ouro-ax/command.ts";\nexport const xray = "v2";\n');
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

test("a move reaches the update's commit as a deletion of the old copy, with the moved file and the package's fixes in the same tree", async () => {
  const { record, ctx, consumer } = moveFixture("");
  const repo = fakeRepo({ ...Object.fromEntries([...consumer].map(([path, bytes]) => [path, bytes.toString("utf8")])), ".github/ouro-hx-installed.json": JSON.stringify(record) });
  const kept = await keepRepo(repo.gh, "o/r", RELEASES, { tarball: ctx.tarball });
  assert.equal(kept.state, "pr");
  assert.equal(repo.fileAt(BRANCH, "src/lib/ouro/check/check.ts"), undefined, "the old copy is gone from the branch");
  assert.equal(repo.fileAt(BRANCH, "scripts/ouro/check/check.ts"), 'export const check = "v2";\n');
  assert.equal(repo.fileAt(BRANCH, "src/lib/ouro/ax/command.ts"), 'export const command = "v2";\n');
  assert.match(repo.fileAt(BRANCH, "package.json"), /"#ouro-ax\/\*": "\.\/src\/lib\/ouro\/ax\/\*"/);
  assert.equal(JSON.parse(repo.fileAt(BRANCH, ".github/ouro-hx-installed.json")).tag, "v1.3.187");
  assert.match(repo.pulls[0].body, /Moves `src\/lib\/ouro\/check\/check\.ts` to `scripts\/ouro\/check\/check\.ts`/);
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

  const stampFree = await UPDATERS["core-manifest"](pin, JSON.stringify(oldManifest), { ...RELEASES.core, tag: "v0.17.6" }, { ...asset, consumerFolder: folder("claims v1") });
  assert.ok(stampFree.notes.some((note) => /version stamp/.test(note)), "from core v0.17.6 on, projections need nothing generated again");
  assert.ok(!update.notes.some((note) => /version stamp/.test(note)));
  assert.deepEqual(stampFree.notes.flatMap((note) => lintMarkdown(`- ${note}`, { file: "pull request body" })), []);
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

test("the title names each release a pull request moves to", () => {
  assert.equal(title([{ follows: "apple" }], RELEASES), "Update to Ouro UI for Apple v0.9.0");
  assert.equal(title([{ follows: "web" }, { follows: "core" }, { follows: "web" }], RELEASES), "Update to Ouro UI core v0.15.0 and Ouro UI v1.3.187");
});

// ---- A GitHub in memory: one repository, its refs, commits, trees, blobs and pull requests ----------------

function fakeRepo(files, { mergeMethods = ["SQUASH"], latestRelease = null, name = "o/r", queued = () => false } = {}) {
  let next = 1;
  const id = () => `${(next++).toString(16).padStart(40, "0")}`;
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  const refs = new Map();
  const pulls = [];
  const calls = [];
  const blob = (content) => {
    const sha = sha256(content).slice(0, 40);
    blobs.set(sha, Buffer.from(content));
    return sha;
  };
  const tree = (entries) => {
    const sha = sha256(JSON.stringify([...entries].sort())).slice(0, 40);
    trees.set(sha, new Map(entries));
    return sha;
  };
  const root = tree(Object.entries(files).map(([path, text]) => [path, blob(text)]));
  const main = id();
  commits.set(main, { tree: root, parents: [] });
  refs.set("main", main);
  const ok = (data, status = 200) => ({ status, headers: new Map(), text: async () => JSON.stringify(data), arrayBuffer: async () => Buffer.from(JSON.stringify(data)) });
  const missing = () => ({ status: 404, headers: new Map(), text: async () => "Not Found" });
  const fetch = async (url, init) => {
    const path = url.replace("https://api.github.com/", "").replace(`repos/${name}`, "repos/o/r");
    const method = init.method;
    const input = init.body ? JSON.parse(init.body) : null;
    calls.push(`${method} ${path}`);
    let match;
    if (method === "GET" && path === "repos/o/r") return ok({ default_branch: "main", private: false, owner: { login: "o" } });
    if ((match = /^repos\/o\/r\/git\/ref\/heads\/(.+)$/.exec(path)) && method === "GET") {
      const name = decodeURIComponent(match[1]);
      return refs.has(name) ? ok({ object: { sha: refs.get(name) } }) : missing();
    }
    if ((match = /^repos\/o\/r\/git\/trees\/([^?]+)\?recursive=1$/.exec(path))) {
      const sha = commits.get(match[1])?.tree ?? match[1];
      return ok({ sha, truncated: false, tree: [...trees.get(sha)].map(([p, s]) => ({ path: p, type: "blob", sha: s })) });
    }
    if ((match = /^repos\/o\/r\/git\/blobs\/(.+)$/.exec(path)) && method === "GET") return ok({ content: blobs.get(match[1]).toString("base64") });
    if ((match = /^repos\/o\/r\/git\/commits\/(.+)$/.exec(path)) && method === "GET") {
      const commit = commits.get(match[1]);
      return ok({ sha: match[1], message: commit.message, tree: { sha: commit.tree }, parents: commit.parents.map((sha) => ({ sha })) });
    }
    if (path === "repos/o/r/git/blobs") return ok({ sha: blob(Buffer.from(input.content, "base64")) }, 201);
    if (path === "repos/o/r/git/trees") {
      const base = new Map(trees.get(input.base_tree));
      for (const entry of input.tree) {
        if (entry.sha === null) base.delete(entry.path);
        else base.set(entry.path, entry.sha);
      }
      return ok({ sha: tree([...base]) }, 201);
    }
    if (path === "repos/o/r/git/commits") {
      const sha = id();
      commits.set(sha, { tree: input.tree, parents: input.parents, message: input.message });
      return ok({ sha }, 201);
    }
    if (path === "repos/o/r/git/refs" && method === "POST") {
      refs.set(input.ref.replace("refs/heads/", ""), input.sha);
      return ok({}, 201);
    }
    if ((match = /^repos\/o\/r\/git\/refs\/heads\/(.+)$/.exec(path)) && method === "PATCH") {
      // GitHub's answer for the branch of a pull request in a merge queue.
      if (queued()) return { status: 422, headers: new Map(), text: async () => JSON.stringify({ message: "A pull request for this branch has been added to a merge queue. Branches that\nare queued for merging cannot be updated. To modify this branch, dequeue the\nassociated pull request.\n" }) };
      refs.set(match[1], input.sha);
      return ok({});
    }
    if ((match = /^repos\/o\/r\/contents\/([^?]+)\?ref=(.+)$/.exec(path)) && method === "GET") {
      const sha = trees.get(commits.get(match[2]).tree).get(decodeURIComponent(match[1]));
      return sha ? ok({ content: blobs.get(sha).toString("base64") }) : missing();
    }
    if ((match = /^repos\/o\/r\/tarball\/(.+)$/.exec(path)) && method === "GET") {
      const at = [...trees.get(commits.get(match[1]).tree)].map(([p, s]) => [p, blobs.get(s).toString("utf8")]);
      return { status: 200, headers: new Map(), arrayBuffer: async () => tarball(Object.fromEntries(at)) };
    }
    if (path === "repos/o/r/releases/latest") return latestRelease ? ok({ tag_name: latestRelease }) : missing();
    if (path.startsWith("repos/o/r/pulls?state=open")) return ok(pulls.filter((pr) => pr.state === "open"));
    if (path === "repos/o/r/pulls" && method === "POST") {
      const pr = { number: pulls.length + 1, node_id: `PR${pulls.length + 1}`, html_url: `https://example.test/pull/${pulls.length + 1}`, state: "open", title: input.title, body: input.body, head: input.head, autoMerge: null };
      pulls.push(pr);
      return ok(pr, 201);
    }
    if ((match = /^repos\/o\/r\/pulls\/(\d+)$/.exec(path)) && method === "GET") return ok(pulls[Number(match[1]) - 1]);
    if ((match = /^repos\/o\/r\/pulls\/(\d+)$/.exec(path)) && method === "PATCH") {
      const pr = pulls[Number(match[1]) - 1];
      Object.assign(pr, input);
      return ok(pr);
    }
    if (/^repos\/o\/r\/issues\/\d+\/comments$/.test(path)) return ok({}, 201);
    if (path === "graphql") {
      const pr = pulls.find((item) => item.node_id === input.variables.id);
      if (!mergeMethods.includes(input.variables.method)) return ok({ errors: [{ message: `Merge method ${input.variables.method.toLowerCase()} merging is not allowed on this repository` }] });
      pr.autoMerge = input.variables.method;
      pr.mergeCommit = { headline: input.variables.headline, body: input.variables.body };
      return ok({ data: { enablePullRequestAutoMerge: { clientMutationId: null } } });
    }
    throw new Error(`fake GitHub has no ${method} ${path}`);
  };
  const fileAt = (ref, path) => blobs.get(trees.get(commits.get(refs.get(ref)).tree).get(path))?.toString();
  return { fetch, gh: createGitHub({ token: "t", fetch, sleep: async () => {} }), commitTree: (sha) => commits.get(sha).tree, refs, pulls, calls, fileAt, setMain: (changes) => {
    const base = new Map(trees.get(commits.get(refs.get("main")).tree));
    for (const [path, text] of Object.entries(changes)) base.set(path, blob(text));
    const sha = id();
    commits.set(sha, { tree: tree([...base]), parents: [refs.get("main")] });
    refs.set("main", sha);
  } };
}

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
